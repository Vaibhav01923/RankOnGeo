import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { runScanForBrand } from "@/lib/scan-engine";
import { AIEngine, BrandData } from "@/lib/types";

export const maxDuration = 300;

const CRON_ENGINES: AIEngine[] = ["chatgpt", "claude"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = serverClient();

  const { data: brands, error } = await db
    .from("brands")
    .select("id, name, domain, niche, description, target_audience, competitors");

  if (error || !brands?.length) {
    return NextResponse.json({ scanned: 0, error: error?.message ?? "No brands found" });
  }

  // Fetch prompts for all brands in parallel, skip brands with none
  const brandsWithPrompts: BrandData[] = (
    await Promise.all(
      brands.map(async (row) => {
        const { data: promptRows } = await db
          .from("tracked_prompts")
          .select("id, text, category")
          .eq("brand_id", row.id)
          .limit(10); // 10 prompts × 2 engines = 20 calls per brand, ~1 min
        if (!promptRows?.length) return null;
        return {
          id: row.id,
          domain: row.domain,
          name: row.name,
          niche: row.niche,
          description: row.description,
          targetAudience: row.target_audience,
          competitors: row.competitors ?? [],
          trackedPrompts: promptRows.map((p) => ({ id: p.id, text: p.text, category: p.category })),
        } as BrandData;
      })
    )
  ).filter(Boolean) as BrandData[];

  // Scan all brands in parallel — each takes ~1 min, together still ~1 min
  const results = await Promise.allSettled(
    brandsWithPrompts.map((brand) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      runScanForBrand(brand, CRON_ENGINES, db as any)
        .then(() => ({ brand: brand.name, ok: true }))
        .catch((e) => ({ brand: brand.name, ok: false, error: (e as Error).message }))
    )
  );

  const succeeded = results.filter((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok).length;
  const failed = results
    .filter((r) => r.status === "rejected" || !(r as PromiseFulfilledResult<{ ok: boolean }>).value.ok)
    .map((r) => (r as PromiseFulfilledResult<{ brand: string; error?: string }>).value?.brand ?? "unknown");

  console.log(`[cron] Scanned ${succeeded}/${brandsWithPrompts.length} brands`);

  return NextResponse.json({ scanned: succeeded, total: brandsWithPrompts.length, failed: failed.length ? failed : undefined });
}
