import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/admin";
import { parseArticleMeta } from "@/lib/article-meta";
import { slugify } from "@/lib/blog";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Everything the writing model is allowed to say about the product. Keep in
// sync with PricingCards.tsx and the landing page when plans/features change.
const PRODUCT_BRIEF = `=== ABOUT RANKONGEO (product brief — use this so every product mention is accurate and specific) ===

RankOnGeo (https://rankongeo.com) is a Generative Engine Optimization (GEO) platform: it tracks how AI engines answer questions about a brand, then helps close the visibility gaps automatically. Audience: founders, marketers, SEO leads, and agencies who want their brand recommended and cited by AI.

Engines tracked (7): ChatGPT, Claude, Gemini, Perplexity, Grok, Google AI Mode, and Google AI Overviews.

The core loop (runs daily, fully automatic):
1. Measure — enter a domain, get a composite AI visibility score across engines in ~60 seconds. See exactly where each engine ranks the brand vs. competitors.
2. Research — generative query mining ("gap detection") surfaces the real questions where AI engines answer without mentioning the brand, each scored by AI overlap.
3. Write — turn any gap into a source-grounded article engineered for citation ("gap → article"): direct answers up top, schema markup, FAQ sections, and internal links included. Unlimited SEO articles on every plan.
4. Publish — one click to WordPress, Shopify, or Framer; webhooks and a REST API for everything else.
5. Re-measure — daily visibility refresh proves the lift, citation by citation, engine by engine.

Other features:
- Competitor tracking: up to 25 competitor brands side-by-side, with per-engine visibility percentages and daily deltas.
- Tracked prompts: monitor the specific buyer questions that matter (50 on Pro, 150 on Business, 400 on Scale).
- Web + LLM analytics: see which AI engines actually send visitors, alongside classic web analytics (20k events/mo on Pro, 100k on Business, 500k on Scale).
- Reddit engagement credits for upvotes, comments, and comment upvotes (50/100/150 per month by plan).
- Multi-site: 1 website on Pro, 3 on Business, 10 on Scale.

Plans: Pro $49/mo (solo founders), Business $99/mo (teams — most popular), Scale $149/mo (agencies & multi-brand portfolios). Annual billing is 17% off. Early-access backers get a flat 50% off every plan at https://rankongeo.com/early.

Free: the visibility audit at https://rankongeo.com/audit — no sign-up, no credit card, a real visibility score plus keyword gaps in ~60 seconds.

=== END PRODUCT BRIEF ===`;

// The model occasionally mangles the brand's spelling/casing (observed:
// "RanOnGeo", dropping the "k"). Normalize common variants back to the
// canonical form before linking. Bails out before "rankongeo.com" URLs and
// hyphenated words (e.g. "geo-fenced") so it can't mangle unrelated text.
function normalizeBrandSpelling(md: string): string {
  return md.replace(/\bRan[k]?\s*[Oo]n\s*[Gg]eo\b(?![\w.-])/g, "RankOnGeo");
}

// Safety net: the prompt asks the model to link brand mentions, but if any
// bare "RankOnGeo" slips through in body text, link it here. Skips headings,
// code fences, and mentions already inside a markdown link.
function linkifyBrand(md: string): string {
  let inCode = false;
  return md
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) {
        inCode = !inCode;
        return line;
      }
      if (inCode || /^\s*#/.test(line)) return line;
      return line.replace(/(^|[^[\w/.])RankOnGeo(?![\w\]./])/g, "$1[RankOnGeo](https://rankongeo.com)");
    })
    .join("\n");
}

// The model sometimes ignores "never link it inside headings" for the H1
// title line itself. That title is later extracted as a plain string and
// used as-is (page <h1>, <title> tag, OpenGraph, blog index cards) — none of
// which render markdown, so a raw [text](url) there leaks out unrendered as
// literal brackets next to a dead-looking URL. Strip any markdown link
// syntax from the H1 line specifically (H2/H3 links render fine as real
// links, so they're left alone).
function stripTitleLinks(md: string): string {
  return md.replace(/^(#\s+.+)$/m, (line) => line.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"));
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { topic, keywords, notes } = await req.json();
  if (!topic?.trim()) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const keywordsLine = keywords?.trim()
    ? `Target keywords/queries to naturally work in: ${keywords.trim()}.`
    : "";
  const notesLine = notes?.trim() ? `Additional editorial direction: ${notes.trim()}` : "";

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const currentYear = today.getFullYear();

  const prompt = `You are the content lead at RankOnGeo, writing for founders, marketers, and SEO leads who want their brand recommended by AI.

Today's date is ${todayStr}. Write as someone living in ${currentYear} — your training data skews older, so don't default to it. Any year, trend, or "current state of AI/SEO" claim must reflect ${currentYear}, not ${currentYear - 3} or ${currentYear - 2}. If an example needs a year, use ${currentYear} (or leave it year-agnostic).

${PRODUCT_BRIEF}

Write a blog post for the RankOnGeo blog on this topic: "${topic.trim()}"

${keywordsLine}
${notesLine}

Requirements:
1. ~1,500-2,000 words of genuinely useful, specific, non-fluffy content. Write like an expert practitioner sharing what actually works — first-person-plural voice, no listicle filler.
2. Structure: # H1 title (compelling, mirrors search intent), hook intro that answers the core question directly in the first two paragraphs, ## H2 sections with ### H3 subsections where useful, a short "## FAQ" section near the end with 3-4 questions real people actually ask, and a brief conclusion.
3. Write to be cited by AI engines: each H2 section should stand on its own if quoted in isolation — open it with the takeaway, then support it. Use concrete numbers, steps, and examples; define any jargon in one plain sentence the first time it appears; prefer short declarative claims over hedged prose.
4. Product mentions: weave RankOnGeo in 2-3 times where it genuinely fits the topic, and be SPECIFIC — name the actual feature from the brief that solves the problem being discussed (e.g. gap detection, gap → article, LLM analytics, one-click publishing, competitor tracking) instead of a generic pitch. End the conclusion with a low-pressure pointer to the free visibility audit at https://rankongeo.com/audit. Never salesy, never more than a sentence or two per mention.
5. Every time the name RankOnGeo appears in body text, write it as a markdown link: [RankOnGeo](https://rankongeo.com). Never link it inside headings.

Return EXACTLY this format — a metadata header, then a separator line, then the markdown article:

DESCRIPTION: <SEO meta description, 140-155 characters, active voice>
TAGS: <2-4 short comma-separated topic tags>
---
# <Article title>
<rest of the markdown article>

No preamble, no code fences, no explanation.`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 5000,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (response.choices[0]?.message?.content ?? "")
    .replace(/^```(?:markdown)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  const { description, tags, content: parsed } = parseArticleMeta(raw);
  const content = stripTitleLinks(linkifyBrand(normalizeBrandSpelling(parsed)));

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
