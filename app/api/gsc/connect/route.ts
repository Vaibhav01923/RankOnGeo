import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { buildAuthUrl, gscConfigured, signState } from "@/lib/gsc";

// Starts the Google consent flow. Reached by a normal link click from the
// Analytics → Search tab (a full-page navigation), so it authenticates from
// the session cookie like every other route here.
//
// Different brands routinely belong to different Google accounts (an agency
// running Search Console for several clients, say), so the hint offered here
// must never be the person's own RankOnGeo login email — that biased every
// brand's connect flow toward the same account regardless of whose Search
// Console it actually needs. Instead: hint this brand's own already-linked
// Google account, so re-authorizing it (e.g. after the token was revoked)
// smoothly suggests the right one; a brand connecting for the first time, or
// a `switchAccount` request, gets no hint at all, so Google shows its full
// account chooser instead of quietly assuming one.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";
  const switchAccount = req.nextUrl.searchParams.get("switchAccount") === "1";

  if (!gscConfigured()) return NextResponse.redirect(`${origin}/dashboard?brandId=${brandId}&gsc=unavailable`);

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/auth`);

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.redirect(`${origin}/dashboard`);

  let loginHint: string | undefined;
  if (!switchAccount) {
    const { data: existing } = await serverClient().from("gsc_connections").select("google_email").eq("brand_id", brandId).maybeSingle();
    loginHint = existing?.google_email ?? undefined;
  }

  const state = signState({ brandId, userId: user.id, exp: Date.now() + 10 * 60 * 1000 });
  return NextResponse.redirect(buildAuthUrl(`${origin}/api/gsc/callback`, state, loginHint));
}
