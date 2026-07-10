import type { Metadata } from "next";
import Link from "next/link";
import { getPublishedPosts, readingTimeMinutes, SITE_URL } from "@/lib/blog";

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

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogIndexPage() {
  const posts = await getPublishedPosts();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${SITE_URL}/blog#blog`,
    name: "RankOnGeo Blog",
    url: `${SITE_URL}/blog`,
    description: "Guides and research on AI search visibility and generative engine optimization.",
    publisher: { "@id": `${SITE_URL}/#organization` },
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}/blog/${p.slug}`,
      datePublished: p.published_at ?? p.created_at,
    })),
  };

  return (
    <div className="mx-auto max-w-4xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <header className="mb-14">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--rust)]">Blog</p>
        <h1 className="font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)] sm:text-5xl">
          Notes on being <em className="italic text-[var(--rust)]">the answer</em>
        </h1>
        <p className="mt-4 max-w-xl text-[16px] text-[var(--ink-soft)]">
          Guides and research on AI search visibility, generative engine optimization, and getting your brand
          recommended by ChatGPT, Claude, Gemini, and Perplexity.
        </p>
      </header>

      {posts.length === 0 ? (
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
        <div className="space-y-6">
          {posts.map((post) => (
            <article key={post.id}>
              <Link
                href={`/blog/${post.slug}`}
                className="block rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-8 py-7 transition-colors hover:border-[var(--rust)]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
              >
                <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-faint)]">
                  <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
                  <span>·</span>
                  <span>{readingTimeMinutes(post.content)} min read</span>
                  {post.tags.slice(0, 3).map((tag) => (
                    <span key={tag} className="rounded-full bg-[var(--rust-wash)] px-2.5 py-0.5 text-[var(--rust-deep)]">
                      {tag}
                    </span>
                  ))}
                </div>
                <h2 className="font-signal-serif text-2xl font-[350] tracking-tight text-[var(--ink)]">{post.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--ink-soft)]">{post.description}</p>
              </Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
