import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { clientFromRequest } from "@/lib/supabase";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: brand } = await db
    .from("brands")
    .select("name, domain, niche, competitors")
    .eq("id", brandId)
    .eq("user_id", user.id)
    .single();

  if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });

  const existing = (brand.competitors ?? []).join(", ");

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    messages: [{
      role: "user",
      content: `List 6 well-known direct competitors for "${brand.name}" (${brand.domain}), a brand in the "${brand.niche}" space.
${existing ? `Already tracked: ${existing}. Do NOT include these.` : ""}
Reply with ONLY a JSON array of short brand/product names, no URLs, no explanations.
Example: ["Competitor A", "Competitor B", "Competitor C"]`,
    }],
  });

  const text = response.choices[0]?.message?.content ?? "[]";
  let suggestions: string[] = [];
  try {
    const match = text.match(/\[[\s\S]*\]/);
    if (match) suggestions = JSON.parse(match[0]);
  } catch { suggestions = []; }

  return NextResponse.json({ suggestions });
}
