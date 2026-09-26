import { normalizeKeyword } from "@/lib/autopilot-rules";
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
    db.from("autopilot_topics").select("id, keyword, status").eq("brand_id", brandId),
    db.from("articles").select("keyword").eq("brand_id", brandId),
  ]);
  const topicByKeyword = new Map<string, { id: string; status: string }>((topics ?? []).map((t: { id: string; keyword: string; status: string }) => [normalizeKeyword(t.keyword), t]));
  const covered = new Set<string>((articles ?? []).map((a: { keyword: string | null }) => normalizeKeyword(a.keyword ?? "")).filter(Boolean));

  const inserts: { brand_id: string; keyword: string; source: string; volume: number | null }[] = [];
  for (const k of keywords) {
    const keyword = normalizeKeyword(k.keyword);
    if (keyword.length < 3 || keyword.length > 120) continue;
    const existing = topicByKeyword.get(keyword);
    if (existing) {
      // Keep the volume current without touching a topic that's already been used or skipped.
      if (k.volume !== null) await db.from("autopilot_topics").update({ volume: k.volume }).eq("id", existing.id);
      continue;
    }
    if (covered.has(keyword)) continue;
    inserts.push({ brand_id: brandId, keyword, source: "research", volume: k.volume });
  }
  if (inserts.length) {
    const { error } = await db.from("autopilot_topics").upsert(inserts, { onConflict: "brand_id,keyword", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return inserts.length;
}
