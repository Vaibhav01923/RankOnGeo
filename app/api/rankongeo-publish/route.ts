import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { serverClient } from "@/lib/supabase";
import { slugify } from "@/lib/blog";

// Strips common markdown syntax down to plain text for blog_posts.description
// (meta description / listing excerpt) — content itself stays as markdown.
function excerptFromMarkdown(md: string, maxLen = 155): string {
  const plain = md
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > maxLen ? `${plain.slice(0, maxLen - 1).trimEnd()}…` : plain;
}

// RankOnGeo's own receiving endpoint for its "publish to my site" webhook —
// dogfoods the exact same contract every customer's AI-built endpoint
// follows (see the "webhook" branch of app/api/publishing/publish/route.ts
// and the AI setup prompt in app/dashboard/page.tsx / app/docs/autopublish).
// Publishes straight into blog_posts so gap-driven articles show up on
// /blog with no manual step. Auth is the shared-secret header, not a user
// session — this is a server-to-server call from RankOnGeo's own Inngest/
// dashboard publish action, not a browser request.
export async function POST(req: NextRequest) {
  const expected = process.env.RANKONGEO_PUBLISH_SECRET;
  if (!expected) {
    console.error("[rankongeo-publish] RANKONGEO_PUBLISH_SECRET is not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }
  if (req.headers.get("x-rankongeo-secret") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const title = (body?.title ?? "").trim();
  const content = (body?.content ?? "").trim();
  if (!title || !content) {
    return NextResponse.json({ error: "title and content are required" }, { status: 400 });
  }

  // tags/description/image_url are optional fields added after this route's
  // first version, which fell back to using the raw gap-query `keyword` as a
  // "tag" — for gap articles that's the same text as the title, so it showed
  // up as a nonsensical full-sentence tag on the blog. Real tags (or nothing)
  // beat that; never fall back to keyword here again.
  const tags = Array.isArray(body?.tags) ? body.tags.filter((t: unknown) => typeof t === "string" && t.trim()) : [];
  const description = typeof body?.description === "string" && body.description.trim()
    ? body.description.trim()
    : excerptFromMarkdown(content);
  const imageUrl = typeof body?.image_url === "string" && body.image_url.trim() ? body.image_url.trim() : null;

  const baseSlug = slugify(title);
  if (!baseSlug) return NextResponse.json({ error: "slug could not be derived from title" }, { status: 400 });

  const db = serverClient();
  const insertPost = (slug: string) =>
    db
      .from("blog_posts")
      .insert({
        title,
        slug,
        description,
        content,
        tags,
        cover_image_url: imageUrl,
        author_name: "RankOnGeo Team",
        status: "published",
        published_at: new Date().toISOString(),
      })
      .select()
      .single();

  let { data, error } = await insertPost(baseSlug);
  if (error?.code === "23505") {
    // Slug collision — this is an unattended pipeline with no human present
    // to pick a new slug (unlike the admin studio's POST, which surfaces a
    // 409 for that), so dedupe instead of failing the whole publish.
    ({ data, error } = await insertPost(`${baseSlug}-${Date.now().toString(36)}`));
  }
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? "Failed to save post" }, { status: 500 });
  }

  revalidatePath("/blog");
  revalidatePath(`/blog/${data.slug}`);
  revalidatePath("/sitemap.xml");

  return NextResponse.json({ ok: true });
}
