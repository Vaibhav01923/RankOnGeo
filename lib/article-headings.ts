// Shared by the blog writers (picking which H2s get an inline image), the
// Table of Contents component, and MarkdownArticle's heading ids — one slug
// rule everywhere, so a TOC link always lands on the right heading.

export function extractH2Headings(markdown: string): string[] {
  return [...markdown.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
}

// GitHub-style heading slug: lowercase, strip markdown emphasis/links first
// (so "**Best** [CRM](url)" and "Best CRM" don't produce different anchors),
// then non-alphanumerics to hyphens.
export function headingSlug(heading: string): string {
  const plain = heading
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_`]+/g, "");
  return plain
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}
