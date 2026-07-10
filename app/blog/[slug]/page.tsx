import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarkdownArticle } from "../../_components/MarkdownArticle";
import { getPublishedPostBySlug, getPublishedPosts, readingTimeMinutes, SITE_URL } from "@/lib/blog";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) return { title: "Post not found" };

  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      type: "article",
      url: `${SITE_URL}/blog/${post.slug}`,
      title: post.title,
      description: post.description,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      authors: [post.author_name],
      tags: post.tags,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getPublishedPostBySlug(slug);
  if (!post) notFound();

  const others = (await getPublishedPosts()).filter((p) => p.id !== post.id).slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    url: `${SITE_URL}/blog/${post.slug}`,
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    author: { "@type": "Organization", name: post.author_name, url: SITE_URL },
    publisher: { "@id": `${SITE_URL}/#organization` },
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    keywords: post.tags.join(", "),
    wordCount: post.content.split(/\s+/).filter(Boolean).length,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <nav aria-label="Breadcrumb" className="mb-8 text-xs text-[var(--ink-faint)]">
        <Link href="/blog" className="rounded text-[var(--rust)] transition-colors hover:text-[var(--rust-deep)]">
          ← All posts
        </Link>
      </nav>

      <header className="mb-10">
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-[var(--ink-faint)]">
          <time dateTime={post.published_at ?? undefined}>{formatDate(post.published_at)}</time>
          <span>·</span>
          <span>{readingTimeMinutes(post.content)} min read</span>
          <span>·</span>
          <span>{post.author_name}</span>
        </div>
        <h1 className="font-signal-serif text-4xl font-[350] leading-tight tracking-tight text-[var(--ink)] sm:text-5xl">
          {post.title}
        </h1>
        {post.description && (
          <p className="mt-5 text-lg leading-relaxed text-[var(--ink-soft)]">{post.description}</p>
        )}
        {post.tags.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-[var(--rust-wash)] px-3 py-1 text-xs text-[var(--rust-deep)]">
                {tag}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-8 py-9 sm:px-10">
        <MarkdownArticle content={post.content} />
      </div>

      <aside className="mt-10 rounded-2xl border border-[var(--rust)]/25 bg-[var(--rust-wash)] px-8 py-7">
        <p className="font-signal-serif text-xl text-[var(--ink)]">
          Is your brand the answer when AI gets asked?
        </p>
        <p className="mt-1.5 text-sm text-[var(--ink-soft)]">
          Run a free visibility audit and see how ChatGPT, Claude, Gemini, and Perplexity talk about you.
        </p>
        <Link
          href="/audit"
          className="mt-4 inline-block rounded-full bg-[var(--rust)] px-5 py-2 text-sm font-semibold text-[var(--surface)] transition-colors hover:bg-[var(--rust-deep)]"
        >
          Get your free audit
        </Link>
      </aside>

      {others.length > 0 && (
        <section className="mt-14">
          <h2 className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
            Keep reading
          </h2>
          <div className="space-y-3">
            {others.map((p) => (
              <Link
                key={p.id}
                href={`/blog/${p.slug}`}
                className="block rounded-xl border border-[var(--line)] bg-[var(--surface)] px-6 py-4 transition-colors hover:border-[var(--rust)]/40"
              >
                <p className="text-sm font-semibold text-[var(--ink)]">{p.title}</p>
                <p className="mt-1 line-clamp-1 text-xs text-[var(--ink-soft)]">{p.description}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
