import { decryptToken, fetchWindow, getAccessToken, gscConfigured } from "@/lib/gsc";
import { requiresPaywall } from "@/lib/plan-limits";
import { periodRange, type PeriodRange, type Report, type ReportPeriod } from "@/lib/report";
import { buildReport, type RawBotVisit, type RawVisit, type ReportRaw } from "@/lib/report-build";

// Gathers everything a report needs from the database and Search Console, then hands
// it to buildReport. Reads only; it never writes.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 1000;
// Supabase returns at most 1000 rows per request, so busy sites are read in pages.
const MAX_ROWS = 60000;

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data } = await build(from, from + PAGE - 1);
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// Google trails real time by about 2 days: a window can't end after that.
export function gscWindow(range: PeriodRange, now = Date.now()): { start: string; end: string } {
  const lastDay = Date.parse(range.to) - DAY_MS;
  return { start: day(Date.parse(range.from)), end: day(Math.min(lastDay, now - 2 * DAY_MS)) };
}

async function collectSearch(db: Db, brandId: string, range: PeriodRange, now: number): Promise<ReportRaw["gsc"]> {
  if (!gscConfigured()) return null;
  const { data: conn } = await db.from("gsc_connections").select("refresh_token_enc, site_url").eq("brand_id", brandId).maybeSingle();
  if (!conn?.site_url) return null;
  const refresh = decryptToken(conn.refresh_token_enc);
  const token = refresh ? await getAccessToken(refresh) : null;
  if (!token?.ok) return { current: null, previous: null };
  const cur = gscWindow(range, now);
  const prevRange = { ...range, from: range.prevFrom, to: range.prevTo };
  const prev = gscWindow(prevRange, now);
  const [current, previous] = await Promise.all([fetchWindow(token.token, conn.site_url, cur.start, cur.end), fetchWindow(token.token, conn.site_url, prev.start, prev.end)]);
  return {
    current: current ? { totals: current.totals, queries: current.queries.map((q) => ({ label: q.label, clicks: q.clicks, impressions: q.impressions, position: q.position })) } : null,
    previous: previous ? { clicks: previous.totals.clicks, impressions: previous.totals.impressions, position: previous.totals.position } : null,
  };
}

export async function collectReportRaw(db: Db, brand: { id: string; name: string; domain: string; ownerId: string }, range: PeriodRange, now = Date.now()): Promise<ReportRaw> {
  const brandId = brand.id;
  const free = await requiresPaywall(db, brand.ownerId);

  // Scans up to the end of the period, newest first: the latest is "the score", the one before it the comparison.
  const { data: runs } = await db.from("scan_runs").select("id, created_at, overall_score").eq("brand_id", brandId).lt("created_at", range.to).order("created_at", { ascending: false }).limit(200);
  const scanRuns = (runs ?? []) as ReportRaw["scanRuns"];
  const runIds = scanRuns.slice(0, 2).map((r) => r.id);

  const rowsFor = async (runId: string | undefined) => {
    if (!runId) return [];
    const { data } = await db.from("scan_results").select("prompt_id, prompt_text, engine, response, brand_mentioned, competitor_mentions").eq("scan_run_id", runId);
    return data ?? [];
  };

  const [engineScores, latestRows, previousRows, promptsRes, publishedRes, prevPublished, drafts, allPublished, settingsRes, queueRes, lastPost, engage, gsc, visitsRows, botRows] = await Promise.all([
    runIds.length ? db.from("visibility_scores").select("scan_run_id, engine, score").in("scan_run_id", runIds).then((r: { data: unknown[] | null }) => r.data ?? []) : Promise.resolve([]),
    rowsFor(scanRuns[0]?.id),
    rowsFor(scanRuns[1]?.id),
    db.from("tracked_prompts").select("id", { count: "exact", head: true }).eq("brand_id", brandId).neq("status", "paused"),
    db.from("articles").select("id, title, keyword, published_url, published_at, source").eq("brand_id", brandId).eq("status", "published").gte("published_at", range.from).lt("published_at", range.to).order("published_at", { ascending: false }).limit(100),
    db.from("articles").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("status", "published").gte("published_at", range.prevFrom).lt("published_at", range.prevTo),
    db.from("articles").select("id", { count: "exact", head: true }).eq("brand_id", brandId).neq("status", "published").gte("created_at", range.from).lt("created_at", range.to),
    db.from("articles").select("id", { count: "exact", head: true }).eq("brand_id", brandId).eq("status", "published").lt("published_at", range.to),
    db.from("autopilot_settings").select("enabled, posts_per_week").eq("brand_id", brandId).maybeSingle(),
    db.from("autopilot_topics").select("keyword, source, created_at, volume, position").eq("brand_id", brandId).eq("status", "queued"),
    db.from("articles").select("created_at").eq("brand_id", brandId).eq("source", "autopilot").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("engage_tasks").select("service_type, status, upvotes_ordered, credits_charged").eq("brand_id", brandId).gte("created_at", range.from).lt("created_at", range.to).limit(1000),
    collectSearch(db, brandId, range, now).catch(() => null),
    free
      ? Promise.resolve([] as RawVisit[])
      : fetchAll<RawVisit>((from, to) => db.from("web_visits").select("path, visitor_id, referrer, utm_source, created_at").eq("brand_id", brandId).gte("created_at", range.prevFrom).lt("created_at", range.to).order("created_at", { ascending: true }).range(from, to)),
    free
      ? Promise.resolve([] as RawBotVisit[])
      : fetchAll<RawBotVisit>((from, to) => db.from("bot_visits").select("bot_name, path, created_at").eq("brand_id", brandId).gte("created_at", range.prevFrom).lt("created_at", range.to).order("created_at", { ascending: true }).range(from, to)),
  ]);

  return {
    now,
    brand: { id: brand.id, name: brand.name, domain: brand.domain },
    range,
    scanRuns,
    engineScores,
    latestRows,
    previousRows,
    promptsTracked: promptsRes.count ?? 0,
    articles: {
      published: publishedRes.data ?? [],
      previousPublishedCount: prevPublished.count ?? 0,
      draftsWritten: drafts.count ?? 0,
      publishedAllTime: allPublished.count ?? 0,
    },
    autopilot: {
      enabled: !!settingsRes.data?.enabled,
      postsPerWeek: settingsRes.data?.posts_per_week ?? null,
      lastPostAt: lastPost.data?.created_at ?? null,
      queue: queueRes.data ?? [],
    },
    visits: { available: !free, rows: visitsRows },
    bots: { available: !free, rows: botRows },
    gsc,
    engage: engage.data ?? [],
  };
}

export async function collectReport(db: Db, brand: { id: string; name: string; domain: string; ownerId: string }, period: ReportPeriod, offset = 0, now = Date.now()): Promise<Report> {
  const range = periodRange(period, offset, now);
  return buildReport(await collectReportRaw(db, brand, range, now));
}
