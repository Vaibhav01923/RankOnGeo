import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { decryptToken, revokeToken } from "@/lib/gsc";

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await req.json().catch(() => ({}));
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  const { data: conn } = await admin.from("gsc_connections").select("refresh_token_enc").eq("brand_id", brandId).maybeSingle();
  // Revoke at Google as well, so the app also disappears from the user's
  // "third-party access" list — not just from our table.
  const refreshToken = conn ? decryptToken(conn.refresh_token_enc) : null;
  if (refreshToken) await revokeToken(refreshToken);

  await admin.from("gsc_connections").delete().eq("brand_id", brandId);
  return NextResponse.json({ ok: true });
}
