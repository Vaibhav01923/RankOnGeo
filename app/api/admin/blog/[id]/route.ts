import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { serverClient } from "@/lib/supabase";
import { slugify } from "@/lib/blog";

type Ctx = { params: Promise<{ id: string }> };

function revalidateBlog(slug?: string | null) {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/sitemap.xml");
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await ctx.params;
  const body = await req.json();

  const { data: existing, error: fetchError } = await serverClient()
    .from("blog_posts")
    .select("slug, status, published_at")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) update.title = body.title.trim();
  if (typeof body.slug === "string" && body.slug.trim()) update.slug = slugify(body.slug);
  if (typeof body.description === "string") update.description = body.description;
  if (typeof body.content === "string") update.content = body.content;
  if (Array.isArray(body.tags)) update.tags = body.tags;
  if (typeof body.author_name === "string" && body.author_name.trim()) update.author_name = body.author_name.trim();
  if (body.status === "published" || body.status === "draft") {
    update.status = body.status;
    if (body.status === "published" && !existing.published_at) {
      update.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await serverClient()
    .from("blog_posts")
    .update(update)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    const conflict = error.code === "23505";
    return NextResponse.json(
      { error: conflict ? "A post with that slug already exists" : error.message },
      { status: conflict ? 409 : 500 }
    );
  }

  // Refresh both the old and (possibly renamed) slug paths.
  revalidateBlog(existing.slug);
  if (data.slug !== existing.slug) revalidateBlog(data.slug);
  return NextResponse.json({ post: data });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { id } = await ctx.params;
  const { data, error } = await serverClient()
    .from("blog_posts")
    .delete()
    .eq("id", id)
    .select("slug")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidateBlog(data?.slug);
  return NextResponse.json({ ok: true });
}
