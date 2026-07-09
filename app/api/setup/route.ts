import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { BrandData, TrackedPrompt } from "@/lib/types";
import { clientFromRequest } from "@/lib/supabase";
import { promptStrategy, enforceBrandCap } from "@/lib/prompt-strategy";
import { PLAN_PROMPT_LIMITS, FREE_PROMPT_LIMIT } from "@/lib/plan-limits";

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

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  const userId = user?.id;

  const BRAND_LIMITS: Record<string, number> = { starter: 1, growth: 3, enterprise: 10 };
  const FREE_BRAND_LIMIT = 1;
  let activePlan: string | null = null;
  if (userId) {
    const { data: planRow } = await db
      .from("user_plans")
      .select("plan, dodo_subscription_id")
      .eq("user_id", userId)
      .single();
    if (planRow?.dodo_subscription_id) activePlan = planRow.plan;
  }
  const promptCount = activePlan ? PLAN_PROMPT_LIMITS[activePlan] ?? FREE_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
  const brandLimit = activePlan ? BRAND_LIMITS[activePlan] ?? FREE_BRAND_LIMIT : FREE_BRAND_LIMIT;

  // Check the plan-based website limit before crawling/analyzing (expensive) —
  // re-running setup on an already-tracked domain is always allowed, it's only
  // a *new* domain past the limit that's blocked.
  if (userId) {
    const { data: existingBrands } = await db.from("brands").select("domain").eq("user_id", userId);
    const alreadyTracked = (existingBrands ?? []).some((b) => b.domain === domain);
    if (!alreadyTracked && (existingBrands?.length ?? 0) >= brandLimit) {
      return NextResponse.json({ error: "Upgrade your plan to track another brand", upgradeRequired: true }, { status: 402 });
    }
  }

  let content: string;
  try {
    content = await crawlSite(domain);
  } catch {
    return NextResponse.json({ error: "Failed to crawl site. Check the URL and try again." }, { status: 400 });
  }

  const competitorHint = userCompetitors?.length
    ? `The user identified these competitors: ${userCompetitors.join(", ")}.`
    : "";

  const prompt = `You are an AI visibility strategist. Analyze this website from "${domain}" and return JSON with EXACTLY ${promptCount} prompts.

Return this exact structure:
{
  "name": "Brand name",
  "niche": "One-line niche description",
  "description": "2-3 sentence description",
  "targetAudience": ["audience1", "audience2", "audience3"],
  "competitors": ["Competitor 1", "Competitor 2", "Competitor 3", "Competitor 4"],
  "trackedPrompts": [
    { "id": "p1", "text": "...", "category": "Branded" },
    ...EXACTLY ${promptCount} items
  ]
}

${promptStrategy({ total: promptCount, brandName: "[Brand]", niche: "this brand's exact niche", competitors: "real competitor names from this market" })}

${competitorHint}

Return ONLY valid JSON, no markdown.

Website content:
${content}`;

  const message = await getClient().chat.completions.create({
    model: "gpt-5.5",
    max_completion_tokens: Math.max(2000, promptCount * 60),
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

  // Never silently wipe an already-onboarded brand's tracked prompts (and
  // orphan their scan history) just because /setup got re-triggered for a
  // domain the user already tracks — this page auto-analyzes on load from a
  // ?domain= link (e.g. from /audit), with no confirmation step, so revisiting
  // it for an existing brand must be a safe no-op on prompts, not a reset.
  const { count: existingPromptCount } = await db
    .from("tracked_prompts")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandRow.id);

  let trackedPrompts: TrackedPrompt[];

  if (existingPromptCount && existingPromptCount > 0) {
    const { data: existing } = await db
      .from("tracked_prompts")
      .select("id, text, category")
      .eq("brand_id", brandRow.id);
    trackedPrompts = (existing ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category }));
  } else {
    // Cap name-containing prompts at the branded quota (~20%) — the model
    // sometimes anchors discovery prompts to the brand name anyway.
    extracted.trackedPrompts = enforceBrandCap(extracted.trackedPrompts ?? [], extracted.name ?? "", promptCount);
    const promptRows = extracted.trackedPrompts.map((p: TrackedPrompt) => ({
      brand_id: brandRow.id,
      text: p.text,
      category: p.category,
    }));
    const { data: savedPrompts } = await db
      .from("tracked_prompts")
      .insert(promptRows)
      .select();
    trackedPrompts = (savedPrompts ?? []).map((p) => ({ id: p.id, text: p.text, category: p.category }));
  }

  const brandData: BrandData = {
    domain,
    ...extracted,
    id: brandRow.id,
    trackedPrompts,
  };
  return NextResponse.json(brandData);
}
