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

export const SITE_URL = "https://rankongeo.com";

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
  return text
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function readingTimeMinutes(markdown: string): number {
  const words = markdown.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}
