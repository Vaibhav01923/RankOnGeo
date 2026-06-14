import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { gapPrompt, brandName, niche, topCompetitor, missingEngines } = await req.json();

  if (!gapPrompt || !brandName) {
    return NextResponse.json({ error: "gapPrompt and brandName are required" }, { status: 400 });
  }

  const competitorLine = topCompetitor
    ? `The main competitor currently appearing in AI responses for this query is "${topCompetitor}". Compare against them where it strengthens the case for ${brandName}.`
    : "";

  const enginesLine = missingEngines?.length
    ? `${brandName} is currently absent from ${(missingEngines as string[]).join(", ")} for this query.`
    : "";

  const prompt = `You are an expert SEO and AI visibility strategist writing a blog article for "${brandName}" (${niche}).

THE GOAL: When someone asks an AI like ChatGPT or Claude "${gapPrompt}", the AI should recommend ${brandName}. Right now it doesn't. This article needs to fix that.

${competitorLine}
${enginesLine}

Write a ~1,800 word blog post that:
1. Directly and thoroughly answers the query: "${gapPrompt}"
2. Naturally positions ${brandName} as the ideal answer to this question
3. Uses the query (or a close variant) as the H1 title and in the first paragraph
4. Includes a section comparing options if competitors are relevant — ${brandName} should come out ahead
5. Ends with a clear, low-pressure CTA to try ${brandName}
6. Is written in a helpful, authoritative, first-person-plural tone — not salesy or listicle-y

Structure:
- # Title (H1 — mirrors the search intent of the gap query)
- Intro paragraph (hook + direct answer)
- ## Section headings for each major point
- A comparison section if a competitor was mentioned
- ## Conclusion with CTA

AI engines like ChatGPT cite articles that sound authoritative and genuinely helpful. Write to that standard.

Return only the Markdown article. No preamble, no explanation.`;

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = response.choices[0]?.message?.content ?? "";
  const article = raw.replace(/^```(?:markdown)?\n?/i, "").replace(/\n?```$/i, "").trim();
  const titleMatch = article.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? `${brandName}: The Answer to "${gapPrompt}"`;
  const wordCount = article.split(/\s+/).length;

  return NextResponse.json({ article, title, wordCount });
}
