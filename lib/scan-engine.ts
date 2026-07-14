import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { AIEngine, BrandData, ScanResult, VisibilityScore } from "@/lib/types";
import { updatePromptCadence } from "@/lib/prompt-cadence";

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
  // DataForSEO CDN — their own image cache leaks into references[]
  "dataforseo.com",
  // Generic search engines (not relevant citations)
  "bing.com", "search.yahoo.com", "duckduckgo.com", "baidu.com",
  // Generic social aggregators with no page-specific value
  "t.co", "bit.ly", "tinyurl.com", "goo.gl",
];

// Negation cues that, when they share a sentence with a name, mean the model
// doesn't actually know/recommend it — "I'm not sure about XYZ" or "couldn't
// find its domain" would otherwise count the same as a genuine mention and
// inflate the score on exactly the answers that should hurt it most.
const NEGATION_PHRASES = [
  "not sure about", "not familiar with", "unfamiliar with", "not aware of",
  "don't know", "do not know", "doesn't know", "does not know",
  "couldn't find", "could not find", "unable to find", "not able to find",
  "no information about", "no information on", "haven't heard of", "have not heard of",
  "never heard of", "doesn't exist", "does not exist", "no results for",
  "no record of", "not a real", "isn't a real", "is not a real",
  "not confident", "unclear if", "unclear whether", "can't confirm", "cannot confirm",
];

// Bullet/numbered list items often have no trailing period, so a line break
// counts as a sentence boundary too, not just . ! ?
function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter(Boolean);
}

// A name only counts as mentioned if at least one sentence containing it is
// free of a negation cue — being named in a sentence that denies knowing it
// isn't a mention.
function isGenuineMention(nameLower: string, sentences: string[]): boolean {
  return sentences.some((s) => {
    const sLower = s.toLowerCase();
    if (!sLower.includes(nameLower)) return false;
    return !NEGATION_PHRASES.some((p) => sLower.includes(p));
  });
}

function isGenuineListLine(text: string): boolean {
  return !NEGATION_PHRASES.some((p) => text.includes(p));
}

export function extractMentions(
  response: string,
  brandName: string,
  brandDomain: string,
  competitors: string[],
  extraCitations?: string[]
): { brandMentioned: boolean; brandRank: number | null; competitorMentions: { name: string; rank: number | null }[]; citations: string[] } {
  const brandLower = brandName.toLowerCase();
  const sentences = splitSentences(response);

  const listItems = response.match(/\d+[\.\)]\s+([^\n]+)/g) ?? [];
  const rankedItems = listItems.map((item, idx) => ({ rank: idx + 1, text: item.toLowerCase() }));

  const brandMentioned = isGenuineMention(brandLower, sentences);
  let brandRank: number | null = null;
  if (brandMentioned) {
    const ranked = rankedItems.find((r) => r.text.includes(brandLower) && isGenuineListLine(r.text));
    brandRank = ranked ? ranked.rank : null;
  }

  const competitorMentions = competitors
    .map((c) => {
      const cLower = c.toLowerCase();
      if (!isGenuineMention(cLower, sentences)) return null;
      const ranked = rankedItems.find((r) => r.text.includes(cLower) && isGenuineListLine(r.text));
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

export type EngineAnswer = {
  text: string;
  citations: string[];
  /** True when the engine genuinely had no answer surface for this query
      (e.g. Google showed no AI Overview on the SERP). Not a failure — the
      result should be skipped, not recorded as "brand not mentioned". */
  unavailable?: boolean;
};

// Models are pinned to what consumers get by default in each product's web
// UI, since that's the audience whose answers we're measuring. claude.ai
// defaults to Sonnet 5 (since 2026-07-01) — DataForSEO doesn't offer it yet,
// so we use their newest Sonnet; bump when claude-sonnet-5 appears in
// /v3/ai_optimization/claude/llm_responses/models. perplexity.ai's default
// search mode runs their in-house sonar model.
const DATAFORSEO_LLM_MODELS = {
  claude: "claude-sonnet-4-6",
  perplexity: "sonar",
} as const;

// web_search:true makes an engine answer like its consumer UI does: grounded
// in live search results with cited sources. Perplexity's whole product is
// search-grounded, so it stays on. Claude's web_search is off — Anthropic
// bills it separately ($10/1000 searches) on top of Sonnet-tier tokens, which
// made Claude ~4x Perplexity's per-query cost and the single largest line
// item in a scan; Claude still answers (just without live citations), and
// Perplexity already covers the "grounded, cited AI answer" case cheaply.
const DATAFORSEO_WEB_SEARCH: Record<keyof typeof DATAFORSEO_LLM_MODELS, boolean> = {
  claude: false,
  perplexity: true,
};

// DataForSEO AI Optimization — LLM Responses live endpoint. One vendor for
// Claude + Perplexity (no Anthropic/Perplexity accounts needed).
async function queryDataForSEOLLM(llmType: keyof typeof DATAFORSEO_LLM_MODELS, prompt: string): Promise<EngineAnswer> {
  const res = await fetch(`https://api.dataforseo.com/v3/ai_optimization/${llmType}/llm_responses/live`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: dataForSEOAuth() },
    body: JSON.stringify([{
      user_prompt: prompt.slice(0, 500), // API caps user_prompt at 500 chars
      model_name: DATAFORSEO_LLM_MODELS[llmType],
      web_search: DATAFORSEO_WEB_SEARCH[llmType],
    }]),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const task: any = data?.tasks?.[0];
  // Same convention as the SERP endpoint: failures arrive wrapped in HTTP 200
  if (data?.status_code !== 20000 || (task && task.status_code !== 20000)) {
    throw new Error(
      `DataForSEO error ${task?.status_code ?? data?.status_code}: ${task?.status_message ?? data?.status_message ?? "unknown"}`
    );
  }

  // The answer arrives as message items split into sections — fragments of
  // one continuous text, each carrying the annotations (cited URLs) for the
  // claim it makes. Join fragments as-is; collect every annotation URL.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sections: any[] = (task?.result?.[0]?.items ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .flatMap((item: any) => item?.sections ?? []);
  const text = sections.map((s) => s?.text ?? "").join("");
  const citations = [
    ...new Set(
      sections
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .flatMap((s) => (s?.annotations ?? []).map((a: any) => a?.url))
        .filter(Boolean) as string[]
    ),
  ];
  return { text, citations };
}

export async function queryEngine(engine: AIEngine, prompt: string): Promise<EngineAnswer> {
  const systemMsg = "You are a helpful assistant. Answer the user's question thoroughly and naturally.";

  if (engine === "claude") {
    return queryDataForSEOLLM("claude", prompt);
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
    const model = getGemini().getGenerativeModel({ model: "gemini-2.5-flash-lite" });
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
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`DataForSEO HTTP ${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const task: any = data?.tasks?.[0];
    // DataForSEO wraps failures (bad auth, no credits, bad request) in HTTP 200
    // responses — 20000 is their success code. Throw so these surface as engine
    // failures instead of being silently recorded as "brand not mentioned".
    if (data?.status_code !== 20000 || (task && task.status_code !== 20000)) {
      throw new Error(
        `DataForSEO error ${task?.status_code ?? data?.status_code}: ${task?.status_message ?? data?.status_message ?? "unknown"}`
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const serpItems: any[] = task?.result?.[0]?.items ?? [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const aiOverview = serpItems.find((item: any) => item.type === "ai_overview");

    // Google shows no AI Overview for many queries — that's a real outcome,
    // not an empty answer. Callers skip these instead of storing them.
    if (!aiOverview) return { text: "", citations: [], unavailable: true };

    // markdown holds the full AI Overview text with inline citations stripped;
    // when it's null the content usually still exists in items[].text
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fromItems: string = (aiOverview.items ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((it: any) => it?.text ?? it?.title ?? "")
      .filter(Boolean)
      .join("\n\n");
    const text: string = aiOverview.markdown ?? fromItems;

    // top-level references[] has all source URLs, deduplicated by DataForSEO
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const citations: string[] = (aiOverview.references ?? []).map((r: any) => r.url).filter(Boolean);

    // AI Overview block present but still loading / empty — treat as absent
    if (!text.trim()) return { text: "", citations: [], unavailable: true };

    return { text, citations };
  }

  if (engine === "perplexity") {
    return queryDataForSEOLLM("perplexity", prompt);
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

export async function queryWithRetry(engine: AIEngine, promptText: string, retries = 1): Promise<EngineAnswer> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await queryEngine(engine, promptText);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      // Never retry billing blocks, quota errors, or auth failures — they won't succeed
      if (status === 403 || status === 401 || status === 429) throw err;
      if (attempt === retries) throw err;
      // Exponential backoff (1.5s, 3s, 6s, 12s...) — a flat/linear delay wasn't
      // enough to ride out Gemini's transient "high demand" 503s, which caused
      // most retried calls to fail anyway and get silently dropped from results.
      await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
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
        const answer = await queryWithRetry(engine, prompt.text);
        if (answer.unavailable) {
          console.log(`[scan] ${engine} × "${prompt.text.slice(0, 50)}" — no answer surface (e.g. no AI Overview), skipped`);
          continue;
        }
        const { text, citations: engineCitations } = answer;
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

  // All engines in parallel.
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
    await updatePromptCadence(db, brand.id!, runRow.id).catch((e: Error) =>
      console.error("[scan] updatePromptCadence failed:", e)
    );
  }

  return { results: allResults, scores, overallScore };
}
