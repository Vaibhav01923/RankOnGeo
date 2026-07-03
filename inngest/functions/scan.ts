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

// Helper: run one prompt through an engine and write the result to DB immediately
async function runOnePrompt(
  engine: AIEngine,
  prompt: { id: string; text: string; category: string },
  brand: BrandData,
  scanRunId: string,
  brandId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  retries = 1,
) {
  try {
    const { text, citations: engineCitations } = await queryWithRetry(engine, prompt.text, retries);
    const mentions = extractMentions(text, brand.name, brand.domain, brand.competitors, engineCitations);
    await db.from("scan_results").insert({
      scan_run_id: scanRunId,
      brand_id: brandId,
      prompt_id: prompt.id,
      prompt_text: prompt.text,
      engine,
      response: text,
      brand_mentioned: mentions.brandMentioned,
      brand_rank: mentions.brandRank,
      competitor_mentions: mentions.competitorMentions,
      citations: mentions.citations,
      scanned_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`[manual-scan] ${engine} × "${prompt.text.slice(0, 50)}" FAILED:`, err);
  }
}

// Triggered by the manual "Run Scan" button — uses a pre-created scan_run row.
// Prompts are processed in chunks of 5 per engine. Each chunk is its own Inngest step
// (own 300s Vercel window), so scans scale to 500+ prompts without ever timing out.
// Works in the background — user can close the browser tab and the scan continues.
export const manualScanBrand = inngest.createFunction(
  { id: "manual-scan-brand", retries: 0, triggers: [{ event: "scan/manual.requested" }] },
  async ({ event, step }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { brandId, scanRunId, engines, promptIds } = (event as any).data as {
      brandId: string;
      scanRunId: string;
      engines: AIEngine[];
      promptIds: string[] | null;
    };

    // Step 1: fetch brand + prompts (fast DB read, own 300s window)
    const { brand, promptsToRun } = await step.run("fetch-brand", async () => {
      const db = serverClient();
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

      const b: BrandData = {
        id: row.id,
        domain: row.domain,
        name: row.name,
        niche: row.niche,
        description: row.description,
        targetAudience: row.target_audience,
        competitors: row.competitors ?? [],
        trackedPrompts: (promptRows ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category })),
      };

      const prompts = promptIds
        ? b.trackedPrompts.filter((p) => promptIds.includes(p.id))
        : b.trackedPrompts;

      if (!prompts.length) throw new Error("No prompts to scan");
      return { brand: b, promptsToRun: prompts };
    });

    // Steps 2+: process prompts in chunks of 5 per engine.
    // Each chunk runs all engines in parallel (Promise.all over step.run calls).
    // Each step.run = separate Vercel invocation with its own 300s window.
    // 500 prompts / 5 per chunk = 100 chunks × 3 engines = 300 step invocations, all safe.
    const CHUNK_SIZE = 5;
    const numChunks = Math.ceil(promptsToRun.length / CHUNK_SIZE);

    for (let c = 0; c < numChunks; c++) {
      const chunk = promptsToRun.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
      await Promise.all(
        engines.map((engine) =>
          step.run(`scan-${engine}-chunk-${c}`, async () => {
            const db = serverClient();
            const retries = engine === "google" ? 2 : 1;
            await Promise.all(
              chunk.map((prompt) => runOnePrompt(engine, prompt, brand, scanRunId, brandId, db, retries))
            );
            return { done: chunk.length };
          }).catch(() => ({ done: 0 })) // chunk failure → skip, don't abort other engines
        )
      );
    }

    // Final step: read all results from DB, compute scores, signal completion to the poller.
    // Reads from DB rather than accumulating through Inngest state (avoids large payload issues at scale).
    await step.run("write-scores", async () => {
      const db = serverClient();
      const { data: rows } = await db
        .from("scan_results")
        .select("engine, brand_mentioned, brand_rank, competitor_mentions, prompt_id, prompt_text, response, scanned_at")
        .eq("scan_run_id", scanRunId);

      const allResults: ScanResult[] = (rows ?? []).map((r) => ({
        promptId: r.prompt_id,
        promptText: r.prompt_text,
        engine: r.engine as AIEngine,
        response: r.response,
        brandMentioned: r.brand_mentioned,
        brandRank: r.brand_rank,
        competitorMentions: r.competitor_mentions ?? [],
        citations: [],
        scannedAt: r.scanned_at,
      }));

      const { scores, overallScore } = computeScores(allResults, engines);
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
      return { overallScore };
    });

    return { brand: brand.name };
  }
);
