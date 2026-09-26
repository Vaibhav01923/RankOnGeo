import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { findKeywordOpportunities, type KeywordBrand } from "@/lib/keyword-opportunities";

export const maxDuration = 60;

const COLUMNS = "id, name, niche, description, competitors, target_audience";

// Every new brand's lookup costs about $0.09 of DataForSEO credit. The per-visitor
// limit below stops one person; this stops a crowd (or a bug) from draining the
// account, since the same balance also pays for AI-engine scans. Once the day's
// budget is used, the step falls back to keywords without volumes.
const DAILY_LOOKUP_CAP = Number(process.env.KEYWORD_LOOKUPS_PER_DAY) || 30;

// Wizard step "keywords": what high-intent buyers in this niche search for, with
// approximate monthly volume. Runs before signup for anonymous visitors (brand
// row has no user_id yet — authorized by the same pending_brand_claim cookie
// as the Reddit step) and for signed-in users re-running setup. Each new brand
// costs one keyword-volume lookup, so it is rate limited and cached per brand.
export async function POST(req: NextRequest) {
  const { brandId } = await req.json().catch(() => ({}));
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  const userId = user?.id;

  if (!(await checkRateLimit("setup-keywords", userId ?? clientIp(req), 8, 3600))) {
    return NextResponse.json({ error: "Too many requests — please try again in a bit." }, { status: 429 });
  }

  let brand: KeywordBrand | null = null;
  if (userId) {
    const access = await requireBrandAccess(db, userId, brandId, COLUMNS);
    if (access) brand = access.brand as unknown as KeywordBrand;
  } else {
    const token = req.cookies.get("pending_brand_claim")?.value;
    if (token) {
      const { data } = await serverClient().from("brands").select(COLUMNS).eq("id", brandId).eq("claim_token", token).is("user_id", null).maybeSingle();
      if (data) brand = data as KeywordBrand;
    }
  }
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  try {
    return NextResponse.json(
      await findKeywordOpportunities(brand, serverClient(), {
        allowLookup: () => checkRateLimit("setup-keyword-lookups", "all-visitors", DAILY_LOOKUP_CAP, 24 * 60 * 60),
      }),
    );
  } catch (e) {
    console.error("[setup/keywords] failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't load keyword ideas right now." }, { status: 500 });
  }
}
