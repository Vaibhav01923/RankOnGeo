import type { MetadataRoute } from "next";
import { getPublishedPosts, SITE_URL } from "@/lib/blog";

export const revalidate = 3600;

// Fixed date for pages without a real per-page "last edited" timestamp
// tracked anywhere — a static literal here is still strictly more honest
// than `new Date()` at build/request time, which changes on every deploy
// regardless of whether the page's content actually changed. Bump this
// (or a page's own date, once one exists) when a page is meaningfully edited.
const LAST_STATIC_EDIT = new Date("2026-07-15");

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: LAST_STATIC_EDIT, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: LAST_STATIC_EDIT, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/audit`, lastModified: LAST_STATIC_EDIT, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: LAST_STATIC_EDIT, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/early`, lastModified: LAST_STATIC_EDIT, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/docs`, lastModified: LAST_STATIC_EDIT, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/docs/web-analytics`, lastModified: LAST_STATIC_EDIT, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/docs/llm-analytics`, lastModified: LAST_STATIC_EDIT, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, lastModified: LAST_STATIC_EDIT, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: LAST_STATIC_EDIT, changeFrequency: "yearly", priority: 0.3 },
  ];

  const posts = await getPublishedPosts();
  const postEntries: MetadataRoute.Sitemap = posts.map((post) => ({
    url: `${SITE_URL}/blog/${post.slug}`,
    lastModified: new Date(post.updated_at ?? post.published_at ?? post.created_at),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...staticEntries, ...postEntries];
}
