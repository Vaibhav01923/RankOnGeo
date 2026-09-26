import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { decryptToken, fetchReport, fetchSites, getAccessToken, gscConfigured } from "@/lib/gsc";

const ALLOWED_DAYS = [1, 7, 30, 90];

// One endpoint for everything the Search tab shows. Availability of Search
// Console is deliberately not tied to a paid plan: it costs us nothing per
// request and it is the first thing a new account is asked to connect.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const daysParam = Number(req.nextUrl.searchParams.get("days"));
  const days = ALLOWED_DAYS.includes(daysParam) ? daysParam : 30;

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  if (!gscConfigured()) return NextResponse.json({ configured: false, connected: false });

  const admin = serverClient();
  const { data: conn } = await admin
    .from("gsc_connections")
    .select("google_email, refresh_token_enc, site_url")
    .eq("brand_id", brandId)
    .maybeSingle();
  if (!conn) return NextResponse.json({ configured: true, connected: false });

  const refreshToken = decryptToken(conn.refresh_token_enc);
  const token = refreshToken ? await getAccessToken(refreshToken) : ({ ok: false, reason: "revoked" } as const);
  if (!token.ok) {
    // Revoked in Google's account settings (or the client secret rotated):
    // keep the row so the UI can say "reconnect" rather than "never connected".
    return NextResponse.json({
      configured: true,
      connected: true,
      reconnect: token.reason === "revoked",
      error: token.reason === "revoked" ? undefined : "Couldn't reach Google right now.",
      email: conn.google_email,
    });
  }

  const listed = await fetchSites(token.token);
  if (!listed.ok) {
    // Report the failure itself — an empty list would read as "you own no
    // sites", which is a different problem with a different fix.
    return NextResponse.json({ configured: true, connected: true, email: conn.google_email, siteUrl: conn.site_url, sites: [], siteListError: listed.reason });
  }
  const sites = listed.sites;
  const base = { configured: true, connected: true, email: conn.google_email, siteUrl: conn.site_url, sites };
  if (!conn.site_url) return NextResponse.json(base);

  const report = await fetchReport(token.token, conn.site_url, days);
  if (!report) {
    return NextResponse.json({ ...base, error: "Couldn't load data for this property. You may have lost access to it in Search Console." });
  }
  return NextResponse.json({ ...base, ...report });
}
