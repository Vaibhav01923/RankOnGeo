import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { decryptToken, getAccessToken, listSites } from "@/lib/gsc";

// Choose which Search Console property backs this brand's analytics. Only
// properties the connected Google account actually has access to are accepted.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, siteUrl } = await req.json().catch(() => ({}));
  if (!brandId || typeof siteUrl !== "string" || !siteUrl) return NextResponse.json({ error: "brandId and siteUrl required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  const { data: conn } = await admin.from("gsc_connections").select("refresh_token_enc").eq("brand_id", brandId).maybeSingle();
  if (!conn) return NextResponse.json({ error: "Search Console isn't connected" }, { status: 400 });

  const refreshToken = decryptToken(conn.refresh_token_enc);
  const token = refreshToken ? await getAccessToken(refreshToken) : null;
  if (!token?.ok) return NextResponse.json({ error: "Reconnect Search Console and try again" }, { status: 400 });

  const sites = await listSites(token.token);
  if (!sites?.some((s) => s.siteUrl === siteUrl)) return NextResponse.json({ error: "That property isn't available to this Google account" }, { status: 400 });

  await admin.from("gsc_connections").update({ site_url: siteUrl, updated_at: new Date().toISOString() }).eq("brand_id", brandId);
  return NextResponse.json({ ok: true });
}
