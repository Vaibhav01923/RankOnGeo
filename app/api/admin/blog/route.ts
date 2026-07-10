import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { serverClient } from "@/lib/supabase";
import { slugify } from "@/lib/blog";

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { data, error } = await serverClient()
    .from("blog_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ posts: data ?? [] });
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const body = await req.json();
  const title = (body.title ?? "").trim();
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const slug = slugify(body.slug?.trim() || title);
  if (!slug) return NextResponse.json({ error: "slug could not be derived" }, { status: 400 });

  const status = body.status === "published" ? "published" : "draft";
  const { data, error } = await serverClient()
    .from("blog_posts")
    .insert({
      title,
      slug,
      description: body.description ?? "",
      content: body.content ?? "",
      tags: Array.isArray(body.tags) ? body.tags : [],
      author_name: body.author_name?.trim() || "RankOnGeo Team",
      status,
      published_at: status === "published" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  if (error) {
    const conflict = error.code === "23505";
    return NextResponse.json(
      { error: conflict ? `A post with slug "${slug}" already exists` : error.message },
      { status: conflict ? 409 : 500 }
    );
  }

  if (status === "published") {
    revalidatePath("/blog");
    revalidatePath(`/blog/${slug}`);
    revalidatePath("/sitemap.xml");
  }
  return NextResponse.json({ post: data });
}
