import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIEngine, BrandData, ScanResult, VisibilityScore } from "@/lib/types";

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const getGrok = () => new OpenAI({ apiKey: process.env.XAI_API_KEY ?? "", baseURL: "https://api.x.ai/v1" });
const getGemini = () => new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY ?? "");

const BLOCKED_DOMAINS = ["example.com", "example.org", "example.net", "localhost", "your-domain.com", "yourdomain.com", "domain.com"];

export function extractMentions(
  response: string,
  brandName: string,
  brandDomain: string,
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

  const brandHost = brandDomain.replace(/^www\./, "");
  const urlMatches = (response.match(/https?:\/\/[^\s\)\"<>]+/g) ?? [])
    .map((u) => u.replace(/['".,;:!?)\]}>]+$/, ""))
    .filter((u) => {
      try {
        const host = new URL(u).hostname.replace(/^www\./, "");
        if (host === brandHost || host.endsWith("." + brandHost)) return false;
        return !BLOCKED_DOMAINS.some((b) => host === b || host.endsWith("." + b));
      } catch { return false; }
    });
  const citations = [...new Set(urlMatches)].slice(0, 10);

  return { brandMentioned, brandRank, competitorMentions, citations };
}

export async function queryEngine(engine: AIEngine, prompt: string): Promise<string> {
  const systemMsg = "You are a helpful assistant. Answer the user's question with specific product/service recommendations. List your top recommendations and include URLs to their official websites or relevant resources where applicable.";

  if (engine === "claude") {
    const msg = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemMsg,
      messages: [{ role: "user", content: prompt }],
    });
    return (msg.content[0] as { type: string; text: string }).text;
  }

  if (engine === "chatgpt") {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (engine === "gemini") {
    const model = getGemini().getGenerativeModel({
      model: "gemini-3.5-flash",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: [{ googleSearch: {} } as any],
    });
    const result = await model.generateContent(`${systemMsg}\n\nUser: ${prompt}`);
    const text = result.response.text();
    // Extract grounding source URLs returned by Google Search
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chunks: any[] = (result.response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks ?? [];
    const groundingUrls: string[] = chunks.map((c: any) => c?.web?.uri).filter(Boolean);
    return groundingUrls.length ? `${text}\n\nSources:\n${groundingUrls.join("\n")}` : text;
  }

  if (engine === "perplexity") {
    const res = await fetch("https://api.perplexity.ai/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}` },
      body: JSON.stringify({
        model: "llama-3.1-sonar-small-128k-online",
        messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
        max_tokens: 1000,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    // Perplexity returns cited URLs in a top-level citations array — append so extractMentions picks them up
    const citationUrls: string[] = data.citations ?? [];
    return citationUrls.length ? `${text}\n\nSources:\n${citationUrls.join("\n")}` : text;
  }

  if (engine === "grok") {
    const res = await getGrok().chat.completions.create({
      model: "grok-3-mini",
      max_tokens: 1000,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
    });
    return res.choices[0]?.message?.content ?? "";
  }

  if (engine === "google") {
    throw new Error("Google AI Mode scanning temporarily disabled");
  }

  return "";
}

export async function queryWithRetry(engine: AIEngine, promptText: string, retries = 2): Promise<string> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await queryEngine(engine, promptText);
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return "";
}

export function computeScores(results: ScanResult[], engines: AIEngine[]): { scores: VisibilityScore[]; overallScore: number } {
  const scores: VisibilityScore[] = engines.map((engine) => {
    const er = results.filter((r) => r.engine === engine);
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
  return { scores, overallScore };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function runScanForBrand(
  brand: BrandData,
  engines: AIEngine[],
  db: any
): Promise<{ results: ScanResult[]; scores: VisibilityScore[]; overallScore: number }> {
  const { data: runRow } = await db
    .from("scan_runs")
    .insert({ brand_id: brand.id, engines, overall_score: 0 })
    .select()
    .single();

  const allResults: ScanResult[] = [];

  await Promise.allSettled(engines.map(async (engine) => {
    for (let i = 0; i < brand.trackedPrompts.length; i++) {
      const prompt = brand.trackedPrompts[i];
      if (i > 0) await new Promise((r) => setTimeout(r, 200));
      try {
        const response = await queryWithRetry(engine, prompt.text);
        const mentions = extractMentions(response, brand.name, brand.domain, brand.competitors);
        const result: ScanResult = {
          promptId: prompt.id,
          promptText: prompt.text,
          engine,
          response,
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
      } catch (err) {
        console.error(`[scan] ${engine} × "${prompt.text.slice(0, 50)}" FAILED:`, err);
      }
    }
  }));

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

  return { results: allResults, scores, overallScore };
}
