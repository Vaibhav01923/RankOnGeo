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

  // See app/api/analytics/web/route.ts — requiresPaywall also catches
  // cancelled/grace-exceeded owners that the ingestion-side check misses.
  const isFree = await requiresPaywall(db, access.ownerId);
  if (isFree) {
    return NextResponse.json({
      domain: brand.domain,
      siteKey: brand.site_key,
      isFree,
      stats: { liveBots: 0, botPageviews: 0 },
      breakdown: [],
      live: { pages: [], bots: [] },
      series: [],
    });
  }

  const since = new Date(Date.now() - days * DAY_MS).toISOString();
  const { data: rows } = await db
    .from("bot_visits")
    .select("bot_name, path, created_at")
    .eq("brand_id", brandId)
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  const visits = rows ?? [];
  const liveCutoff = Date.now() - LIVE_WINDOW_MS;
  const liveVisits = visits.filter((v) => new Date(v.created_at).getTime() >= liveCutoff);

  const liveBots = new Set(liveVisits.map((v) => v.bot_name)).size;
  const botPageviews = visits.length;

  const byBot: Record<string, number> = {};
  for (const v of visits) byBot[v.bot_name] = (byBot[v.bot_name] ?? 0) + 1;

  const pageCounts = new Map<string, number>();
  const botCounts = new Map<string, number>();
  for (const v of liveVisits) {
    pageCounts.set(v.path, (pageCounts.get(v.path) ?? 0) + 1);
    botCounts.set(v.bot_name, (botCounts.get(v.bot_name) ?? 0) + 1);
  }
  const toSortedList = (m: Map<string, number>) =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  return NextResponse.json({
    domain: brand.domain,
    siteKey: brand.site_key,
    isFree,
    stats: { liveBots, botPageviews },
    breakdown: Object.entries(byBot).map(([botName, count]) => ({ botName, count })).sort((a, b) => b.count - a.count),
    live: { pages: toSortedList(pageCounts), bots: toSortedList(botCounts) },
    series: buildEventSeries(visits.map((v) => v.created_at), days),
  });
}
