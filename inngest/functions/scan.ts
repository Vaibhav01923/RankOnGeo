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
  results: ScanResult[],
  retries = 1,
) {
  try {
    const { text, citations: engineCitations } = await queryWithRetry(engine, prompt.text, retries);
    const mentions = extractMentions(text, brand.name, brand.domain, brand.competitors, engineCitations);
    const result: ScanResult = {
      promptId: prompt.id,
      promptText: prompt.text,
      engine,
      response: text,
      ...mentions,
      scannedAt: new Date().toISOString(),
    };
    results.push(result);
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

// Triggered by the manual "Run Scan" button — uses a pre-created scan_run row.
// Each engine runs in its own Inngest step → own 300s Vercel window → no total timeout.
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

    // Steps 2+: one Inngest step per engine — each runs in parallel with its own 300s window.
    // .catch(() => []) ensures a single engine failure doesn't abort the others.
    const engineResultArrays = await Promise.all(
      engines.map((engine) =>
        step.run(`scan-engine-${engine}`, async () => {
          const db = serverClient(); // fresh connection per step invocation
          const results: ScanResult[] = [];

          if (engine === "google") {
            // DataForSEO: no rate limit — run 4 prompts concurrently per batch
            // Each prompt gets 2 retries (3 × 20s = 60s max) to handle slow responses
            const BATCH = 4;
            for (let i = 0; i < promptsToRun.length; i += BATCH) {
              const batch = promptsToRun.slice(i, i + BATCH);
              await Promise.all(
                batch.map((prompt) => runOnePrompt(engine, prompt, brand, scanRunId, brandId, db, results, 2))
              );
            }
          } else {
            // ChatGPT / Gemini: sequential with small inter-prompt delays
            for (let i = 0; i < promptsToRun.length; i++) {
              if (i > 0) await new Promise((r) => setTimeout(r, engine === "gemini" ? 1000 : 200));
              await runOnePrompt(engine, promptsToRun[i], brand, scanRunId, brandId, db, results, 1);
            }
          }
          return results;
        }).catch(() => [] as ScanResult[]) // engine failure → empty array, not a crash
      )
    );

    // Step 3: compute + write scores — this is the completion signal the poller waits for.
    // Runs even if some engines returned empty (partial results > no results).
    await step.run("write-scores", async () => {
      const db = serverClient();
      const allResults = engineResultArrays.flat();
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
