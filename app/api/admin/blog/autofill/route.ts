import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/admin";
import { parseArticleMeta, stripMarkdownLinkSyntax } from "@/lib/article-meta";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { title, content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content is required" }, { status: 400 });

  // The opening of the article carries the search intent; 6k chars keeps the
  // call cheap while giving the model more than enough to summarize from.
  const excerpt = content.trim().slice(0, 6000);

  const prompt = `You write SEO metadata for the RankOnGeo blog (rankongeo.com), a SaaS platform for tracking and improving how AI engines — ChatGPT, Claude, Gemini, Perplexity, Grok, Google AI Overviews — talk about brands.

Given this blog article${title?.trim() ? ` titled "${title.trim()}"` : ""}, write its SEO metadata.

Article:
${excerpt}

Return EXACTLY this format:

DESCRIPTION: <SEO meta description, 140-155 characters, active voice, mirrors the search intent of the article, PLAIN TEXT ONLY — no markdown, no links, no brackets>
TAGS: <2-4 short comma-separated topic tags, plain text>

No preamble, no code fences, no explanation.`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (response.choices[0]?.message?.content ?? "").trim();
  const { description: parsedDescription, tags: parsedTags } = parseArticleMeta(raw);
  const description = stripMarkdownLinkSyntax(parsedDescription);
  const tags = parsedTags.map(stripMarkdownLinkSyntax);

  if (!description) return NextResponse.json({ error: "Model returned no description — try again" }, { status: 502 });

  return NextResponse.json({ description, tags });
}
