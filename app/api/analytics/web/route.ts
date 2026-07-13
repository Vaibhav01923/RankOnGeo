import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const ALLOWED_DAYS = [7, 30, 90];

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id, domain, site_key");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  const brand = access.brand as unknown as { id: string; domain: string; site_key: string };

  // Web/LLM Analytics is a paid-plan perk — ingestion is already blocked
  // server-side for free-tier brands, so there's nothing to hide here, just
  // an isFree flag so the dashboard can overlay the upgrade prompt. The flag
  // reflects the workspace owner's plan, not the acting member's.
  const { data: userPlan } = await db.from("user_plans").select("dodo_subscription_id").eq("user_id", access.ownerId).maybeSingle();
  const isFree = !userPlan?.dodo_subscription_id;

  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const { data: rows } = await db
    .from("web_visits")
    .select("visitor_id, session_id, path, referrer, created_at")
    .eq("brand_id", brandId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const visits = rows ?? [];
  const liveCutoff = Date.now() - LIVE_WINDOW_MS;
  const liveVisits = visits.filter((v) => new Date(v.created_at).getTime() >= liveCutoff);

  const liveVisitors = new Set(liveVisits.map((v) => v.visitor_id)).size;
  const visitors = new Set(visits.map((v) => v.visitor_id)).size;
  const pageviews = visits.length;

  const bySession = new Map<string, { count: number; min: number; max: number }>();
  for (const v of visits) {
    const t = new Date(v.created_at).getTime();
    const s = bySession.get(v.session_id);
    if (!s) bySession.set(v.session_id, { count: 1, min: t, max: t });
    else { s.count++; s.min = Math.min(s.min, t); s.max = Math.max(s.max, t); }
  }
  const sessions = [...bySession.values()];
  const bounceRate = sessions.length ? Math.round((sessions.filter((s) => s.count === 1).length / sessions.length) * 100) : 0;
  const avgDurationSeconds = sessions.length
    ? Math.round(sessions.reduce((sum, s) => sum + (s.max - s.min) / 1000, 0) / sessions.length)
    : 0;

  // "Live" breakdown — pages/referrers active in the last 5 minutes, matching
  // the "Live Visitor Details" framing (not an all-time top-pages list).
  const pageCounts = new Map<string, number>();
  const referrerCounts = new Map<string, number>();
  for (const v of liveVisits) {
    pageCounts.set(v.path, (pageCounts.get(v.path) ?? 0) + 1);
    const host = referrerHost(v.referrer);
    referrerCounts.set(host, (referrerCounts.get(host) ?? 0) + 1);
  }
  const toSortedList = (m: Map<string, number>) =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  // Top referrers across the whole selected window (not just the live 5-min
  // slice above) — this is what answers "how much traffic is my X/ad
  // campaign actually sending", which the live view is too narrow to show.
  const topReferrerCounts = new Map<string, number>();
  for (const v of visits) {
    const host = referrerHost(v.referrer);
    topReferrerCounts.set(host, (topReferrerCounts.get(host) ?? 0) + 1);
  }

  return NextResponse.json({
    domain: brand.domain,
    siteKey: brand.site_key,
    isFree,
    stats: { liveVisitors, visitors, pageviews, avgDurationSeconds, bounceRate },
    live: { pages: toSortedList(pageCounts), referrers: toSortedList(referrerCounts) },
    topReferrers: toSortedList(topReferrerCounts).slice(0, 10),
  });
}

function referrerHost(referrer: string | null): string {
  if (!referrer) return "Direct";
  try {
    let host = new URL(referrer).hostname.replace(/^www\./, "");
    // t.co (Twitter/X's link shortener, what ad clicks actually arrive
    // through) and the legacy twitter.com domain are the same traffic
    // source as x.com — merge them so campaign counts aren't split three ways.
    if (host === "t.co" || host === "twitter.com") host = "x.com";
    return host;
  } catch {
    return "Direct";
  }
}
