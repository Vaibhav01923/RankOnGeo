import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { checkRateLimit } from "@/lib/rate-limit";
import { findRedditOpportunities, RedditOpportunityBrand } from "@/lib/reddit-opportunities";

// Same pipeline as the onboarding wizard's Reddit step (one OpenAI mini call
// for ideas, one more for relevance verification, plus parallel Reddit
// fetches) — this is the dashboard's Reddit Marketing tab re-running it
// on-demand for an already-onboarded brand.
export const maxDuration = 60;

// reddit_opportunity_scans has no RLS policies (like `admins`) — every
// access goes through the service-role client here, after requireBrandAccess
// has already verified the caller owns/works on this brand.
async function loadCachedScan(brandId: string) {
  const { data } = await serverClient()
    .from("reddit_opportunity_scans")
    .select("threads, suggested_posts, total_found, scanned_at")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!data) return null;
  return {
    threads: data.threads ?? [],
    suggestedPosts: data.suggested_posts ?? [],
    totalFound: data.total_found ?? 0,
    scannedAt: data.scanned_at as string,
  };
}

// GET — the tab's initial load: show whatever was found last time (if
// anything) instantly, with no OpenAI/Reddit calls, instead of forcing a
// fresh expensive scan (and the "looks like a blank new page" reload every
// time) just to redisplay what's already known.
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId, "id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const cached = await loadCachedScan(brandId);
  if (!cached) return NextResponse.json({ cached: false });
  return NextResponse.json({ cached: true, ...cached });
}

export async function POST(req: NextRequest) {
  const { brandId } = await req.json().catch(() => ({}));
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Signed-in, already-paying usage of the same expensive pipeline the
  // onboarding wizard rate-limits — same bucket name so a user who scans
  // both from onboarding and the dashboard shares one limit rather than
  // getting double the calls.
  const rateLimitOk = await checkRateLimit("reddit-opportunities", user.id, 8, 3600);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Too many requests — please try again in a bit." }, { status: 429 });
  }

  const access = await requireBrandAccess(db, user.id, brandId, "id, name, niche, description, competitors, target_audience");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const brand = access.brand as unknown as RedditOpportunityBrand;
  const result = await findRedditOpportunities({ brand, writeDb: db, userId: user.id });

  try {
    await serverClient()
      .from("reddit_opportunity_scans")
      .upsert(
        {
          brand_id: brandId,
          threads: result.threads,
          suggested_posts: result.suggestedPosts,
          total_found: result.totalFound,
          scanned_at: new Date().toISOString(),
        },
        { onConflict: "brand_id" }
      );
  } catch (e) {
    console.error("[reddit/opportunities] failed to cache scan", e);
  }

  return NextResponse.json({ cached: false, scannedAt: new Date().toISOString(), ...result });
}
