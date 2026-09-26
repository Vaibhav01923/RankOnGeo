import { serverClient } from "@/lib/supabase";

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  description: string;
  content: string;
  tags: string[];
  cover_image_url: string | null;
  author_name: string;
  status: "draft" | "published";
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

// Must be the canonical www host — the apex 308s to www (see public/track.js),
// so every canonical tag, sitemap entry, and OG url built from this constant
// must already be the post-redirect URL. Pointing rel=canonical at a URL that
// itself redirects is exactly the anti-pattern that stalls indexing.
export const SITE_URL = "https://www.rankongeo.com";

// Errors (e.g. table not yet migrated) resolve to empty results so public
// pages and the sitemap never hard-fail on a database hiccup.
export async function getPublishedPosts(): Promise<BlogPost[]> {
  const { data, error } = await serverClient()
    .from("blog_posts")
    .select("*")
    .eq("status", "published")
    .order("published_at", { ascending: false });
  if (error) return [];
  return (data as BlogPost[]) ?? [];
}

export async function getPublishedPostBySlug(slug: string): Promise<BlogPost | null> {
  const { data, error } = await serverClient()
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) return null;
  return (data as BlogPost) ?? null;
}

export function slugify(text: string): string {
  const full = text
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (full.length <= 80) return full;
  // A hard cut mid-word ("...-answer-en") looks broken in a URL, so cut back
  // to the last whole word. Only applies to slugs generated from now on —
  // stored slugs are never recomputed.
  const cut = full.slice(0, 80);
  if (full[80] === "-") return cut;
  const lastDash = cut.lastIndexOf("-");
  return lastDash > 40 ? cut.slice(0, lastDash) : cut;
}

export function readingTimeMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
