import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { findRedditOpportunities, RedditOpportunityBrand } from "@/lib/reddit-opportunities";

// One OpenAI mini call for ideas, one more for relevance verification, plus a
// handful of parallel Reddit fetches (search + per-subreddit /about lookups)
// — well under Vercel's default, but Reddit's public endpoints occasionally
// lag under load, so leave headroom.
export const maxDuration = 60;

// This step runs both before signup (anonymous wizard visitor — brand row
// has no user_id yet, authorized via the same pending_brand_claim cookie
// /api/brand/claim uses) and for already signed-in users re-running setup.
export async function POST(req: NextRequest) {
  const { brandId } = await req.json().catch(() => ({}));
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  const userId = user?.id;

  const rateLimitOk = await checkRateLimit("reddit-opportunities", userId ?? clientIp(req), 8, 3600);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Too many requests — please try again in a bit." }, { status: 429 });
  }

  let brand: RedditOpportunityBrand | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let writeDb: any = db;

  if (userId) {
    const access = await requireBrandAccess(db, userId, brandId, "id, name, niche, description, competitors, target_audience");
    if (access) brand = access.brand as unknown as RedditOpportunityBrand;
  } else {
    const token = req.cookies.get("pending_brand_claim")?.value;
    if (token) {
      const admin = serverClient();
      const { data } = await admin
        .from("brands")
        .select("id, name, niche, description, competitors, target_audience")
        .eq("id", brandId)
        .eq("claim_token", token)
        .is("user_id", null)
        .maybeSingle();
      if (data) {
        brand = data as RedditOpportunityBrand;
        writeDb = admin;
      }
    }
  }

  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const result = await findRedditOpportunities({ brand, writeDb, userId: userId ?? null });
  return NextResponse.json(result);
}
