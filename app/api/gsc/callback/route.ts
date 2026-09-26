import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { encryptToken, exchangeCode, getAccessToken, gscConfigured, listSites, pickSiteForDomain, verifyState } from "@/lib/gsc";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const params = req.nextUrl.searchParams;
  const back = (brandId: string | null, flag: string) =>
    NextResponse.redirect(`${origin}/dashboard${brandId ? `?brandId=${brandId}&` : "?"}gsc=${flag}`);

  if (!gscConfigured()) return back(null, "unavailable");

  const state = verifyState(params.get("state"));
  if (!state) return back(null, "error");

  // The person finishing the flow must be the person who started it, still
  // signed in, and still allowed on this brand.
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user || user.id !== state.userId) return NextResponse.redirect(`${origin}/auth`);
  const access = await requireBrandAccess(db, user.id, state.brandId, "id, user_id, domain");
  if (!access) return back(null, "error");
  const brand = access.brand as unknown as { id: string; domain: string };

  if (params.get("error") || !params.get("code")) return back(brand.id, "denied");

  const tokens = await exchangeCode(params.get("code")!, `${origin}/api/gsc/callback`);
  if (!tokens) return back(brand.id, "denied");

  // Match the brand's domain to one of the account's properties right away so
  // the common case is zero extra clicks. No match leaves site_url empty and
  // the panel lets the user pick.
  const access_ = await getAccessToken(tokens.refreshToken);
  const sites = access_.ok ? await listSites(access_.token) : null;
  const siteUrl = sites ? pickSiteForDomain(sites, brand.domain) : null;

  const admin = serverClient();
  const { error } = await admin.from("gsc_connections").upsert(
    {
      brand_id: brand.id,
      connected_by: user.id,
      google_email: tokens.email,
      refresh_token_enc: encryptToken(tokens.refreshToken),
      site_url: siteUrl,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "brand_id" },
  );
  if (error) {
    console.error("[gsc] failed to store connection", error.message);
    return back(brand.id, "error");
  }
  return back(brand.id, siteUrl ? "connected" : "pick_site");
}
