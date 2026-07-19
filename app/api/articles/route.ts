import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("articles")
    .select("*")
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ articles: data ?? [] });
}

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { brandId, title, content, keyword, status, seoScore, wordCount, description, tags, imageUrl } = await req.json();
  if (!brandId || !title) return NextResponse.json({ error: "brandId and title required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("articles")
    .insert({
      brand_id: brandId,
      user_id: user.id,
      title,
      content: content ?? "",
      keyword: keyword ?? "",
      status: status ?? "draft",
      seo_score: seoScore ?? 0,
      word_count: wordCount ?? 0,
      description: description ?? null,
      tags: Array.isArray(tags) ? tags : [],
      image_url: imageUrl ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}
