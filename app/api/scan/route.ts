import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIEngine, BrandData, ScanResult, VisibilityScore } from "@/lib/types";
import { serverClient } from "@/lib/supabase";
import { scanGoogleAIMode } from "@/lib/browser-scanner";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const grok = new OpenAI({ apiKey: process.env.XAI_API_KEY ?? "", baseURL: "https://api.x.ai/v1" });
const gemini = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY ?? "");

function extractMentions(
  response: string,
  brandName: string,
  competitors: string[]
): { brandMentioned: boolean; brandRank: number | null; competitorMentions: { name: string; rank: number | null }[]; citations: string[] } {
  const lower = response.toLowerCase();
  const brandLower = brandName.toLowerCase();

  // Extract numbered list items to determine ranking
  const listItems = response.match(/\d+[\.\)]\s+([^\n]+)/g) ?? [];
  const rankedItems = listItems.map((item, idx) => ({
    rank: idx + 1,
    text: item.toLowerCase(),
  }));

  const brandMentioned = lower.includes(brandLower);
  let brandRank: number | null = null;
  if (brandMentioned) {
    const ranked = rankedItems.find((r) => r.text.includes(brandLower));
    brandRank = ranked ? ranked.rank : null;
  }

  const competitorMentions = competitors.map((c) => {
    const cLower = c.toLowerCase();
    const mentioned = lower.includes(cLower);
    if (!mentioned) return { name: c, rank: null };
    const ranked = rankedItems.find((r) => r.text.includes(cLower));
    return { name: c, rank: ranked ? ranked.rank : null };
  }).filter((c) => lower.includes(c.name.toLowerCase()));

  // Extract URLs
  const urlMatches = response.match(/https?:\/\/[^\s\)\"]+/g) ?? [];
  const citations = [...new Set(urlMatches)].slice(0, 10);

  return { brandMentioned, brandRank, competitorMentions, citations };
}

async function queryEngine(engine: AIEngine, prompt: string): Promise<string> {
  const systemMsg = "You are a helpful assistant. Answer the user's question with specific product/service recommendations. Be concise and list your top recommendations.";

  if (engine === "claude") {
    const msg = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: systemMsg,
      messages: [{ role: "user", content: prompt }],
    });
    return (msg.content[0] as { type: string; text: string }).text;
  }

  if (engine === "chatgpt") {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 600,
      messages: [
        { role: "system", content: systemMsg },
        { role: "user", content: prompt },
      ],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (engine === "gemini") {
    const model = gemini.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
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
    const res = await grok.chat.completions.create({
      model: "grok-3-mini",
      max_tokens: 600,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (engine === "google") {
    // Google AI Mode browser scanning is unreliable — skip for now
    throw new Error("Google AI Mode scanning temporarily disabled");
  }

  return "";
}

export async function POST(req: NextRequest) {
  const { brand, engines, promptIds }: { brand: BrandData; engines: AIEngine[]; promptIds?: string[] } = await req.json();

  if (!brand || !engines?.length) {
    return NextResponse.json({ error: "brand and engines are required" }, { status: 400 });
  }

  const prompts = promptIds
    ? brand.trackedPrompts.filter((p) => promptIds.includes(p.id))
    : brand.trackedPrompts;

  const promptsToRun = prompts.slice(0, 10);
  const jobs: Array<{ prompt: typeof prompts[0]; engine: AIEngine }> = [];
  for (const p of promptsToRun) {
    for (const e of engines) {
      jobs.push({ prompt: p, engine: e });
    }
  }

  const results = await Promise.allSettled(
    jobs.map(async ({ prompt, engine }): Promise<ScanResult> => {
      const response = await queryEngine(engine, prompt.text);
      const mentions = extractMentions(response, brand.name, brand.competitors);
      return {
        promptId: prompt.id,
        promptText: prompt.text,
        engine,
        response,
        ...mentions,
        scannedAt: new Date().toISOString(),
      };
    })
  );

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const job = jobs[i];
      console.error(`[scan] ${job.engine} × "${job.prompt.text.slice(0, 50)}" FAILED:`, r.reason);
    }
  });

  const scanResults: ScanResult[] = results
    .filter((r): r is PromiseFulfilledResult<ScanResult> => r.status === "fulfilled")
    .map((r) => r.value);

  // Compute per-engine scores
  const scores: VisibilityScore[] = engines.map((engine) => {
    const er = scanResults.filter((r) => r.engine === engine);
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

  // Persist to Supabase if brand has an id
  if (brand.id) {
    const db = serverClient();

    const { data: runRow } = await db
      .from("scan_runs")
      .insert({ brand_id: brand.id, engines, overall_score: overallScore })
      .select()
      .single();

    if (runRow) {
      await db.from("scan_results").insert(
        scanResults.map((r) => ({
          scan_run_id: runRow.id,
          brand_id: brand.id,
          prompt_id: r.promptId,
          prompt_text: r.promptText,
          engine: r.engine,
          response: r.response,
          brand_mentioned: r.brandMentioned,
          brand_rank: r.brandRank,
          competitor_mentions: r.competitorMentions,
          citations: r.citations,
          scanned_at: r.scannedAt,
        }))
      );

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
  }

  return NextResponse.json({ results: scanResults, scores, overallScore });
}
