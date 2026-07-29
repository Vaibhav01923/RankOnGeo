import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";
import { buildEventSeries } from "@/lib/analytics-series";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIVE_WINDOW_MS = 5 * 60 * 1000;
const ALLOWED_DAYS = [1, 7, 30, 90];

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

  // Web/LLM Analytics is a paid-plan perk. Ingestion checks only
  // dodo_subscription_id (see findPaidBrandBySiteKey), not the full lapsed-
  // subscriber rule, so a cancelled/grace-exceeded owner can still have real
  // rows on file — redact using the same requiresPaywall rule used elsewhere
  // so this route can't hand those out even though ingestion itself doesn't
  // stop for that case.
  const isFree = await requiresPaywall(db, access.ownerId);
  if (isFree) {
    return NextResponse.json({
      domain: brand.domain,
      siteKey: brand.site_key,
      isFree,
      stats: { liveVisitors: 0, visitors: 0, pageviews: 0, avgDurationSeconds: 0, bounceRate: 0, newVisitors: 0, returningVisitors: 0 },
      live: { pages: [], referrers: [] },
      topReferrers: [],
      topPages: [],
      pagesBreakdown: [],
      countries: [],
      devices: [],
      browsers: [],
      operatingSystems: [],
      topCampaigns: [],
      series: [],
    });
  }

  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const { data: rows } = await db
    .from("web_visits")
    .select("visitor_id, session_id, path, referrer, created_at, geo_country, device_type, browser, os, utm_source, utm_medium, utm_campaign")
    .eq("brand_id", brandId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const visits = rows ?? [];
  const liveCutoff = Date.now() - LIVE_WINDOW_MS;
  const liveVisits = visits.filter((v) => new Date(v.created_at).getTime() >= liveCutoff);

  const liveVisitors = new Set(liveVisits.map((v) => v.visitor_id)).size;
  const windowVisitorIds = [...new Set(visits.map((v) => v.visitor_id))];
  const visitors = windowVisitorIds.length;
  const pageviews = visits.length;

  // New vs. returning — a visitor is "returning" if this same visitor_id has
  // a row for this brand from before the selected window. One bounded,
  // indexed query (web_visits_brand_visitor_created_idx) scoped to only the
  // IDs already in this window, not a full-history scan.
  let returningVisitors = 0;
  if (windowVisitorIds.length > 0) {
    const { data: priorRows } = await db
      .from("web_visits")
      .select("visitor_id")
      .eq("brand_id", brandId)
      .in("visitor_id", windowVisitorIds)
      .lt("created_at", since);
    returningVisitors = new Set((priorRows ?? []).map((r) => r.visitor_id)).size;
  }
  const newVisitors = visitors - returningVisitors;

  // entryPath tracks each session's first (earliest-timestamp) page, needed
  // for the per-page bounce/duration breakdown below. Rows arrive newest-
  // first, so this can't just be "the first row seen in the loop" — it has
  // to follow the running min-timestamp comparison itself.
  const bySession = new Map<string, { count: number; min: number; max: number; entryPath: string }>();
  for (const v of visits) {
    const t = new Date(v.created_at).getTime();
    const s = bySession.get(v.session_id);
    if (!s) bySession.set(v.session_id, { count: 1, min: t, max: t, entryPath: v.path });
    else {
      s.count++;
      if (t < s.min) { s.min = t; s.entryPath = v.path; }
      s.max = Math.max(s.max, t);
    }
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
  const countBy = (rows: typeof visits, key: (v: (typeof visits)[number]) => string) => {
    const m = new Map<string, number>();
    for (const v of rows) { const k = key(v); m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  };

  // Top referrers/pages across the whole selected window (not just the live
  // 5-min slice above) — this is what answers "how much traffic is my X/ad
  // campaign actually sending", which the live view is too narrow to show.
  const topReferrerCounts = countBy(visits, (v) => referrerHost(v.referrer));
  const topPageCounts = countBy(visits, (v) => v.path);

  // Per-page bounce rate / avg duration — attributed to each session's ENTRY
  // page (the page it started on), not per-pageview time-on-page.
  const perPage = new Map<string, { sessions: number; bounced: number; totalDuration: number }>();
  for (const s of sessions) {
    const p = perPage.get(s.entryPath) ?? { sessions: 0, bounced: 0, totalDuration: 0 };
    p.sessions++;
    if (s.count === 1) p.bounced++;
    p.totalDuration += (s.max - s.min) / 1000;
    perPage.set(s.entryPath, p);
  }
  const pagesBreakdown = [...perPage.entries()]
    .map(([path, p]) => ({
      path,
      pageviews: topPageCounts.get(path) ?? 0,
      bounceRate: p.sessions ? Math.round((p.bounced / p.sessions) * 100) : 0,
      avgDurationSeconds: p.sessions ? Math.round(p.totalDuration / p.sessions) : 0,
    }))
    .sort((a, b) => b.pageviews - a.pageviews)
    .slice(0, 10);

  const countries = toSortedList(countBy(visits, (v) => v.geo_country ?? "Unknown")).slice(0, 10);
  const devices = toSortedList(countBy(visits, (v) => v.device_type ?? "Unknown"));
  const browsers = toSortedList(countBy(visits, (v) => v.browser ?? "Unknown")).slice(0, 8);
  const operatingSystems = toSortedList(countBy(visits, (v) => v.os ?? "Unknown")).slice(0, 8);

  // Top campaigns — skip rows with no UTM data at all so organic/direct
  // traffic doesn't dilute this list with a fake "(not set)" campaign.
  const campaignCounts = new Map<string, { source: string; medium: string; campaign: string; count: number }>();
  for (const v of visits) {
    if (!v.utm_source && !v.utm_medium && !v.utm_campaign) continue;
    const source = v.utm_source ?? "(not set)";
    const medium = v.utm_medium ?? "(not set)";
    const campaign = v.utm_campaign ?? "(not set)";
    const key = `${source}|${medium}|${campaign}`;
    const existing = campaignCounts.get(key);
    if (existing) existing.count++;
    else campaignCounts.set(key, { source, medium, campaign, count: 1 });
  }
  const topCampaigns = [...campaignCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10);

  return NextResponse.json({
    domain: brand.domain,
    siteKey: brand.site_key,
    isFree,
    stats: { liveVisitors, visitors, pageviews, avgDurationSeconds, bounceRate, newVisitors, returningVisitors },
    live: { pages: toSortedList(pageCounts), referrers: toSortedList(referrerCounts) },
    topReferrers: toSortedList(topReferrerCounts).slice(0, 10),
    topPages: toSortedList(topPageCounts).slice(0, 10),
    pagesBreakdown,
    countries,
    devices,
    browsers,
    operatingSystems,
    topCampaigns,
    series: buildEventSeries(visits.map((v) => v.created_at), days),
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
