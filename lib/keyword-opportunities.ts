import OpenAI from "openai";
import { recordSpend } from "@/lib/dataforseo-spend";
import { normalizeKeywords, resolveSelection, topCandidates, type KeywordOpportunity, type RelatedKeyword } from "@/lib/keyword-rules";

export { normalizeKeywords, resolveSelection, topCandidates };
export type { KeywordOpportunity, RelatedKeyword };

// "What are high-intent buyers in this niche actually searching for, and how
// much?" — the keyword step of the setup wizard. A language model proposes seed
// phrases and later picks the relevant, buyer-intent keywords, but every keyword
// shown (and its volume) comes from Google Ads data via DataForSEO: the model
// can only choose from the list DataForSEO returned, never invent a keyword or
// a number. If the lookup fails the step still shows model-suggested keywords,
// just without volumes — a volume is only ever displayed if it is real.

export type KeywordBrand = {
  id: string;
  name: string;
  niche: string | null;
  description: string | null;
  competitors: string[] | null;
  target_audience: string[] | null;
};

export type KeywordResult = { keywords: KeywordOpportunity[]; volumeAvailable: boolean };

export const CACHE_DAYS = 7;
const MAX_CANDIDATES = 40;
const SHOW = 10;

const BUYER_INTENT = /\b(alternatives?|vs|versus|best|top|software|tools?|platforms?|pricing|price|compare|comparison|reviews?)\b/;

async function chat(prompt: string, maxTokens: number): Promise<string> {
  const res = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
    model: "gpt-5.4-nano-2026-03-17",
    max_completion_tokens: maxTokens,
    messages: [{ role: "user", content: prompt }],
  });
  return res.choices[0]?.message?.content ?? "";
}

function brandContext(brand: KeywordBrand): string {
  return `Company: ${brand.name}
Niche: ${brand.niche ?? "unspecified"}
What it does: ${brand.description ?? "unspecified"}
Who it is for: ${(brand.target_audience ?? []).slice(0, 5).join(", ") || "unspecified"}
Competitors: ${(brand.competitors ?? []).slice(0, 6).join(", ") || "unspecified"}`;
}

export async function seedsFromAi(brand: KeywordBrand): Promise<string[]> {
  const out = await chat(`Give 10 short Google search phrases as SEEDS for keyword research about this company's market. Make 7 of them BROAD CATEGORY terms, the generic words a buyer types for this kind of product (for example "website analytics software", "email marketing tools", "crm for small business") and 3 of them "[competitor] alternative" for its main competitors. Generic beats clever: prefer short, common phrases over long specific ones, and never use the company's own name. One per line, no numbering, no commentary.

${brandContext(brand)}`, 400);
  return normalizeKeywords(out.split("\n"), 10);
}

// DataForSEO's related-keywords lookup: real Google Ads keyword ideas with
// monthly US volume for a set of seeds. One task per call, so callers cache it.
export async function relatedKeywords(seeds: string[], brandId?: string): Promise<{ keyword: string; search_volume: number | null }[] | null> {
  if (process.env.DATAFORSEO_ENABLED !== "true" || seeds.length === 0) return null;
  const auth = "Basic " + Buffer.from(`${process.env.DATAFORSEO_LOGIN ?? ""}:${process.env.DATAFORSEO_PASSWORD ?? ""}`).toString("base64");
  try {
    const res = await fetch("https://api.dataforseo.com/v3/keywords_data/google_ads/keywords_for_keywords/live", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: auth },
      body: JSON.stringify([{ keywords: seeds, location_code: 2840, language_code: "en", sort_by: "search_volume" }]),
    });
    if (!res.ok) {
      console.error("[keywords] DataForSEO HTTP", res.status);
      return null;
    }
    const json = (await res.json()) as { cost?: number; tasks?: { cost?: number; status_code?: number; status_message?: string; result?: { keyword: string; search_volume: number | null }[] | null }[] };
    const task = json.tasks?.[0];
    await recordSpend("keywords", task?.cost ?? json.cost, brandId);
    if (task?.status_code !== 20000 || !task.result) {
      console.error("[keywords] DataForSEO task failed", task?.status_code, task?.status_message);
      return null;
    }
    return task.result;
  } catch (e) {
    console.error("[keywords] DataForSEO error", e instanceof Error ? e.message : e);
    return null;
  }
}

async function pickRelevant(brand: KeywordBrand, candidates: RelatedKeyword[]): Promise<KeywordOpportunity[]> {
  const out = await chat(`From the keyword list below, choose the 12 that a HIGH-INTENT BUYER for this company would search when comparing or shopping for a product like it: category searches, "[competitor] alternative(s)", "best ... for ...", comparisons, pricing. Exclude anything unrelated to this company's product, and anything informational, academic, job-related or about a different kind of tool. Reply with the chosen keywords copied EXACTLY as written, one per line, nothing else.

${brandContext(brand)}

KEYWORDS:
${candidates.map((c) => c.keyword).join("\n")}`, 600);
  const picked = resolveSelection(out.split("\n"), candidates);
  if (picked.length >= 3) return picked;
  // The model gave too little back; fall back to the buyer-intent phrasing.
  return candidates.filter((c) => BUYER_INTENT.test(c.keyword)).slice(0, 10).map((c) => ({ keyword: c.keyword, volume: c.volume }));
}

// Fallback when Google data is unavailable: model-suggested buyer keywords,
// shown without volumes.
async function ideasFromAi(brand: KeywordBrand): Promise<string[]> {
  const out = await chat(`List ${MAX_CANDIDATES} Google search keywords that HIGH-INTENT BUYERS in this niche type when they are close to choosing a product like this one: "best [category] for [audience]", "[competitor] alternatives", comparisons, pricing, and specific use cases. Do not build keywords around the company's own name. One per line, no numbering, no commentary.

${brandContext(brand)}`, 1200);
  return normalizeKeywords(out.split("\n"));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// `allowLookup` is a spending gate, asked only right before a paid DataForSEO
// lookup (cache hits and the no-volume fallback never ask). When it says no,
// the step still works, just without volumes.
export async function findKeywordOpportunities(brand: KeywordBrand, db: Db, opts: { allowLookup?: () => Promise<boolean> } = {}): Promise<KeywordResult> {
  const { data: cached } = await db.from("keyword_opportunity_scans").select("keywords, volume_available, created_at").eq("brand_id", brand.id).maybeSingle();
  if (cached && Date.now() - new Date(cached.created_at).getTime() < CACHE_DAYS * 24 * 60 * 60 * 1000) {
    return { keywords: cached.keywords as KeywordOpportunity[], volumeAvailable: !!cached.volume_available };
  }

  const lookupsEnabled = process.env.DATAFORSEO_ENABLED === "true";
  const allowed = lookupsEnabled && (opts.allowLookup ? await opts.allowLookup() : true);
  const related = allowed ? await relatedKeywords(await seedsFromAi(brand), brand.id) : null;
  const candidates = related ? topCandidates(related) : [];
  const picked = candidates.length ? await pickRelevant(brand, candidates) : [];
  // No usable Google data (lookup off, failed, or nothing relevant): still show
  // the model's keyword suggestions, without volumes.
  const result: KeywordResult = picked.length
    ? { keywords: picked, volumeAvailable: true }
    : { keywords: (await ideasFromAi(brand)).slice(0, SHOW).map((keyword) => ({ keyword, volume: null })), volumeAvailable: false };

  // A failed volume lookup isn't cached, so the next visit can try again
  // instead of pinning a numberless list for a week.
  if (result.volumeAvailable && result.keywords.length) {
    await db.from("keyword_opportunity_scans").upsert({ brand_id: brand.id, keywords: result.keywords, volume_available: true, created_at: new Date().toISOString() }, { onConflict: "brand_id" });
  }
  return result;
}
