import { NextRequest } from "next/server";
import { AIEngine, BrandData } from "@/lib/types";
import { clientFromRequest } from "@/lib/supabase";
import { extractMentions, queryWithRetry, computeScores } from "@/lib/scan-engine";
import { fireAlerts } from "@/lib/alerts";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const { brandId, engines, promptIds }: { brandId: string; engines: AIEngine[]; promptIds?: string[] } = await req.json();

  if (!brandId || !engines?.length) {
    return new Response(JSON.stringify({ error: "brandId and engines are required" }), { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();

  const { data: brandRow } = await db
    .from("brands").select("*").eq("id", brandId).eq("user_id", user?.id).single();

  if (!brandRow) {
    return new Response(JSON.stringify({ error: "Brand not found" }), { status: 404 });
  }

  const { data: promptRows } = await db
    .from("tracked_prompts").select("id, text, category").eq("brand_id", brandId);

  const brand: BrandData = {
    id: brandRow.id,
    domain: brandRow.domain,
    name: brandRow.name,
    niche: brandRow.niche,
    description: brandRow.description,
    targetAudience: brandRow.target_audience,
    competitors: brandRow.competitors,
    trackedPrompts: (promptRows ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category })),
  };

  const allPrompts = brand.trackedPrompts;
  const promptsToRun = promptIds ? allPrompts.filter((p) => promptIds.includes(p.id)) : allPrompts;

  const { data: runRow } = await db
    .from("scan_runs")
    .insert({ brand_id: brand.id, engines, overall_score: 0 })
    .select().single();

  const enc = new TextEncoder();
  const allResults: import("@/lib/types").ScanResult[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        try { controller.enqueue(enc.encode(JSON.stringify(obj) + "\n")); } catch {}
      };

      const runEngine = async (engine: import("@/lib/types").AIEngine) => {
        for (let i = 0; i < promptsToRun.length; i++) {
          const prompt = promptsToRun[i];
          // gemini-2.5-flash paid: 1000 RPM — 500ms gap keeps us well under quota.
          const delay = (engine === "gemini" || engine === "google") ? 500 : 200;
          if (i > 0) await new Promise((r) => setTimeout(r, delay));
          try {
            const { text, citations: engineCitations } = await queryWithRetry(engine, prompt.text);
            const mentions = extractMentions(text, brand.name, brand.domain, brand.competitors, engineCitations);
            const result: import("@/lib/types").ScanResult = {
              promptId: prompt.id,
              promptText: prompt.text,
              engine,
              response: text,
              ...mentions,
              scannedAt: new Date().toISOString(),
            };
            allResults.push(result);

            if (runRow) {
              await db.from("scan_results").insert({
                scan_run_id: runRow.id,
                brand_id: brand.id,
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
            }

            send({ type: "result", result });
          } catch (err) {
            console.error(`[scan] ${engine} × "${prompt.text.slice(0, 50)}" FAILED:`, err);
            send({ type: "error", engine, promptId: prompt.id });
          }
        }
      };

      // All engines run in parallel. gemini-2.5-flash has 1000 RPM on paid tier
      // so running gemini + google simultaneously (40 req / 20 prompts) is fine.
      console.log(`[scan] engines=${JSON.stringify(engines)} prompts=${promptsToRun.length}`);
      await Promise.allSettled(engines.map((e) => runEngine(e as import("@/lib/types").AIEngine)));

      const { scores, overallScore } = computeScores(allResults, engines);

      if (runRow) {
        await db.from("scan_runs").update({ overall_score: overallScore }).eq("id", runRow.id);
        await db.from("visibility_scores").insert(
          scores.map((s) => ({
            scan_run_id: runRow.id,
            brand_id: brand.id,
            engine: s.engine,
            score: s.score,
            mention_count: s.mentionCount,
            total_prompts: s.totalPrompts,
            avg_rank: s.avgRank,
          }))
        );
      }

      // Send done to client first, then await alerts before closing so the
      // Vercel function stays alive long enough to deliver webhooks.
      send({ type: "done", scores, overallScore });
      await fireAlerts(brand.id!, brand.name, overallScore, scores).catch((e) =>
        console.error("[alerts] fireAlerts failed:", e)
      );
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
