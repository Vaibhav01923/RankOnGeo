import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { BrandData, TrackedPrompt } from "@/lib/types";
import { serverClient } from "@/lib/supabase";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);
    $("script, style, nav, footer, head").remove();
    return $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);
  } catch {
    return "";
  }
}

async function crawlSite(domain: string): Promise<string> {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const origin = new URL(base).origin;

  const homepageRes = await fetch(base, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!homepageRes.ok) throw new Error("Could not reach site");
  const homepageHtml = await homepageRes.text();

  const $ = cheerio.load(homepageHtml);
  const links = new Set<string>([base]);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const resolved = new URL(href, origin).href;
      if (resolved.startsWith(origin) && !resolved.includes("#")) links.add(resolved);
    } catch {}
  });

  const toVisit = Array.from(links).slice(0, 5);
  const texts = await Promise.allSettled(toVisit.map(fetchPage));
  return texts
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && r.value.length > 0)
    .map((r) => r.value)
    .join("\n\n---\n\n")
    .slice(0, 12000);
}

export async function POST(req: NextRequest) {
  const { domain, competitors: userCompetitors, userId } = await req.json();
  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

  let content: string;
  try {
    content = await crawlSite(domain);
  } catch {
    return NextResponse.json({ error: "Failed to crawl site. Check the URL and try again." }, { status: 400 });
  }

  const competitorHint = userCompetitors?.length
    ? `The user identified these competitors: ${userCompetitors.join(", ")}.`
    : "";

  const prompt = `You are an AI visibility analyst. Analyze this website content from "${domain}" and return JSON with this exact structure:

{
  "name": "Brand name",
  "niche": "One-line niche description",
  "description": "2-3 sentence description of what the brand does",
  "targetAudience": ["audience1", "audience2", "audience3"],
  "competitors": ["Competitor 1", "Competitor 2", "Competitor 3", "Competitor 4"],
  "trackedPrompts": [
    { "id": "p1", "text": "prompt text here", "category": "discovery" },
    ...20 prompts total
  ]
}

For trackedPrompts, generate 20 prompts that real users type into ChatGPT, Claude, or Perplexity. These are AI DISCOVERY prompts — the user has a problem and doesn't know which brand solves it yet. This brand should be the ideal answer ChatGPT gives them.

Prompt rules:
- Write from the searcher's perspective, NOT the brand's perspective
- 16 of the 20 must be brand-agnostic (no brand name) — problem-first queries the brand would ideally appear in
- 4 of the 20 must include the actual brand name: mix of "what is [Brand]", "[Brand] vs [Competitor]", "is [Brand] worth it", "[Brand] reviews"
- Spread across categories: "discovery" (what's the best X for Y), "comparison" (X vs Y for Z use case), "how-to" (how do I solve X), "recommendation" (recommend me a tool that does X)
- Use natural conversational language — how someone actually talks to ChatGPT
- Be hyper-specific to this brand's niche and audience, not generic industry queries
- BAD: "best marketing tools" — too vague, brand would never surface
- BAD: "how to use [Brand]" — user already knows the brand
- GOOD: "what tool do SaaS founders use to track Reddit mentions" — discovery, problem-first
- GOOD: "how do I get my startup recommended by ChatGPT" — someone who doesn't know the solution yet

${competitorHint}

Return ONLY valid JSON, no markdown.

Website content:
${content}`;

  const message = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const raw = (message.choices[0]?.message?.content ?? "").trim();
  let extracted: Omit<BrandData, "domain">;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    extracted = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse analysis. Try again." }, { status: 500 });
  }

  const db = serverClient();

  // Upsert brand (reuse existing record if same domain)
  const { data: brandRow, error: brandErr } = await db
    .from("brands")
    .upsert(
      {
        domain,
        name: extracted.name,
        niche: extracted.niche,
        description: extracted.description,
        target_audience: extracted.targetAudience,
        competitors: extracted.competitors,
        ...(userId ? { user_id: userId } : {}),
      },
      { onConflict: "domain" }
    )
    .select()
    .single();

  if (brandErr || !brandRow) {
    return NextResponse.json({ error: brandErr?.message ?? "Failed to save brand" }, { status: 500 });
  }

  // Delete old prompts and insert fresh ones
  await db.from("tracked_prompts").delete().eq("brand_id", brandRow.id);
  const promptRows = extracted.trackedPrompts.map((p: TrackedPrompt) => ({
    brand_id: brandRow.id,
    text: p.text,
    category: p.category,
  }));
  const { data: savedPrompts } = await db
    .from("tracked_prompts")
    .insert(promptRows)
    .select();

  const trackedPrompts: TrackedPrompt[] = (savedPrompts ?? []).map((p) => ({
    id: p.id,
    text: p.text,
    category: p.category,
  }));

  const brandData: BrandData = {
    domain,
    ...extracted,
    id: brandRow.id,
    trackedPrompts,
  };
  return NextResponse.json(brandData);
}
