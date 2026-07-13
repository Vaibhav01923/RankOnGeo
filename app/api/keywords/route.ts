import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ keywords: [] });

  // Keywords are shared across the workspace, whoever added them.
  const { data: keywords } = await db
    .from("social_keywords")
    .select("id, keyword, created_at")
    .eq("brand_id", brandId)
    .order("created_at");

  return NextResponse.json({ keywords: keywords ?? [] });
}

export async function POST(req: NextRequest) {
  const { brandId, keyword } = await req.json();
  if (!brandId || !keyword?.trim()) return NextResponse.json({ error: "brandId and keyword required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("social_keywords")
    .insert({ brand_id: brandId, user_id: user.id, keyword: keyword.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ keyword: data });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Authorize via the keyword's brand so teammates can prune each other's
  // keywords, not just their own.
  const { data: kw } = await db.from("social_keywords").select("id, brand_id").eq("id", id).maybeSingle();
  if (!kw) return NextResponse.json({ success: true });

  const access = await requireBrandAccess(db, user.id, kw.brand_id);
  if (!access) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.from("social_keywords").delete().eq("id", id);
  return NextResponse.json({ success: true });
}
