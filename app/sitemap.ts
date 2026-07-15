import type { MetadataRoute } from "next";
import { getPublishedPosts, SITE_URL } from "@/lib/blog";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/blog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/audit`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/about`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/early`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/docs`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/docs/web-analytics`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/docs/llm-analytics`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
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
