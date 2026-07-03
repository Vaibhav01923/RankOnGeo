import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIEngine, BrandData, ScanResult, VisibilityScore } from "@/lib/types";

const getAnthropic = () => new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const getGrok = () => new OpenAI({ apiKey: process.env.XAI_API_KEY ?? "", baseURL: "https://api.x.ai/v1" });
const getGemini = () => new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY ?? "");

function dataForSEOAuth() {
  const login = process.env.DATAFORSEO_LOGIN ?? "";
  const password = process.env.DATAFORSEO_PASSWORD ?? "";
  return "Basic " + Buffer.from(`${login}:${password}`).toString("base64");
}

const BLOCKED_DOMAINS = [
  // Placeholder/generic domains
  "example.com", "example.org", "example.net", "localhost", "your-domain.com", "yourdomain.com", "domain.com",
  // Google internal/search infrastructure (vertexaisearch.cloud.google.com is handled in filterUrl below)
  "google.com", "googleapis.com", "googleusercontent.com",
  "gstatic.com", "googlesyndication.com", "doubleclick.net",
  // Generic search engines (not relevant citations)
  "bing.com", "search.yahoo.com", "duckduckgo.com", "baidu.com",
  // Generic social aggregators with no page-specific value
  "t.co", "bit.ly", "tinyurl.com", "goo.gl",
];

export function extractMentions(
  response: string,
  brandName: string,
  brandDomain: string,
  competitors: string[],
  extraCitations?: string[]
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
  const filterUrl = (u: string) => {
    try {
      const host = new URL(u).hostname.replace(/^www\./, "");
      // Drop Google infrastructure but keep everything else (reddit, youtube, linkedin, etc.)
      if (host === "vertexaisearch.cloud.google.com") return false;
      if (host === brandHost || host.endsWith("." + brandHost)) return false;
      return !BLOCKED_DOMAINS.some((b) => host === b || host.endsWith("." + b));
    } catch { return false; }
  };

  const textUrls = (response.match(/https?:\/\/[^\s\)\"<>]+/g) ?? [])
    .map((u) => u.replace(/['".,;:!?)\]}>]+$/, ""))
    .filter(filterUrl);

  const extraFiltered = (extraCitations ?? []).filter(filterUrl);
  const citations = [...new Set([...extraFiltered, ...textUrls])];

  return { brandMentioned, brandRank, competitorMentions, citations };
}

export async function queryEngine(engine: AIEngine, prompt: string): Promise<{ text: string; citations: string[] }> {
  const systemMsg = "You are a helpful assistant. Answer the user's question thoroughly and naturally.";

  if (engine === "claude") {
    const msg = await getAnthropic().messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      system: systemMsg,
      messages: [{ role: "user", content: prompt }],
    });
    return { text: (msg.content[0] as { type: string; text: string }).text, citations: [] };
  }

  if (engine === "chatgpt") {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 1000,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
    });
    return { text: res.choices[0]?.message?.content ?? "", citations: [] };
  }

  if (engine === "gemini") {
    // Plain LLM call — NO search grounding tool (grounding costs ~$35/1000 req)
    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(`${systemMsg}\n\nUser: ${prompt}`);
    return { text: result.response.text(), citations: [] };
  }

  if (engine === "google") {
    // DataForSEO SERP API — scrapes real Google AI Overview
    const res = await fetch("https://api.dataforseo.com/v3/serp/google/organic/live/advanced", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: dataForSEOAuth() },
      body: JSON.stringify([{
        keyword: prompt,
        location_name: "United States",
        language_code: "en",
        device: "desktop",
        os: "windows",
        load_async_ai_overview: true, // required — AI Overview loads async via JS
      }]),
      signal: AbortSignal.timeout(45000),
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serpItems: any[] = data?.tasks?.[0]?.result?.[0]?.items ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiOverview = serpItems.find((item: any) => item.type === "ai_overview");

    // markdown holds the full AI Overview text with inline citations stripped
    const text = aiOverview?.markdown ?? "";

    // top-level references[] has all source URLs, deduplicated by DataForSEO
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const citations: string[] = (aiOverview?.references ?? []).map((r: any) => r.url).filter(Boolean);

    return { text, citations };
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
    return { text: data.choices?.[0]?.message?.content ?? "", citations: data.citations ?? [] };
  }

  if (engine === "grok") {
    const res = await getGrok().chat.completions.create({
      model: "grok-3-mini",
      max_tokens: 1000,
      messages: [{ role: "system", content: systemMsg }, { role: "user", content: prompt }],
    });
    return { text: res.choices[0]?.message?.content ?? "", citations: [] };
  }

  return { text: "", citations: [] };
}

export async function queryWithRetry(engine: AIEngine, promptText: string, retries = 1): Promise<{ text: string; citations: string[] }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await queryEngine(engine, promptText);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // Never retry billing blocks, quota errors, or auth failures — they won't succeed
      if (status === 403 || status === 401 || status === 429) throw err;
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  return { text: "", citations: [] };
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

  const runEngine = async (engine: AIEngine) => {
    for (let i = 0; i < brand.trackedPrompts.length; i++) {
      const prompt = brand.trackedPrompts[i];
      const delay = (engine === "gemini" || engine === "google") ? 1000 : 200;
      if (i > 0) await new Promise((r) => setTimeout(r, delay));
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
  };

  // All engines in parallel — gemini-2.5-flash has 1000 RPM on paid tier.
  await Promise.allSettled(engines.map(runEngine));

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
