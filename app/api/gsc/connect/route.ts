import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { buildAuthUrl, gscConfigured, signState } from "@/lib/gsc";

// Starts the Google consent flow. Reached by a normal link click from the
// Analytics → Search tab (a full-page navigation), so it authenticates from
// the session cookie like every other route here.
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const brandId = req.nextUrl.searchParams.get("brandId") ?? "";

  if (!gscConfigured()) return NextResponse.redirect(`${origin}/dashboard?brandId=${brandId}&gsc=unavailable`);

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(`${origin}/auth`);

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.redirect(`${origin}/dashboard`);

  const state = signState({ brandId, userId: user.id, exp: Date.now() + 10 * 60 * 1000 });
  return NextResponse.redirect(buildAuthUrl(`${origin}/api/gsc/callback`, state, user.email ?? undefined));
}
