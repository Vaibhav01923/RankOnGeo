// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export type BrandEdits = {
  name: string;
  niche: string;
  competitors: string[];
  targetAudience: string[];
  prompts?: { id?: string; text: string; category: string }[];
};

// Shared by the authenticated PUT /api/brand and the post-signup brand
// claim: updates brand fields and reconciles tracked_prompts rather than
// blindly delete-and-replace, so prompts the caller is keeping retain their
// real row (and its scan history/cadence state) instead of being recreated
// with a new id.
export async function applyBrandEdits(db: Db, brandId: string, edits: BrandEdits) {
  const { name, niche, competitors, targetAudience, prompts } = edits;

  const { error: brandErr } = await db
    .from("brands")
    .update({ name, niche, competitors, target_audience: targetAudience })
    .eq("id", brandId);
  if (brandErr) return { error: brandErr.message };

  if (Array.isArray(prompts)) {
    const { data: existingRows } = await db.from("tracked_prompts").select("id").eq("brand_id", brandId);
    const existingIds = new Set<string>((existingRows ?? []).map((r: { id: string }) => r.id));

    const keptIds = new Set<string>(prompts.map((p) => p.id).filter((pid): pid is string => !!pid && existingIds.has(pid)));
    const toRemove: string[] = [...existingIds].filter((eid: string) => !keptIds.has(eid));
    if (toRemove.length > 0) {
      await db.from("tracked_prompts").delete().in("id", toRemove);
    }

    const toInsert = prompts.filter((p) => !p.id || !existingIds.has(p.id));
    if (toInsert.length > 0) {
      await db.from("tracked_prompts").insert(
        toInsert.map((p) => ({ brand_id: brandId, text: p.text, category: p.category }))
      );
    }
  }

  return { error: null };
}
