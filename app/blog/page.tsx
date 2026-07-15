import type { Metadata } from "next";
import Link from "next/link";
import { BlogIndex, type BlogCard } from "../_components/BlogIndex";
import { getPublishedPosts, readingTimeMinutes, SITE_URL } from "@/lib/blog";
import { ORGANIZATION } from "../_components/WebPageJsonLd";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides and research on AI search visibility, generative engine optimization (GEO), and getting your brand recommended by ChatGPT, Claude, Gemini, and Perplexity.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/blog`,
    title: "RankOnGeo Blog — AI Search Visibility & GEO",
    description:
      "Guides and research on AI search visibility, generative engine optimization (GEO), and getting your brand recommended by AI engines.",
  },
};

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts();

  const cards: BlogCard[] = posts.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    tags: p.tags,
    published_at: p.published_at,
    cover_image_url: p.cover_image_url,
    readMinutes: readingTimeMinutes(p.content),
  }));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${SITE_URL}/blog#blog`,
    name: "RankOnGeo Blog",
    url: `${SITE_URL}/blog`,
    description: "Guides and research on AI search visibility and generative engine optimization.",
    publisher: ORGANIZATION,
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.published_at ?? p.created_at,
    })),
  };

  return (
    <div className="mx-auto max-w-5xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <header className="mb-12 max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--rust)]">Blog</p>
        <h1
          className="font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)] sm:text-5xl"
          style={{ textWrap: "balance" } as React.CSSProperties}
        >
          AI search visibility <em className="italic text-[var(--rust)]">& GEO guides</em>
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-[var(--ink-soft)]">
          Notes on being the answer — research and guides on getting your brand
          recommended by ChatGPT, Claude, Gemini, and Perplexity.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-8 py-16 text-center">
          <p className="font-signal-serif text-2xl text-[var(--ink)]">First posts are growing.</p>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Check back soon — or get a{" "}
            <Link href="/audit" className="text-[var(--rust)] underline underline-offset-2">
              free AI visibility audit
            </Link>{" "}
            in the meantime.
          </p>
        </div>
      ) : (
        <BlogIndex posts={cards} />
      )}
    </div>
  );
}
