import { extractH2Headings, headingSlug } from "@/lib/article-headings";

// A short jump list of the post's H2 sections, right below the intro. Anchors
// match MarkdownArticle's h2 ids exactly (both use headingSlug on the same
// heading text), and competitor posts in this space almost all have one —
// it's also a cheap AI-visibility win: an engine quoting one section can
// point at a real in-page anchor. Skipped on short posts (fewer than 4 H2s,
// same threshold lib/article-images.ts uses for inline images) — a 2-3 item
// list reads as filler, not navigation.
export function TableOfContents({ content }: { content: string }) {
  const headings = extractH2Headings(content);
  if (headings.length < 4) return null;

  return (
    <nav aria-label="Table of contents" className="mb-10 rounded-xl border border-[var(--line)] bg-[var(--line-soft)]/40 px-5 py-4">
      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)]">In this article</p>
      <ol className="space-y-1.5">
        {headings.map((h, i) => (
          <li key={h} className="text-sm">
            <a href={`#${headingSlug(h)}`} className="text-[var(--ink-soft)] transition-colors hover:text-[var(--rust)]">
              <span className="mr-1.5 text-[var(--ink-faint)]">{i + 1}.</span>
              {h}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
