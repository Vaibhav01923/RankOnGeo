import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { clientFromRequest } from "@/lib/supabase";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const PLAN_PROMPT_COUNTS: Record<string, number> = { starter: 20, pro: 50, business: 150, scale: 400 };

export async function POST(req: NextRequest) {
  const { brandId } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: brand } = await db
    .from("brands")
    .select("name, domain, niche, description, competitors, target_audience")
    .eq("id", brandId)
    .eq("user_id", user.id)
    .single();

  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: planRow } = await db.from("user_plans").select("plan").eq("user_id", user.id).single();
  const promptCount = PLAN_PROMPT_COUNTS[planRow?.plan ?? "starter"] ?? 20;

  const branded = Math.round(promptCount * 0.20);
  const competitorAlt = Math.round(promptCount * 0.25);
  const categoryLeader = Math.round(promptCount * 0.20);
  const comparison = Math.round(promptCount * 0.15);
  const community = promptCount - branded - competitorAlt - categoryLeader - comparison;

  const competitors = (brand.competitors ?? []).join(", ");

  const systemPrompt = `You are an AI visibility strategist. Generate EXACTLY ${promptCount} search prompts for "${brand.name}" (${brand.domain}) in the "${brand.niche}" space. You MUST return exactly ${promptCount} items — not one more, not one less.

Description: ${brand.description}
Competitors: ${competitors || "unknown — infer from niche"}

Return a JSON object with a "prompts" array:
{ "prompts": [ { "text": "...", "category": "Branded" }, ... ] }

Strategy — EXACTLY this distribution:

**${branded} BRANDED** (category: "Branded") — brand is always the answer:
- "${brand.name} review"
- "${brand.name} pricing"
- "is ${brand.name} free"
- "${brand.name} getting started"
- "${brand.name} vs alternatives"

**${competitorAlt} COMPETITOR-ALTERNATIVE** (category: "Competitor") — user wants alternative to a named competitor:
- "alternative to [Competitor]"
- "best [Competitor] alternatives"
- "[Competitor] alternative that [specific benefit]"
Use real competitor names: ${competitors || "infer from niche"}

**${categoryLeader} CATEGORY LEADER** (category: "Commercial") — user wants the best tool in this niche:
- "best [specific tool type] for [specific audience]"
- "top [category] tools in 2026"
- "recommend a [category] solution for [use case]"
Be hyper-specific to: ${brand.niche}

**${comparison} COMPARISON** (category: "Competitor") — direct head-to-head that always mentions both brands:
- "${brand.name} vs [Competitor] which is better"
- "${brand.name} vs [Competitor] for [use case]"

**${community} COMMUNITY/DISCUSSION** (category: "Commercial") — short casual questions that match Reddit thread titles and YouTube tutorial searches, which AI cites from real community discussions:
- "how good is [brand name]"
- "[category] tools discussion"
- "which [category] tool should I use"
- "is [brand name] worth it"
- "switching from [Competitor] to [brand name]"
Keep these SHORT (3-7 words), casual, like how someone would title a Reddit post.

IMPORTANT: Return exactly ${promptCount} total prompts. Use JSON { "prompts": [...] }`;

  const response = await getClient().chat.completions.create({
    model: "gpt-5.5",
    max_tokens: Math.max(2000, promptCount * 60),
    messages: [{ role: "user", content: systemPrompt }],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let prompts: { text: string; category: string }[];
  try {
    const parsed = JSON.parse(raw);
    prompts = Array.isArray(parsed) ? parsed : (parsed.prompts ?? parsed.trackedPrompts ?? []);
  } catch {
    return NextResponse.json({ error: "Failed to generate prompts" }, { status: 500 });
  }

  // Replace existing prompts
  await db.from("tracked_prompts").delete().eq("brand_id", brandId);
  const { data: saved } = await db
    .from("tracked_prompts")
    .insert(prompts.map((p) => ({ brand_id: brandId, text: p.text, category: p.category })))
    .select();

  return NextResponse.json({ prompts: saved ?? [] });
}
