// Pure keyword cleanup and selection for the setup wizard's keyword step, kept
// free of I/O so it can be tested on its own (see lib/keyword-opportunities.ts).

const MAX_CANDIDATES = 40;

export type KeywordOpportunity = { keyword: string; volume: number | null };

// Model output arrives as loose lines: bullets, numbering, quotes, repeats.
// Google Ads (behind the volume lookup) rejects a keyword with any symbol other
// than letters, digits, spaces and hyphens, and DataForSEO then fails the whole
// batch over that one keyword — so anything else is stripped or dropped here.
export function normalizeKeywords(raw: string[], cap = MAX_CANDIDATES): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw) {
    const k = line
      .replace(/^[\s\-*•\d.)]+/, "")
      .replace(/['’‘`“”"]/g, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[?!.,:;]+$/, "")
      .trim();
    if (k.length < 3 || k.length > 80 || k.split(" ").length > 10 || !/^[\p{L}\p{N} -]+$/u.test(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= cap) break;
  }
  return out;
}

export type RelatedKeyword = { keyword: string; volume: number };

// Related keywords straight from Google Ads, ranked by volume. Zero-volume rows
// and duplicates go; the cap keeps the relevance prompt short.
export function topCandidates(rows: { keyword: string; search_volume: number | null }[], limit = 80): RelatedKeyword[] {
  const seen = new Set<string>();
  const out: RelatedKeyword[] = [];
  for (const r of rows) {
    const keyword = r.keyword.toLowerCase().replace(/\s+/g, " ").trim();
    if (!keyword || (r.search_volume ?? 0) <= 0 || seen.has(keyword)) continue;
    seen.add(keyword);
    out.push({ keyword, volume: r.search_volume as number });
  }
  return out.sort((a, b) => b.volume - a.volume).slice(0, limit);
}

// The model answers with lines of text; only lines that exactly match a
// candidate are accepted, so it can neither invent a keyword nor a volume.
export function resolveSelection(lines: string[], candidates: RelatedKeyword[], limit = 12): KeywordOpportunity[] {
  const byKeyword = new Map(candidates.map((c) => [c.keyword, c]));
  const seen = new Set<string>();
  const out: KeywordOpportunity[] = [];
  for (const line of lines) {
    const k = line.replace(/^[\s\-*•\d.)]+/, "").replace(/['’‘`“”"]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
    const hit = byKeyword.get(k) ?? byKeyword.get(line.replace(/^[\s\-*•\d.)]+/, "").toLowerCase().replace(/\s+/g, " ").trim());
    if (!hit || seen.has(hit.keyword)) continue;
    seen.add(hit.keyword);
    out.push({ keyword: hit.keyword, volume: hit.volume });
  }
  return out.sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, limit);
}
