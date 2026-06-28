import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIEngine, BrandData, ScanResult, VisibilityScore } from "@/lib/types";
import { clientFromRequest } from "@/lib/supabase";
import { scanGoogleAIMode } from "@/lib/browser-scanner";

export const maxDuration = 300;

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const getGrok = () => new OpenAI({ apiKey: process.env.XAI_API_KEY ?? "", baseURL: "https://api.x.ai/v1" });
const getGemini = () => new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY ?? "");

function extractMentions(
  response: string,
  brandName: string,
  competitors: string[]
): { brandMentioned: boolean; brandRank: number | null; competitorMentions: { name: string; rank: number | null }[]; citations: string[] } {
  const lower = response.toLowerCase();
  const brandLower = brandName.toLowerCase();

  const listItems = response.match(/\d+[\.\)]\s+([^\n]+)/g) ?? [];
  const rankedItems = listItems.map((item, idx) => ({ rank: idx + 1, text: item.toLowerCase() }));

  const brandMentioned = lower.includes(brandLower);
  let brandRank: number | null = null;
  if (brandMentioned) {
    const ranked = rankedItems.find((r) => r.text.includes(brandLower));
    brandRank = ranked ? ranked.rank : null;
  }

  const competitorMentions = competitors
    .map((c) => {
      const cLower = c.toLowerCase();
      if (!lower.includes(cLower)) return null;
      const ranked = rankedItems.find((r) => r.text.includes(cLower));
      return { name: c, rank: ranked ? ranked.rank : null };
    })
    .filter(Boolean) as { name: string; rank: number | null }[];

  const BLOCKED_DOMAINS = ["example.com", "example.org", "example.net", "localhost", "your-domain.com", "yourdomain.com", "domain.com"];
  const urlMatches = (response.match(/https?:\/\/[^\s\)\"<>]+/g) ?? [])
    .map((u) => u.replace(/['".,;:!?)\]}>]+$/, ""))
    .filter((u) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, "");
        return !BLOCKED_DOMAINS.some((b) => host === b || host.endsWith("." + b));
      } catch { return false; }
    });
  const citations = [...new Set(urlMatches)].slice(0, 10);

  return { brandMentioned, brandRank, competitorMentions, citations };
}

async function queryEngine(engine: AIEngine, prompt: string): Promise<string> {
  const systemMsg = "You are a helpful assistant. Answer the user's question with specific product/service recommendations. Be concise and list your top recommendations.";

  if (engine === "claude") {
    const msg = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemMsg,
      messages: [{ role: "user", content: prompt }],
    });
    return (msg.content[0] as { type: string; text: string }).text;
  }

  if (engine === "chatgpt") {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (engine === "gemini") {
    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
    const result = await model.generateContent(`${systemMsg}\n\nUser: ${prompt}`);
    return result.response.text();
  }

  if (engine === "perplexity") {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
        max_tokens: 600,
      }),
    });
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }

  if (engine === "grok") {
    const res = await getGrok().chat.completions.create({
      model: "grok-3-mini",
      max_tokens: 600,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (engine === "google") {
    throw new Error("Google AI Mode scanning temporarily disabled");
  }

  return "";
}

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

  // Create scan_run up front so we have the ID for streaming inserts
  const { data: runRow } = await db
    .from("scan_runs")
    .insert({ brand_id: brand.id, engines, overall_score: 0 })
    .select().single();

  const enc = new TextEncoder();
  const allResults: ScanResult[] = [];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        try { controller.enqueue(enc.encode(JSON.stringify(obj) + "\n")); } catch {}
      };

      // Engines run in parallel; prompts within each engine run sequentially
      // with a small polite delay. Paid API keys handle this comfortably.
      await Promise.allSettled(engines.map(async (engine) => {
        for (let i = 0; i < promptsToRun.length; i++) {
          const prompt = promptsToRun[i];
          if (i > 0) await new Promise((r) => setTimeout(r, 200));
          try {
            const response = await queryEngine(engine, prompt.text);
            const mentions = extractMentions(response, brand.name, brand.competitors);
            const result: ScanResult = {
              promptId: prompt.id,
              promptText: prompt.text,
              engine,
              response,
              ...mentions,
              scannedAt: new Date().toISOString(),
            };
            allResults.push(result);

            // Persist each result as it arrives
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
      }));

      // Compute scores from all collected results
      const scores: VisibilityScore[] = engines.map((engine) => {
        const er = allResults.filter((r) => r.engine === engine);
        const mentions = er.filter((r) => r.brandMentioned);
        const ranked = mentions.filter((r) => r.brandRank !== null);
        const avgRank = ranked.length
          ? ranked.reduce((s, r) => s + (r.brandRank ?? 0), 0) / ranked.length
          : null;
        return {
          engine,
          score: er.length ? Math.round((mentions.length / er.length) * 100) : 0,
          mentionCount: mentions.length,
          totalPrompts: er.length,
          avgRank,
        };
      });
      const overallScore = scores.length
        ? Math.round(scores.reduce((s, sc) => s + sc.score, 0) / scores.length)
        : 0;

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

      send({ type: "done", scores, overallScore });
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
