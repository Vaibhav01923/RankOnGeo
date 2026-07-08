import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { clientFromRequest } from "@/lib/supabase";
import { promptStrategy, enforceBrandCap } from "@/lib/prompt-strategy";

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

  const competitors = (brand.competitors ?? []).join(", ");

  const systemPrompt = `You are an AI visibility strategist. Generate EXACTLY ${promptCount} search prompts for "${brand.name}" (${brand.domain}) in the "${brand.niche}" space. You MUST return exactly ${promptCount} items — not one more, not one less.

Description: ${brand.description}
Competitors: ${competitors || "unknown — infer from niche"}

Return a JSON object with a "prompts" array:
{ "prompts": [ { "text": "...", "category": "Branded" }, ... ] }

${promptStrategy({ total: promptCount, brandName: brand.name, niche: brand.niche, competitors: competitors || "infer from niche" })}

IMPORTANT: Return exactly ${promptCount} total prompts. Use JSON { "prompts": [...] }`;

  const response = await getClient().chat.completions.create({
    model: "gpt-5.5",
    max_completion_tokens: Math.max(2000, promptCount * 60),
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

  // The model sometimes leaks the brand name into discovery prompts — cap
  // name-containing prompts at the branded quota (~20%).
  prompts = enforceBrandCap(prompts, brand.name, promptCount);

  // Replace existing prompts
  await db.from("tracked_prompts").delete().eq("brand_id", brandId);
  const { data: saved } = await db
    .from("tracked_prompts")
    .insert(prompts.map((p) => ({ brand_id: brandId, text: p.text, category: p.category })))
    .select();

  return NextResponse.json({ prompts: saved ?? [] });
}
