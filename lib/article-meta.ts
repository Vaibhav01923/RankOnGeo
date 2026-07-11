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
