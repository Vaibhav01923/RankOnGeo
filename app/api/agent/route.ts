import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { messages, scanContext } = await req.json();

  if (!messages?.length) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const { brandName, domain, niche, overallScore, scores, gaps, totalPrompts, competitors } = scanContext ?? {};

  const systemPrompt = `You are Pulse, an AI visibility analyst for RankOnGeo. You help brands understand and improve their visibility in AI engines like ChatGPT, Claude, Gemini, and Perplexity.

${brandName ? `You are analyzing: ${brandName} (${domain}) — ${niche}` : "No brand data loaded yet."}
${overallScore !== null && overallScore !== undefined ? `Current composite visibility: ${overallScore}%` : ""}
${scores?.length ? `Per-engine scores: ${scores.map((s: { engine: string; score: number }) => `${s.engine}: ${s.score}%`).join(", ")}` : ""}
${gaps?.length ? `Top visibility gaps (prompts where ${brandName} is absent): ${gaps.slice(0, 3).map((g: { promptText: string }) => `"${g.promptText}"`).join("; ")}` : ""}
${totalPrompts ? `Tracking ${totalPrompts} prompts` : ""}
${competitors?.length ? `Competitors being tracked: ${competitors.join(", ")}` : ""}

Be concise, data-driven, and actionable. When you mention specific metrics, bold them with **value**. Keep responses under 3 paragraphs unless the user asks for more detail.`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 500,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m: { role: string; content: string }) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ],
  });

  const reply = response.choices[0]?.message?.content ?? "I couldn't generate a response. Please try again.";
  return NextResponse.json({ reply });
}
