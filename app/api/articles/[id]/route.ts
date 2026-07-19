import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

// Authorize through the article's brand so teammates can edit each other's
// team articles, not just rows they created themselves.
async function requireArticleAccess(db: ReturnType<typeof clientFromRequest>, userId: string, articleId: string) {
  const { data: article } = await db.from("articles").select("id, brand_id").eq("id", articleId).maybeSingle();
  if (!article) return null;
  return requireBrandAccess(db, userId, article.brand_id);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const access = await requireArticleAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) updates.status = body.status;
  if (body.scheduledAt !== undefined) updates.scheduled_at = body.scheduledAt;
  if (body.channelId !== undefined) updates.channel_id = body.channelId;
  if (body.publishedAt !== undefined) updates.published_at = body.publishedAt;
  if (body.content !== undefined) updates.content = body.content;
  if (body.title !== undefined) updates.title = body.title;
  if (body.seoScore !== undefined) updates.seo_score = body.seoScore;
  if (body.description !== undefined) updates.description = body.description;
  if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) ? body.tags : [];
  if (body.imageUrl !== undefined) updates.image_url = body.imageUrl;

  const { data, error } = await db
    .from("articles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const access = await requireArticleAccess(db, user.id, id);
  if (!access) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  const { error } = await db.from("articles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
