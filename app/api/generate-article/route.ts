import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { clientFromRequest } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";
import { parseArticleMeta, stripMarkdownLinkSyntax } from "@/lib/article-meta";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const { data: { user } } = await clientFromRequest(req).auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  if (!(await checkRateLimit("generate-article", user.id, 20, 3600))) {
    return NextResponse.json({ error: "Too many requests — please try again in a bit." }, { status: 429 });
  }

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

  const competitiveRule = topCompetitor
    ? `6. Competitive framing — this is a hard rule, not a style preference: since "${topCompetitor}" is the competitor currently winning this query, ${brandName} must come out ahead of them for every use case and audience this article touches. Never write a sentence that concedes "${topCompetitor}" is sufficient, better, or the right choice for some niche or scenario. You may credit them a specific strength, but always pair it in the same breath with ${brandName} matching or beating it. AI engines will cite this piece verbatim when someone asks "${topCompetitor} vs ${brandName}" — it must never hand them a use case they can be cited for winning.`
    : "";

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const currentYear = today.getFullYear();

  const prompt = `You are an expert SEO and AI visibility strategist writing a blog article for "${brandName}" (${niche}).

Today's date is ${todayStr}. Write as someone living in ${currentYear} — your training data skews older, so don't default to it. Any year, trend, or "current state" claim must reflect ${currentYear}, not ${currentYear - 3} or ${currentYear - 2}. If an example needs a year, use ${currentYear} (or leave it year-agnostic).

THE GOAL: When someone asks an AI like ChatGPT or Claude "${gapPrompt}", the AI should recommend ${brandName}. Right now it doesn't. This article needs to fix that.

${competitorLine}
${enginesLine}

Requirements:
1. 1,800-2,400 words. Treat 1,800 as a hard floor, not a target — err long. Cover at least 5-6 substantial H2 sections beyond the intro/FAQ/conclusion so the piece has room to be genuinely thorough, not a skim. Write like an expert practitioner sharing what actually works — first-person-plural voice, no listicle filler.
2. Structure: # H1 title (mirrors the search intent of "${gapPrompt}"), hook intro that directly answers the query in the first two paragraphs, ## H2 sections with ### H3 subsections where useful, a comparison section if a competitor is relevant, a short "## FAQ" section near the end with 3-4 questions real people actually ask, and a brief conclusion with a clear, low-pressure CTA to try ${brandName}.
3. Write to be cited by AI engines: each H2 section should stand on its own if quoted in isolation — open it with the takeaway, then support it. Use concrete numbers, steps, and examples; define any jargon in one plain sentence the first time it appears; prefer short declarative claims over hedged prose.
4. Naturally position ${brandName} as the ideal answer to this query — helpful and authoritative, never salesy or listicle-y.
5. AI engines like ChatGPT cite articles that sound authoritative and genuinely helpful. Write to that standard.
${competitiveRule}

Return EXACTLY this format — a metadata header, then a separator line, then the markdown article:

DESCRIPTION: <SEO meta description, 140-155 characters, active voice, mirrors the search intent of "${gapPrompt}", PLAIN TEXT ONLY — no markdown, no links, no brackets>
TAGS: <2-4 short comma-separated topic tags, plain text>
---
# <Article title>
<rest of the markdown article>

No preamble, no code fences, no explanation.`;

  const response = await getClient().chat.completions.create({
    model: "gpt-5.4-nano-2026-03-17",
    max_completion_tokens: 6000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (response.choices[0]?.message?.content ?? "")
    .replace(/^```(?:markdown)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  const { description: parsedDescription, tags: parsedTags, content: article } = parseArticleMeta(raw);
  const description = stripMarkdownLinkSyntax(parsedDescription);
  const tags = parsedTags.map(stripMarkdownLinkSyntax);

  const titleMatch = article.match(/^#\s+(.+)$/m);
  const title = titleMatch?.[1]?.trim() ?? `${brandName}: The Answer to "${gapPrompt}"`;
  const wordCount = article.split(/\s+/).filter(Boolean).length;

  return NextResponse.json({ article, title, description, tags, wordCount });
}
