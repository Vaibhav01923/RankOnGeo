import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";
import { randomBytes } from "crypto";
import { BrandData, TrackedPrompt } from "@/lib/types";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { promptStrategy, enforceBrandCap } from "@/lib/prompt-strategy";
import { PLAN_AUTO_GENERATED_PROMPTS, FREE_PROMPT_LIMIT, BRAND_LIMITS, FREE_BRAND_LIMIT, isLapsedSubscriber } from "@/lib/plan-limits";
import { safeFetch } from "@/lib/safe-fetch";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// Crawling up to 6 pages (8s timeout each) plus a synchronous gpt-5.5 call
// generating up to ~6000 tokens (max_completion_tokens below) can realistically
// take 20-50s+ — well past the platform's 10-15s default, which would silently
// fail brand setup for real users regardless of concurrent load.
export const maxDuration = 120;

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// A self-identifying "bot" UA gets flat-out 403'd by ordinary WAF/bot-detection
// (Cloudflare, Akamai, etc.) on plenty of real sites — confirmed against
// moneycontrol.com, which blocks "SEOBot" but serves this one a normal 200.
// This crawl is a one-time, low-volume fetch of a page the visitor themselves
// asked us to analyze, not a persistent crawler, so impersonating a browser
// here isn't the same ethical territory as a scraping bot masking at scale.
const CRAWLER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchPage(url: string): Promise<string> {
  try {
    const res = await safeFetch(url, {
      headers: { "User-Agent": CRAWLER_USER_AGENT },
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

  const homepageRes = await safeFetch(base, {
    headers: { "User-Agent": CRAWLER_USER_AGENT },
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

// "nykaa.com", "http://nykaa.com/", "https://www.nykaa.com" etc. must all
// resolve to the same brand — otherwise domain-matching (already-tracked
// checks, the upsert's conflict target) silently misses and creates a stray
// duplicate brand instead of finding the existing one.
function normalizeDomain(d: string): string {
  return d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { domain: rawDomain, competitors: userCompetitors } = body;
  if (!rawDomain) return NextResponse.json({ error: "domain is required" }, { status: 400 });
  const normalizedIncoming = normalizeDomain(rawDomain);

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  const userId = user?.id;

  // Logged-in users get a generous cap (normal usage adding/re-analyzing
  // several brands); anonymous callers get the same strict cap as the public
  // /api/analyze tool, since this route triggers the same crawl+OpenAI cost.
  const rateLimitOk = userId
    ? await checkRateLimit("setup", userId, 30, 3600)
    : await checkRateLimit("setup", clientIp(req), 5, 3600);
  if (!rateLimitOk) {
    return NextResponse.json({ error: "Too many requests — please try again in a bit." }, { status: 429 });
  }

  let activePlan: string | null = null;
  if (userId) {
    const { data: planRow } = await db
      .from("user_plans")
      .select("plan, dodo_customer_id, dodo_subscription_id, payment_failed_at")
      .eq("user_id", userId)
      .single();
    if (isLapsedSubscriber(planRow)) {
      return NextResponse.json(
        { error: "Your subscription has ended. Reactivate to add or re-analyze brands.", upgradeRequired: true },
        { status: 402 }
      );
    }
    if (planRow?.dodo_subscription_id) activePlan = planRow.plan;
  }
  // /api/setup only ever AI-generates this many — the rest of the plan's
  // prompt allowance (PLAN_PROMPT_LIMITS) is left for the user to add
  // themselves in the onboarding wizard's "add custom prompt" step.
  const promptCount = activePlan ? PLAN_AUTO_GENERATED_PROMPTS[activePlan] ?? FREE_PROMPT_LIMIT : FREE_PROMPT_LIMIT;

  // Admins get an unlimited website count for their own testing — they still
  // pay for and are capped at their real plan's prompt/credit allowances per
  // brand, this only lifts the "how many sites can I track" ceiling.
  // Uses requireAdmin (service-role client) rather than the RLS-bound `db`
  // client above — the `admins` table has no SELECT policy for authenticated
  // users, so querying it through `db` silently returns zero rows for everyone.
  const isAdmin = !!(await requireAdmin(req));
  const brandLimit = isAdmin ? Infinity : activePlan ? BRAND_LIMITS[activePlan] ?? FREE_BRAND_LIMIT : FREE_BRAND_LIMIT;

  // Check the plan-based website limit before crawling/analyzing (expensive) —
  // re-running setup on an already-tracked domain is always allowed, it's only
  // a *new* domain past the limit that's blocked. If an existing brand matches
  // once normalized, reuse its exact stored domain string so the upsert below
  // hits that row instead of creating a duplicate for a trivially different format.
  let domain = normalizedIncoming;
  if (userId) {
    const { data: existingBrands } = await db.from("brands").select("domain").eq("user_id", userId);
    const match = (existingBrands ?? []).find((b) => normalizeDomain(b.domain) === normalizedIncoming);
    if (match) domain = match.domain;
    const alreadyTracked = !!match;
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

  // Anonymous visitors (no session yet) can't satisfy the brands RLS
  // policies (`auth.uid() = user_id`), which never pass for a NULL user_id —
  // route their writes through the service-role client instead, same as the
  // team_invites/team_members claim flow. A random claim_token is stamped on
  // the row and handed back as an httpOnly cookie so a later authenticated
  // request (see /api/brand/claim) can attach this exact row once the
  // visitor actually signs up.
  const writeDb = userId ? db : serverClient();
  const claimToken = userId ? null : randomBytes(32).toString("base64url");

  // Upsert brand — conflict on (domain, user_id) so each user can track the same domain independently
  const { data: brandRow, error: brandErr } = await writeDb
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
        ...(claimToken ? { claim_token: claimToken } : {}),
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
  // ?domain= link, with no confirmation step, so revisiting it for an
  // existing brand must be a safe no-op on prompts, not a reset.
  const { count: existingPromptCount } = await writeDb
    .from("tracked_prompts")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandRow.id);

  let trackedPrompts: TrackedPrompt[];

  if (existingPromptCount && existingPromptCount > 0) {
    const { data: existing } = await writeDb
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
    const { data: savedPrompts } = await writeDb
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
  const res = NextResponse.json(brandData);
  if (claimToken) {
    res.cookies.set("pending_brand_claim", claimToken, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24, // 24h — long enough to survive an email-confirmation detour
    });
  }
  return res;
}
