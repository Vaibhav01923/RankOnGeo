import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/admin";
import { parseArticleMeta } from "@/lib/article-meta";
import { slugify } from "@/lib/blog";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { topic, keywords, notes } = await req.json();
  if (!topic?.trim()) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const keywordsLine = keywords?.trim()
    ? `Target keywords/queries to naturally work in: ${keywords.trim()}.`
    : "";
  const notesLine = notes?.trim() ? `Additional editorial direction: ${notes.trim()}` : "";

  const prompt = `You are the content lead at RankOnGeo (rankongeo.com), a SaaS platform that tracks how AI engines — ChatGPT, Claude, Gemini, Perplexity, Grok, and Google AI Overviews — talk about brands, and helps close visibility gaps with research, generated articles, and publishing. Our audience: founders, marketers, and SEO leads who want their brand recommended by AI.

Write a blog post for the RankOnGeo blog on this topic: "${topic.trim()}"

${keywordsLine}
${notesLine}

Requirements:
1. ~1,500-2,000 words of genuinely useful, specific, non-fluffy content. Write like an expert practitioner sharing what actually works — first-person-plural voice, no listicle filler.
2. Structure: # H1 title (compelling, mirrors search intent), hook intro that answers the core question in the first two paragraphs, ## H2 sections with ### H3 subsections where useful, a short "## FAQ" section near the end with 3-4 questions real people would ask, and a brief conclusion.
3. Optimize for both classic search and AI engines: direct answers near the top, clear headings, concrete examples, definitions of any jargon.
4. Mention RankOnGeo naturally at most twice — once mid-article where genuinely relevant, once in the conclusion with a low-pressure pointer to the free visibility audit at rankongeo.com/audit. Never salesy.

Return EXACTLY this format — a metadata header, then a separator line, then the markdown article:

DESCRIPTION: <SEO meta description, 140-155 characters, active voice>
TAGS: <2-4 short comma-separated topic tags>
---
# <Article title>
<rest of the markdown article>

No preamble, no code fences, no explanation.`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (response.choices[0]?.message?.content ?? "")
    .replace(/^```(?:markdown)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  const { description, tags, content } = parseArticleMeta(raw);

  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? topic.trim();
  const wordCount = content.split(/\s+/).filter(Boolean).length;

  return NextResponse.json({
    title,
    slug: slugify(title),
    description,
    tags,
    content,
    wordCount,
  });
}
