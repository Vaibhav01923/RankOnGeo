import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import { runScanForBrand } from "@/lib/scan-engine";
import { AIEngine, BrandData } from "@/lib/types";

const SCAN_ENGINES: AIEngine[] = ["chatgpt", "gemini", "google"];

// Triggered daily at 8am UTC — fans out one scan job per brand
export const scheduledScanAll = inngest.createFunction(
  { id: "scheduled-scan-all", triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }) => {
    const db = serverClient();

    const brands = await step.run("fetch-brands", async () => {
      const { data, error } = await db
        .from("brands")
        .select("id, name");
      if (error) throw new Error(error.message);
      return data ?? [];
    });

    if (!brands.length) return { queued: 0 };

    // Fan out: send one event per brand so each scans independently
    await step.sendEvent(
      "send-per-brand-events",
      brands.map((b) => ({
        name: "scan/brand.requested" as const,
        data: { brandId: b.id },
      }))
    );

    return { queued: brands.length };
  }
);

// Runs once per brand — fetches prompts and calls the scan engine
export const scanBrand = inngest.createFunction(
  { id: "scan-brand", retries: 0, triggers: [{ event: "scan/brand.requested" }] },
  async ({ event, step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { brandId } = (event as any).data as { brandId: string };
    const db = serverClient();

    const brand = await step.run("fetch-brand", async () => {
      const { data: row, error } = await db
        .from("brands")
        .select("id, name, domain, niche, description, target_audience, competitors")
        .eq("id", brandId)
        .single();
      if (error || !row) throw new Error(error?.message ?? "Brand not found");

      const { data: promptRows } = await db
        .from("tracked_prompts")
        .select("id, text, category")
        .eq("brand_id", brandId);

      if (!promptRows?.length) throw new Error("No prompts for brand");

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
    });

    const result = await step.run("run-scan", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { overallScore } = await runScanForBrand(brand, SCAN_ENGINES, db as any);
      return { brand: brand.name, overallScore };
    });

    return result;
  }
);
