// Same rule as normalizeKeyword in autopilot-rules.ts, repeated here so this file
// has no imports and stays testable on its own. A test keeps the two identical.
export function normalizeKeyword(k: string): string {
  return k.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "").trim();
}

// One row per keyword for the dashboard's Keywords tab: how many people search
// it, and whether an article exists to rank for it. Pure so it can be tested.

export type KeywordStatus = "published" | "draft" | "queued" | "none";

export type KeywordRow = {
  keyword: string;
  volume: number | null;
  source: "research" | "gap" | "search" | "ai" | "article";
  status: KeywordStatus;
  article: { id: string; title: string; url: string | null; status: string } | null;
};

type ResearchKeyword = { keyword: string; volume: number | null };
type Topic = { keyword: string; volume: number | null; source: string; status: string };
type Article = { id: string; title: string; keyword: string | null; status: string | null; published_url: string | null };

const SOURCES = new Set(["research", "gap", "search", "ai"]);

export function buildKeywordList(input: { research: ResearchKeyword[]; topics: Topic[]; articles: Article[] }): KeywordRow[] {
  // If several articles target the same keyword, the published one is the one that counts.
  const articleByKeyword = new Map<string, Article>();
  for (const a of input.articles) {
    const key = normalizeKeyword(a.keyword ?? "");
    if (!key) continue;
    const existing = articleByKeyword.get(key);
    if (!existing || (a.status === "published" && existing.status !== "published")) articleByKeyword.set(key, a);
  }

  const rows = new Map<string, KeywordRow>();
  const add = (raw: string, volume: number | null, source: KeywordRow["source"], queued: boolean) => {
    const keyword = normalizeKeyword(raw);
    if (!keyword) return;
    const existing = rows.get(keyword);
    if (existing) {
      if (existing.volume === null && volume !== null) existing.volume = volume;
      if (queued && existing.status === "none") existing.status = "queued";
      return;
    }
    const article = articleByKeyword.get(keyword) ?? null;
    rows.set(keyword, {
      keyword,
      volume,
      source,
      status: article ? (article.status === "published" ? "published" : "draft") : queued ? "queued" : "none",
      article: article ? { id: article.id, title: article.title, url: article.published_url, status: article.status ?? "draft" } : null,
    });
  };

  for (const r of input.research) add(r.keyword, r.volume, "research", false);
  for (const t of input.topics) {
    if (t.status === "skipped" || !SOURCES.has(t.source)) continue;
    add(t.keyword, t.volume, t.source as KeywordRow["source"], t.status === "queued");
  }
  // Keywords someone already wrote about, even if research never listed them.
  for (const a of input.articles) if (a.keyword) add(a.keyword, null, "article", false);

  return [...rows.values()].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1) || a.keyword.localeCompare(b.keyword));
}
