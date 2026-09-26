import { serverClient } from "@/lib/supabase";
import type { SpendSource } from "@/lib/dataforseo-spend-summary";

// Records what one DataForSEO call cost, straight from the `cost` field DataForSEO
// returns. Bookkeeping must never break a scan or a signup, so this swallows its
// own errors and skips zero-cost (failed) calls.
export async function recordSpend(source: SpendSource, cost: unknown, brandId?: string | null): Promise<void> {
  const n = Number(cost);
  if (!Number.isFinite(n) || n <= 0) return;
  try {
    const { error } = await serverClient().from("dataforseo_spend").insert({ source, cost: n, brand_id: brandId ?? null });
    if (error) console.error("[dataforseo-spend] insert failed", error.message);
  } catch (e) {
    console.error("[dataforseo-spend] insert threw", e instanceof Error ? e.message : e);
  }
}
