import { aiEngineForVisit, referrerHost } from "@/lib/ai-referrers";
import { summarizeArticlePerformance, type PerfArticle } from "@/lib/article-performance";
import { scheduleTopics, sortTopicsForPicking } from "@/lib/autopilot-rules";
import { ENGINE_NAMES, gapsFromScanRows, type GapScanRow } from "@/lib/gaps";
import {
  buildActivity,
  buildHeadline,
  makeDelta,
  type EngineScore,
  type PeriodRange,
  type Report,
  type ReportArticle,
} from "@/lib/report";

// Raw rows in, Report out. No I/O: lib/report-data.ts fetches the rows.

export type RawVisit = { path: string; visitor_id: string; referrer: string | null; utm_source: string | null; created_at: string };
export type RawBotVisit = { bot_name: string; path: string; created_at: string };
export type RawEngageTask = { service_type: string | null; status: string | null; upvotes_ordered: number | null; credits_charged: number | null };

export type ReportRaw = {
  now: number;
  brand: { id: string; name: string; domain: string };
  range: PeriodRange;
  // Newest first; only scans that started before the end of the period.
  scanRuns: { id: string; created_at: string; overall_score: number }[];
  engineScores: { scan_run_id: string; engine: string; score: number }[];
  latestRows: GapScanRow[];
  previousRows: GapScanRow[];
  promptsTracked: number;
  articles: {
    published: (PerfArticle & { source: string | null })[];
    previousPublishedCount: number;
    draftsWritten: number;
    publishedAllTime: number;
  };
  autopilot: {
    enabled: boolean;
    postsPerWeek: number | null;
    lastPostAt: string | null;
    queue: { keyword: string; source: string; created_at: string; volume: number | null; position: number | null }[];
  };
  // Covers the period and the one before it. `available` is false on the free plan.
  visits: { available: boolean; rows: RawVisit[] };
  bots: { available: boolean; rows: RawBotVisit[] };
  // null = Search Console isn't connected. `current` null = connected but Google didn't answer.
  gsc: null | {
    current: { totals: { clicks: number; impressions: number; ctr: number; position: number }; queries: { label: string; clicks: number; impressions: number; position: number }[] } | null;
    previous: { clicks: number; impressions: number; position: number } | null;
  };
  engage: RawEngageTask[];
};

const inRange = (iso: string, from: string, to: string) => iso >= from && iso < to;

function topN<T extends string>(items: T[], n: number): { label: T; count: number }[] {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label))).slice(0, n);
}

export function buildReport(raw: ReportRaw): Report {
  const { range } = raw;

  // ---- AI visibility -------------------------------------------------------
  const latest = raw.scanRuns[0] ?? null;
  const before = raw.scanRuns[1] ?? null;
  const scoresFor = (runId: string | undefined) => new Map(raw.engineScores.filter((s) => s.scan_run_id === runId).map((s) => [s.engine, s.score]));
  const latestByEngine = scoresFor(latest?.id);
  const beforeByEngine = scoresFor(before?.id);
  const engines: EngineScore[] = [...latestByEngine.entries()]
    .map(([engine, score]) => {
      const previous = beforeByEngine.get(engine) ?? null;
      return { engine, label: ENGINE_NAMES[engine] ?? engine, score, previous, change: previous === null ? null : score - previous };
    })
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));

  const gapsNow = gapsFromScanRows(raw.latestRows);
  const gapsPrevious = before && raw.previousRows.length ? gapsFromScanRows(raw.previousRows).length : null;
  const competitorPrompts = new Map<string, Set<string>>();
  for (const r of raw.latestRows) {
    for (const c of r.competitor_mentions ?? []) {
      const set = competitorPrompts.get(c.name) ?? new Set<string>();
      set.add(r.prompt_id ?? r.prompt_text);
      competitorPrompts.set(c.name, set);
    }
  }
  const topCompetitors = [...competitorPrompts.entries()]
    .map(([name, set]) => ({ name, prompts: set.size }))
    .sort((a, b) => b.prompts - a.prompts || a.name.localeCompare(b.name))
    .slice(0, 3);
  const scansInPeriod = raw.scanRuns.filter((r) => inRange(r.created_at, range.from, range.to)).length;

  // ---- traffic (this period vs the previous one) ---------------------------
  const cur = raw.visits.rows.filter((v) => inRange(v.created_at, range.from, range.to));
  const prev = raw.visits.rows.filter((v) => inRange(v.created_at, range.prevFrom, range.prevTo));
  const aiSourcesOf = (rows: RawVisit[]) => rows.map((v) => aiEngineForVisit(referrerHost(v.referrer), v.utm_source)).filter((e): e is string => !!e);
  const curAi = aiSourcesOf(cur);
  const prevAi = aiSourcesOf(prev);
  const visitorsOf = (rows: RawVisit[]) => new Set(rows.map((v) => v.visitor_id)).size;

  // ---- articles ------------------------------------------------------------
  const perf = summarizeArticlePerformance(raw.articles.published, cur);
  const perfById = new Map(perf.articles.map((a) => [a.id, a]));
  const published: ReportArticle[] = [...raw.articles.published]
    .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
    .map((a) => ({
      id: a.id,
      title: a.title,
      keyword: a.keyword,
      url: a.published_url,
      publishedAt: a.published_at,
      source: a.source === "autopilot" ? "autopilot" : "manual",
      views: perfById.get(a.id)?.views ?? 0,
      aiVisits: perfById.get(a.id)?.aiVisits ?? 0,
    }));

  let upcoming: Report["articles"]["upcoming"] = [];
  if (raw.autopilot.enabled) {
    const queue = sortTopicsForPicking(raw.autopilot.queue).slice(0, 5);
    const times = scheduleTopics({ count: queue.length, lastPostAt: raw.autopilot.lastPostAt, postsPerWeek: raw.autopilot.postsPerWeek ?? 2, now: raw.now });
    upcoming = queue.map((t, i) => ({ keyword: t.keyword, kind: t.source === "gap" ? "prompt" : "keyword", scheduledAt: times[i] ? new Date(times[i]).toISOString() : null }));
  }

  // ---- crawlers ------------------------------------------------------------
  const botCur = raw.bots.rows.filter((b) => inRange(b.created_at, range.from, range.to));
  const botPrev = raw.bots.rows.filter((b) => inRange(b.created_at, range.prevFrom, range.prevTo));

  // ---- Search Console ------------------------------------------------------
  const g = raw.gsc;
  const gscCur = g?.current ?? null;
  const search: Report["search"] = {
    connected: !!g,
    clicks: gscCur ? makeDelta(gscCur.totals.clicks, g?.previous ? g.previous.clicks : null) : null,
    impressions: gscCur ? makeDelta(gscCur.totals.impressions, g?.previous ? g.previous.impressions : null) : null,
    ctr: gscCur ? gscCur.totals.ctr : null,
    position: gscCur && gscCur.totals.impressions > 0 ? gscCur.totals.position : null,
    previousPosition: g?.previous && g.previous.impressions > 0 ? g.previous.position : null,
    topQueries: gscCur?.queries ?? [],
    note: !g ? "Connect Google Search Console to see your Google clicks, impressions and position here." : gscCur ? "Google's numbers trail real time by about 2 days, so the last days of a period can be missing." : "Google didn't answer when this report was made.",
  };

  // ---- Reddit --------------------------------------------------------------
  const isUpvote = (t: RawEngageTask) => (t.service_type ?? "").endsWith("upvote");
  const reddit: Report["reddit"] = {
    tasks: raw.engage.length,
    completed: raw.engage.filter((t) => t.status === "completed").length,
    upvotes: raw.engage.filter(isUpvote).reduce((s, t) => s + (t.upvotes_ordered ?? 0), 0),
    comments: raw.engage.filter((t) => t.service_type === "create_post" || t.service_type === "comment").length,
    creditsSpent: raw.engage.reduce((s, t) => s + Number(t.credits_charged ?? 0), 0),
  };

  const base = {
    period: range.period,
    range,
    brand: raw.brand,
    generatedAt: new Date(raw.now).toISOString(),
    visibility: {
      score: latest ? latest.overall_score : null,
      previous: before ? before.overall_score : null,
      change: latest && before ? latest.overall_score - before.overall_score : null,
      scannedInPeriod: scansInPeriod > 0,
      scans: scansInPeriod,
      lastScanAt: latest ? latest.created_at : null,
      engines,
      promptsTracked: raw.promptsTracked,
      gapsNow: gapsNow.length,
      gapsPrevious,
      topGaps: gapsNow.slice(0, 3).map((x) => ({ prompt: x.promptText, engines: x.engines.map((e) => ENGINE_NAMES[e] ?? e), competitor: x.topCompetitor })),
      topCompetitors,
    },
    articles: {
      publishedCount: published.length,
      previousPublishedCount: raw.articles.previousPublishedCount,
      published,
      draftsWritten: raw.articles.draftsWritten,
      publishedAllTime: raw.articles.publishedAllTime,
      upcoming,
      autopublishOn: raw.autopilot.enabled,
      postsPerWeek: raw.autopilot.postsPerWeek,
    },
    traffic: {
      available: raw.visits.available,
      pageviews: makeDelta(cur.length, prev.length),
      visitors: makeDelta(visitorsOf(cur), visitorsOf(prev)),
      aiVisits: makeDelta(curAi.length, prevAi.length),
      aiSources: topN(curAi, 5),
      topPages: topN(cur.map((v) => v.path), 5).map((x) => ({ path: x.label, views: x.count })),
      topReferrers: topN(cur.map((v) => referrerHost(v.referrer)), 5),
    },
    crawlers: {
      available: raw.bots.available,
      total: makeDelta(botCur.length, botPrev.length),
      byBot: topN(botCur.map((b) => b.bot_name), 6),
      topPages: topN(botCur.map((b) => b.path), 5).map((x) => ({ path: x.label, count: x.count })),
    },
    search,
    reddit,
  };
  return { ...base, headline: buildHeadline(base), activity: buildActivity(base) };
}
