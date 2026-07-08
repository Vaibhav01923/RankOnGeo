import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { clientFromRequest } from "@/lib/supabase";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SUGGEST_COUNT = 10;

// Suggest fresh discovery prompts the brand isn't tracking yet. Nothing is
// saved — the client reviews and adds the ones it wants via POST /api/prompts.
export async function POST(req: NextRequest) {
  const { brandId } = await req.json();
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: brand } = await db
    .from("brands")
    .select("name, domain, niche, description, competitors")
    .eq("id", brandId)
    .eq("user_id", user.id)
    .single();
  if (!brand) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: existing } = await db
    .from("tracked_prompts")
    .select("text")
    .eq("brand_id", brandId);
  const existingTexts = (existing ?? []).map((p) => p.text);

  const competitors = (brand.competitors ?? []).join(", ");
  const systemPrompt = `You are an AI visibility strategist for "${brand.name}" (${brand.niche}).

Description: ${brand.description}
Competitors: ${competitors || "unknown — infer from niche"}

Generate ${SUGGEST_COUNT} NEW discovery search prompts — questions people in this niche type into ChatGPT/Gemini when they have a problem and don't know ${brand.name} exists. Think: seasonal queries, emerging trends, underserved use cases, competitor-alternative asks, casual Reddit-style questions.

Rules:
- NEVER mention "${brand.name}" or "${brand.domain}" — these are discovery prompts.
- Do NOT duplicate or trivially rephrase any of these already-tracked prompts:
${existingTexts.map((t) => `- ${t}`).join("\n")}
- category is "Competitor" if the prompt names a competitor, otherwise "Commercial".

Return JSON: { "prompts": [ { "text": "...", "category": "Commercial" }, ... ] }`;

  const response = await getClient().chat.completions.create({
    model: "gpt-5.5",
    max_completion_tokens: 2000,
    messages: [{ role: "user", content: systemPrompt }],
    response_format: { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content ?? "{}";
  let prompts: { text: string; category: string }[];
  try {
    const parsed = JSON.parse(raw);
    prompts = Array.isArray(parsed) ? parsed : (parsed.prompts ?? []);
  } catch {
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }

  // Enforce the rules the model was given: no brand name, no duplicates
  const nameRe = new RegExp(brand.name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const existingLower = new Set(existingTexts.map((t) => t.toLowerCase().trim()));
  const suggestions = prompts
    .filter((p) => p.text?.trim() && !nameRe.test(p.text) && !existingLower.has(p.text.toLowerCase().trim()))
    .slice(0, SUGGEST_COUNT);

  return NextResponse.json({ suggestions });
}
