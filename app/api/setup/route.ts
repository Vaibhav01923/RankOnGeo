import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { BrandData, TrackedPrompt } from "@/lib/types";
import { clientFromRequest } from "@/lib/supabase";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  const body = await req.json();
  const { domain, competitors: userCompetitors } = body;
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

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  const userId = user?.id;

  const PLAN_AUTO_COUNTS: Record<string, number> = { starter: 20, pro: 50, business: 150, scale: 400 };
  let userPlan = "starter";
  if (userId) {
    const { data: planRow } = await db.from("user_plans").select("plan").eq("user_id", userId).single();
    if (planRow?.plan) userPlan = planRow.plan;
  }
  const promptCount = PLAN_AUTO_COUNTS[userPlan] ?? 20;

  const branded = Math.round(promptCount * 0.25);
  const competitorAlt = Math.round(promptCount * 0.30);
  const categoryLeader = Math.round(promptCount * 0.25);
  const comparison = promptCount - branded - competitorAlt - categoryLeader;

  const prompt = `You are an AI visibility strategist. Analyze this website from "${domain}" and return JSON:

{
  "name": "Brand name",
  "niche": "One-line niche description",
  "description": "2-3 sentence description of what the brand does",
  "targetAudience": ["audience1", "audience2", "audience3"],
  "competitors": ["Competitor 1", "Competitor 2", "Competitor 3", "Competitor 4"],
  "trackedPrompts": [
    { "id": "p1", "text": "prompt text here", "category": "Branded" },
    ...${promptCount} prompts total
  ]
}

Generate exactly ${promptCount} prompts using this HIGH-VISIBILITY strategy. Each category guarantees the brand appears in AI responses:

**${branded} BRANDED prompts** (category: "Branded") — Always score 100% visibility because the AI must answer about this specific brand:
- "[brand name] review"
- "[brand name] pricing"
- "[brand name] vs alternatives"
- "[brand name] getting started"
- "is [brand name] free"
- "[domain] tutorial"

**${competitorAlt} COMPETITOR-ALTERNATIVE prompts** (category: "Competitor") — Score 80-100% because this brand is always the top answer when users want alternatives to competitors:
- "best [Competitor1] alternatives"
- "what are the top [Competitor2] alternatives"
- "[Competitor3] alternatives for [use case]"
- Use the actual competitor names from this brand's market

**${categoryLeader} CATEGORY LEADER prompts** (category: "Commercial") — Score 70-90% because this brand is a top result for its category:
- "best [category] tool for [specific use case]"
- "top [category] solutions in [year]"
- "recommend a [category] solution for [audience]"
- Be specific to the brand's exact niche and target audience

**${comparison} COMPARISON prompts** (category: "Competitor") — Score 70-90% because the brand is always mentioned:
- "[Brand] vs [Competitor1] which is better"
- "[Brand] vs [Competitor2] comparison [year]"
- "[Brand] vs [Competitor3] for [use case]"

Rules:
- Use conversational language (how someone talks to ChatGPT)
- Be hyper-specific to this brand's niche — not generic
- For competitor names, use the real product/brand names from this market
- BAD: "best marketing tools" (too vague)
- GOOD: "best [specific category] tool for [specific audience]"

${competitorHint}

Return ONLY valid JSON, no markdown.

Website content:
${content}`;

  const message = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: Math.max(2000, promptCount * 60),
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

  // Upsert brand — conflict on (domain, user_id) so each user can track the same domain independently
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
        user_id: userId,
      },
      { onConflict: "domain,user_id" }
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
