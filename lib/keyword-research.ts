import { normalizeKeyword } from "@/lib/autopilot-rules";
import { ENGINE_NAMES, gapsFromScanRows, type GapScanRow, type ServerGap } from "@/lib/gaps";
import type { KeywordOpportunity } from "@/lib/keyword-rules";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// Feeds a brand's keyword-research list into Autopilot's queue so the blogs it
// writes target exactly the keywords shown on the Keywords tab. Keywords that
// already have an article are skipped (a second article would compete with the
// first), and a keyword Autopilot already knows just has its volume refreshed.
export async function syncResearchTopics(db: Db, brandId: string, keywords: KeywordOpportunity[]): Promise<number> {
  if (!keywords.length) return 0;
  const [{ data: topics }, { data: articles }] = await Promise.all([
    db.from("autopilot_topics").select("id, keyword, status, volume").eq("brand_id", brandId),
    db.from("articles").select("keyword").eq("brand_id", brandId),
  ]);
  const topicByKeyword = new Map<string, { id: string; status: string; volume: number | null }>((topics ?? []).map((t: { id: string; keyword: string; status: string; volume: number | null }) => [normalizeKeyword(t.keyword), t]));
  const covered = new Set<string>((articles ?? []).map((a: { keyword: string | null }) => normalizeKeyword(a.keyword ?? "")).filter(Boolean));

  const inserts: { brand_id: string; keyword: string; source: string; volume: number | null }[] = [];
  const volumeUpdates: PromiseLike<unknown>[] = [];
  for (const k of keywords) {
    const keyword = normalizeKeyword(k.keyword);
    if (keyword.length < 3 || keyword.length > 120) continue;
    const existing = topicByKeyword.get(keyword);
    if (existing) {
      // Keep the volume current, but only write when it changed: this runs every time the
      // list is opened, and one write per topic made loading slow for a long queue.
      if (k.volume !== null && k.volume !== existing.volume) volumeUpdates.push(db.from("autopilot_topics").update({ volume: k.volume }).eq("id", existing.id));
      continue;
    }
    if (covered.has(keyword)) continue;
    inserts.push({ brand_id: brandId, keyword, source: "research", volume: k.volume });
  }
  await Promise.all(volumeUpdates);
  if (inserts.length) {
    const { error } = await db.from("autopilot_topics").upsert(inserts, { onConflict: "brand_id,keyword", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return inserts.length;
}

// The AI-visibility gaps from the brand's latest scan: tracked prompts that AI
// engines answer without mentioning the brand.
export async function latestGaps(db: Db, brandId: string): Promise<ServerGap[]> {
  const { data: run } = await db.from("scan_runs").select("id").eq("brand_id", brandId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!run) return [];
  const { data: rows } = await db
    .from("scan_results")
    .select("prompt_id, prompt_text, engine, response, brand_mentioned, competitor_mentions")
    .eq("scan_run_id", run.id);
  return gapsFromScanRows((rows ?? []) as GapScanRow[]);
}

// Queues those prompts for Autopilot next to the keywords, so articles are
// written for what AI is missing you on as well as for what buyers search.
// Prompts that already have a topic or an article are skipped.
export async function syncGapTopics(db: Db, brandId: string, limit = 30): Promise<number> {
  const gaps = await latestGaps(db, brandId);
  if (!gaps.length) return 0;
  const [{ data: topics }, { data: articles }] = await Promise.all([
    db.from("autopilot_topics").select("keyword").eq("brand_id", brandId),
    db.from("articles").select("keyword").eq("brand_id", brandId),
  ]);
  const seen = new Set<string>([...(topics ?? []), ...(articles ?? [])].map((r: { keyword: string | null }) => normalizeKeyword(r.keyword ?? "")).filter(Boolean));
  const base = Date.now();
  const inserts: { brand_id: string; keyword: string; source: string; created_at: string }[] = [];
  for (const g of gaps) {
    const keyword = normalizeKeyword(g.promptText);
    if (keyword.length < 4 || keyword.length > 200 || seen.has(keyword) || inserts.length >= limit) continue;
    seen.add(keyword);
    // Staggered timestamps keep the most-missed prompt first when order falls back to age.
    inserts.push({ brand_id: brandId, keyword, source: "gap", created_at: new Date(base + inserts.length * 1000).toISOString() });
  }
  if (!inserts.length) return 0;
  const { error } = await db.from("autopilot_topics").upsert(inserts, { onConflict: "brand_id,keyword", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  return inserts.length;
}

// For a prompt-based article: which AI engines are missing the brand and which
// competitor they name instead, so the article can be written to win that answer.
export async function gapContext(db: Db, brandId: string, keyword: string): Promise<{ missingEngines: string[]; topCompetitor: string | null } | null> {
  const key = normalizeKeyword(keyword);
  const gap = (await latestGaps(db, brandId)).find((g) => normalizeKeyword(g.promptText) === key);
  if (!gap) return null;
  return { missingEngines: gap.engines.map((e) => ENGINE_NAMES[e] ?? e), topCompetitor: gap.topCompetitor };
}
