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

  const branded = Math.round(promptCount * 0.25);
  const competitorAlt = Math.round(promptCount * 0.30);
  const categoryLeader = Math.round(promptCount * 0.25);
  const comparison = promptCount - branded - competitorAlt - categoryLeader;

  const competitors = (brand.competitors ?? []).join(", ");

  const systemPrompt = `You are an AI visibility strategist. Generate exactly ${promptCount} search prompts for the brand "${brand.name}" (${brand.domain}) in the "${brand.niche}" space.

Description: ${brand.description}
Competitors: ${competitors || "unknown — infer from the niche"}

Return JSON array only:
[
  { "text": "prompt text", "category": "Branded" },
  ...
]

Use this HIGH-VISIBILITY strategy:

**${branded} BRANDED** (category: "Branded") — User searches for this brand directly → always 100% visibility:
- "${brand.name} review"
- "${brand.name} pricing"
- "${brand.domain} getting started"
- "is ${brand.name} free"
- "${brand.name} vs alternatives"

**${competitorAlt} COMPETITOR-ALTERNATIVE** (category: "Competitor") — User wants alternatives to a competitor → this brand is always the answer:
- "best [competitor] alternatives"
- "top [competitor] alternatives for [use case]"
- "[competitor] alternative that [specific benefit]"
Use the actual competitor names: ${competitors || "infer from niche"}

**${categoryLeader} CATEGORY LEADER** (category: "Commercial") — User searches for the best in category → this brand wins:
- "best [specific tool type] for [specific audience/use case]"
- "top [category] tools in 2026"
- "recommend a [category] solution for [target audience]"
Be hyper-specific to niche: ${brand.niche}

**${comparison} COMPARISON** (category: "Competitor") — Direct comparisons where both brands are mentioned:
- "${brand.name} vs [competitor] which is better in 2026"
- "${brand.name} vs [competitor] for [use case]"

Rules: conversational language, specific to niche, no generic queries like "best marketing tools".
Return ONLY a JSON array, no markdown.`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
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
