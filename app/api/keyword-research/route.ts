import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { buildKeywordList, normalizeKeyword } from "@/lib/keyword-list";
import { scheduleTopics, sortTopicsForPicking } from "@/lib/autopilot-rules";
import { findKeywordOpportunities, CACHE_DAYS, type KeywordBrand } from "@/lib/keyword-opportunities";
import { syncResearchTopics } from "@/lib/keyword-research";

export const maxDuration = 60;

const BRAND_COLUMNS = "id, user_id, name, niche, description, competitors, target_audience";

// The Keywords tab's data: the keywords buyers search for (with monthly volume),
// merged with what Autopilot has queued and which articles already exist, so each
// keyword shows whether something has been published to rank for it.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  const [{ data: scan }, { data: topics }, { data: articles }, { data: settings }, { data: lastPost }] = await Promise.all([
    admin.from("keyword_opportunity_scans").select("keywords, volume_available, created_at").eq("brand_id", brandId).maybeSingle(),
    admin.from("autopilot_topics").select("keyword, volume, source, status, created_at").eq("brand_id", brandId),
    admin.from("articles").select("id, title, keyword, status, published_url").eq("brand_id", brandId),
    admin.from("autopilot_settings").select("enabled, posts_per_week, publish_mode").eq("brand_id", brandId).maybeSingle(),
    admin.from("articles").select("created_at").eq("brand_id", brandId).eq("source", "autopilot").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const built = buildKeywordList({ research: (scan?.keywords ?? []) as { keyword: string; volume: number | null }[], topics: topics ?? [], articles: articles ?? [] });

  // While auto-publishing is on, every queued keyword gets the time its article
  // is expected to go out, in the order Autopilot will actually write them.
  // Off means nothing is scheduled, so "queued" isn't shown as if it were.
  const enabled = !!settings?.enabled;
  const postsPerWeek = settings?.posts_per_week ?? 2;
  const queue = sortTopicsForPicking((topics ?? []).filter((t) => t.status === "queued"));
  const times = enabled ? scheduleTopics({ count: queue.length, lastPostAt: lastPost?.created_at ?? null, postsPerWeek }) : [];
  const scheduleByKeyword = new Map(queue.map((t, i) => [normalizeKeyword(t.keyword), { scheduledAt: times[i] ? new Date(times[i]).toISOString() : null, queueIndex: i }]));

  const withSchedule = built.map((r) => {
    const sch = enabled && r.status === "queued" ? scheduleByKeyword.get(r.keyword) : undefined;
    return { ...r, scheduledAt: sch?.scheduledAt ?? null, queueIndex: sch?.queueIndex ?? null };
  });
  // Upcoming articles first, in the order they will be written; everything else by volume as before.
  const rows = enabled
    ? [...withSchedule.filter((r) => r.scheduledAt), ...withSchedule.filter((r) => !r.scheduledAt)].sort((a, b) => (a.queueIndex ?? Infinity) - (b.queueIndex ?? Infinity) || (b.volume ?? -1) - (a.volume ?? -1))
    : withSchedule;
  const researchedAt = scan?.created_at ?? null;
  return NextResponse.json({
    keywords: rows,
    hasResearch: !!scan,
    volumeAvailable: scan ? !!scan.volume_available : false,
    researchedAt,
    // Refreshing pays for a fresh volume lookup, so it isn't offered until the saved list is a week old.
    canRefresh: !researchedAt || Date.now() - new Date(researchedAt).getTime() > CACHE_DAYS * 24 * 60 * 60 * 1000,
    autopilot: {
      enabled,
      postsPerWeek,
      publishMode: settings?.publish_mode ?? "publish",
      nextPostAt: times[0] ? new Date(times[0]).toISOString() : null,
    },
    summary: {
      total: rows.length,
      published: rows.filter((r) => r.status === "published").length,
      // "Up next" only counts while auto-publishing is actually on.
      inProgress: rows.filter((r) => r.status === "draft" || (enabled && r.status === "queued")).length,
    },
  });
}

// Builds (or rebuilds, once the saved list is a week old) the keyword research
// for a brand, then hands the keywords to Autopilot as its writing queue.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await req.json().catch(() => ({}));
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await requireBrandAccess(db, user.id, brandId, BRAND_COLUMNS);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  if (await requiresPaywall(admin, access.ownerId)) return NextResponse.json({ error: "Keyword research is part of the paid plan.", reason: "upgrade" }, { status: 402 });
  // A paid volume lookup each time it's called; a stuck button must not run up the bill.
  if (!(await checkRateLimit("keyword-research", brandId, 3, 24 * 60 * 60))) {
    return NextResponse.json({ error: "Keyword research was already run for this site today." }, { status: 429 });
  }

  try {
    const brand = access.brand as unknown as KeywordBrand;
    const result = await findKeywordOpportunities(brand, admin, { allowLookup: async () => true });
    await syncResearchTopics(admin, brandId, result.keywords);
    return NextResponse.json({ ok: true, count: result.keywords.length, volumeAvailable: result.volumeAvailable });
  } catch (e) {
    console.error("[keyword-research] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't find keywords right now. Please try again." }, { status: 500 });
  }
}
