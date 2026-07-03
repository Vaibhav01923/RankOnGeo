import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import { runScanForBrand, extractMentions, queryWithRetry, computeScores } from "@/lib/scan-engine";
import { fireAlerts } from "@/lib/alerts";
import { AIEngine, BrandData, ScanResult } from "@/lib/types";

const SCAN_ENGINES: AIEngine[] = ["chatgpt", "gemini", "google"];

// Triggered daily at 8am UTC — fans out one scan job per brand
export const scheduledScanAll = inngest.createFunction(
  { id: "scheduled-scan-all", triggers: [{ event: "scan/cron.disabled" }] },
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
      const { overallScore, scores } = await runScanForBrand(brand, SCAN_ENGINES, db as any);
      return { brand: brand.name, overallScore, scores };
    });

    await step.run("fire-alerts", async () => {
      await fireAlerts(brand.id!, brand.name, result.overallScore, result.scores);
    });

    return { brand: result.brand, overallScore: result.overallScore };
  }
);

// Triggered by the manual "Run Scan" button — uses a pre-created scan_run row
// so the client can poll for results immediately. No HTTP timeout risk.
export const manualScanBrand = inngest.createFunction(
  { id: "manual-scan-brand", retries: 0, triggers: [{ event: "scan/manual.requested" }] },
  async ({ event }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { brandId, scanRunId, engines, promptIds } = (event as any).data as {
      brandId: string;
      scanRunId: string;
      engines: AIEngine[];
      promptIds: string[] | null;
    };

    const db = serverClient();

    // Fetch brand + prompts
    const { data: row } = await db
      .from("brands")
      .select("id, name, domain, niche, description, target_audience, competitors")
      .eq("id", brandId)
      .single();
    if (!row) throw new Error("Brand not found");

    const { data: promptRows } = await db
      .from("tracked_prompts")
      .select("id, text, category")
      .eq("brand_id", brandId);

    const brand: BrandData = {
      id: row.id,
      domain: row.domain,
      name: row.name,
      niche: row.niche,
      description: row.description,
      targetAudience: row.target_audience,
      competitors: row.competitors ?? [],
      trackedPrompts: (promptRows ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category })),
    };

    const promptsToRun = promptIds
      ? brand.trackedPrompts.filter((p) => promptIds.includes(p.id))
      : brand.trackedPrompts;

    if (!promptsToRun.length) throw new Error("No prompts to scan");

    const allResults: ScanResult[] = [];

    const runEngine = async (engine: AIEngine) => {
      for (let i = 0; i < promptsToRun.length; i++) {
        const prompt = promptsToRun[i];
        if (i > 0) {
          const delay = engine === "gemini" || engine === "google" ? 1000 : 200;
          await new Promise((r) => setTimeout(r, delay));
        }
        try {
          const { text, citations: engineCitations } = await queryWithRetry(engine, prompt.text);
          const mentions = extractMentions(text, brand.name, brand.domain, brand.competitors, engineCitations);
          const result: ScanResult = {
            promptId: prompt.id,
            promptText: prompt.text,
            engine,
            response: text,
            ...mentions,
            scannedAt: new Date().toISOString(),
          };
          allResults.push(result);

          // Write each result immediately so the polling client sees live progress
          await db.from("scan_results").insert({
            scan_run_id: scanRunId,
            brand_id: brandId,
            prompt_id: result.promptId,
            prompt_text: result.promptText,
            engine: result.engine,
            response: result.response,
            brand_mentioned: result.brandMentioned,
            brand_rank: result.brandRank,
            competitor_mentions: result.competitorMentions,
            citations: result.citations,
            scanned_at: result.scannedAt,
          });
        } catch (err) {
          console.error(`[manual-scan] ${engine} × "${prompt.text.slice(0, 50)}" FAILED:`, err);
        }
      }
    };

    // All engines in parallel
    await Promise.allSettled(engines.map(runEngine));

    const { scores, overallScore } = computeScores(allResults, engines);

    // Write final scores — the polling client uses their presence to detect completion
    await db.from("scan_runs").update({ overall_score: overallScore }).eq("id", scanRunId);
    await db.from("visibility_scores").insert(
      scores.map((s) => ({
        scan_run_id: scanRunId,
        brand_id: brandId,
        engine: s.engine,
        score: s.score,
        mention_count: s.mentionCount,
        total_prompts: s.totalPrompts,
        avg_rank: s.avgRank,
      }))
    );

    await fireAlerts(brandId, brand.name, overallScore, scores).catch((e) =>
      console.error("[alerts] fireAlerts failed:", e)
    );

    return { brand: brand.name, overallScore };
  }
);
