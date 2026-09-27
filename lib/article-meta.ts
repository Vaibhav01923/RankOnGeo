// Parses the "DESCRIPTION: … / TAGS: …" metadata header the blog AI prompts
// ask for. Models don't always follow the format exactly — labels come back
// bolded, the --- separator goes missing or gains blank lines — so this
// matches the labeled lines anywhere in the output instead of relying on an
// exact separator, and treats everything from the first markdown H1 onward
// as the article body.
export function parseArticleMeta(raw: string): { description: string; tags: string[]; content: string } {
  const metaLine = (label: string) =>
    raw
      .match(new RegExp(`^[ \\t*_]*${label}[ \\t*_]*:[ \\t*_]*(.+)$`, "im"))?.[1]
      ?.trim()
      .replace(/[*_]+$/, "")
      .trim() ?? "";

  const description = metaLine("DESCRIPTION");
  const tags = metaLine("TAGS")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const h1Index = raw.search(/^#\s+/m);
  const content =
    h1Index >= 0
      ? raw.slice(h1Index).trim()
      : raw
          .replace(/^[ \t*_]*DESCRIPTION[ \t*_]*:.*$/im, "")
          .replace(/^[ \t*_]*TAGS[ \t*_]*:.*$/im, "")
          .replace(/^\s*-{3,}\s*$/m, "")
          .trim();

  return { description, tags, content };
}

// Converts "[text](url)" -> "text". DESCRIPTION and TAGS are supposed to be
// plain text (they render as-is in <meta> tags and page subtitles, never
// through a markdown renderer), but the model occasionally slips a markdown
// link into them anyway — most often when it over-applies a "link the brand
// name" instruction meant for the article body.
export function stripMarkdownLinkSyntax(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

// Pulls the article's own "## FAQ" (or "## Frequently Asked Questions")
// section into Q/A pairs for FAQPage schema — see app/blog/[slug]/page.tsx.
// Every writer prompt already asks for this section as "### question" +
// answer paragraph(s); this only reads what's already there, no extra
// generation. Returns [] if the article has no FAQ section.
export function extractFaqPairs(markdown: string): { q: string; a: string }[] {
  const start = markdown.match(/^##\s+(?:FAQ|Frequently Asked Questions)\s*$/im);
  if (!start?.index && start?.index !== 0) return [];
  const from = start.index! + start[0].length;
  const nextH2 = markdown.slice(from).search(/^##\s+/m);
  const section = nextH2 >= 0 ? markdown.slice(from, from + nextH2) : markdown.slice(from);

  const pairs: { q: string; a: string }[] = [];
  const items = section.split(/^###\s+/m).slice(1);
  for (const item of items) {
    const nl = item.indexOf("\n");
    const q = (nl >= 0 ? item.slice(0, nl) : item).trim();
    const a = (nl >= 0 ? item.slice(nl + 1) : "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_]{1,2}/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (q && a) pairs.push({ q, a });
  }
  return pairs;
}
