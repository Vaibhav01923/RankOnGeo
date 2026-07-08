// Cadence management for tracked prompts.
//
// A prompt that's been "won" (brand mentioned by every engine) for
// WON_STREAK_TO_MONITOR consecutive scans drops from daily to weekly cadence —
// monitoring mode. Scheduled scans skip weekly prompts until they're due, which
// cuts scan spend on stable prompts without going blind: the moment a weekly
// check shows a dropped mention, the prompt snaps back to daily.

export const WON_STREAK_TO_MONITOR = 7;
export const WEEKLY_INTERVAL_MS = 6.5 * 24 * 60 * 60 * 1000; // slack so "weekly" fires on day 7, not day 8

type PromptCadenceRow = {
  id: string;
  status: string;
  cadence: string;
  won_streak: number;
  last_scanned_at: string | null;
};

// Scheduled scans: active prompts on daily cadence always run; weekly ones run
// only when due. (Manual scans ignore cadence — the user asked, so we scan.)
export function isDueForScheduledScan(p: PromptCadenceRow): boolean {
  if (p.status === "paused") return false;
  if (p.cadence !== "weekly") return true;
  if (!p.last_scanned_at) return true;
  return Date.now() - new Date(p.last_scanned_at).getTime() >= WEEKLY_INTERVAL_MS;
}

// After a scan run: bump/reset each scanned prompt's won streak and shift its
// cadence. Won in every engine that answered → streak+1 (→ weekly at the
// threshold). Missed anywhere → streak 0 and back to daily.
export async function updatePromptCadence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  brandId: string,
  scanRunId: string
): Promise<{ downshifted: number; restored: number }> {
  const { data: results } = await db
    .from("scan_results")
    .select("prompt_id, brand_mentioned")
    .eq("scan_run_id", scanRunId);
  if (!results?.length) return { downshifted: 0, restored: 0 };

  const wonByPrompt = new Map<string, boolean>();
  for (const r of results) {
    if (!r.prompt_id) continue;
    const prev = wonByPrompt.get(r.prompt_id);
    wonByPrompt.set(r.prompt_id, (prev ?? true) && !!r.brand_mentioned);
  }

  const { data: prompts } = await db
    .from("tracked_prompts")
    .select("id, status, cadence, won_streak, last_scanned_at")
    .eq("brand_id", brandId)
    .in("id", [...wonByPrompt.keys()]);
  if (!prompts?.length) return { downshifted: 0, restored: 0 };

  const now = new Date().toISOString();
  let downshifted = 0;
  let restored = 0;

  await Promise.all(
    (prompts as PromptCadenceRow[]).map((p) => {
      const won = wonByPrompt.get(p.id) ?? false;
      const streak = won ? p.won_streak + 1 : 0;
      let cadence = p.cadence;
      if (won && streak >= WON_STREAK_TO_MONITOR && cadence === "daily") {
        cadence = "weekly";
        downshifted++;
      } else if (!won && cadence === "weekly") {
        cadence = "daily";
        restored++;
      }
      return db
        .from("tracked_prompts")
        .update({ won_streak: streak, cadence, last_scanned_at: now })
        .eq("id", p.id);
    })
  );

  return { downshifted, restored };
}
