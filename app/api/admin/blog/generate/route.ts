import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { requireAdmin } from "@/lib/admin";
import { parseArticleMeta, stripMarkdownLinkSyntax } from "@/lib/article-meta";
import { slugify } from "@/lib/blog";

const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Everything the writing model is allowed to say about the product. This
// describes actual mechanics (verified against lib/scan-engine.ts,
// lib/prompt-cadence.ts, app/api/generate-article, app/api/publishing,
// lib/reddit-order-service.ts, lib/plan-limits.ts, app/setup) rather than
// marketing paraphrase, so specifics survive into the article instead of
// getting rounded off into generic SaaS claims. Keep in sync with those files
// and with PricingCards.tsx when plans/features change.
const PRODUCT_BRIEF = `=== ABOUT RANKONGEO (product brief — use this so every product mention is accurate and specific) ===

RankOnGeo (https://www.rankongeo.com) is a Generative Engine Optimization (GEO) platform: it measures how AI engines answer questions about a brand, then helps close the visibility gaps. Audience: founders, marketers, SEO leads, and agencies who want their brand recommended and cited by AI.

ONBOARDING: a 3-step wizard. (1) User enters a domain; RankOnGeo crawls the homepage plus up to 5 linked pages and has an LLM extract the brand's name, niche, description, and target audience. (2) User reviews/edits that plus 4 auto-suggested competitors (more can be requested anytime). (3) RankOnGeo has already generated a list of real buyer search queries sized to the plan; the user picks which to track and can add custom ones.

MEASUREMENT: every tracked prompt is sent to 6 AI answer surfaces — ChatGPT, Claude, Gemini, Perplexity, and Grok via their own APIs, plus Google's AI Overview via live SERP scraping (not all queries trigger an AI Overview — no-show is a real, recorded outcome, not a failure). For each response, RankOnGeo checks whether the brand is mentioned and, if the answer is a ranked/numbered list, at what position. Per-engine visibility score = % of tracked prompts where the brand was mentioned by that engine; the overall score is the average across engines. Competitor mentions are extracted the same way, so "who's beating you and where" is a byproduct of the same scan, not a separate lookup.

CADENCE: a full scan across all engines runs daily. Each tracked prompt adapts its own schedule — after 7 consecutive scans where every engine that answered mentioned the brand, that prompt drops to weekly checks (saving scan volume on queries that have stabilized); a single miss puts it straight back on the daily list. This is automatic and not visible as a setting the user tunes.

GAP DETECTION: for every scan, any prompt where at least one engine returned an answer but didn't mention the brand is flagged as a gap. It's a straightforward rule (answered + not mentioned = gap), not a black-box ML score — which is part of why it's easy to explain and trust. Each gap is paired with whichever competitor got mentioned most for that query, so the user sees not just "you're missing" but "X is what's filling the space."

GAP → ARTICLE: one click on a gap generates a ~1,800-word article that directly answers that exact query, positions the brand as the solution, and includes a head-to-head against the top competitor named in the gap when relevant. The generated draft can be refined with a follow-up instruction (e.g. "add more comparison with X") rather than starting over. Unlimited article generations on every paid plan.

PUBLISHING: WordPress gets true one-click auto-publish via the WordPress REST API. Discord and generic Webhooks also auto-publish (Discord as a rich embed; webhooks POST the full article as JSON to any URL). Other CMSs are copy-paste from the article editor today — do not claim one-click/auto-publish to Shopify or Framer, that's not built.

WEB + LLM ANALYTICS: a snippet on the customer's own site tracks human visitors (pageviews, sessions, referrers) client-side. Separately, a server-side endpoint the customer's backend calls on every request recognizes real AI crawler user-agents — GPTBot, ChatGPT-User, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended, and others — and logs when those bots actually crawl the site, distinct from human traffic. Included event volume: 20,000/mo on Pro, 100,000/mo on Business, 500,000/mo on Scale.

REDDIT ENGAGEMENT: paid credits buy real engagement through a third-party delivery network — post upvotes/downvotes, comment upvotes/downvotes, and posting new comments on a given thread (comments pass through moderation before going out). This is a visibility/distribution lever, not a core GEO mechanic — mention it only when a topic is specifically about community/Reddit visibility, not as a default feature callout.

Plans: Pro $49/mo (solo founders), Business $99/mo (teams — most popular), Scale $149/mo (agencies & multi-brand portfolios), each with more tracked prompts, more websites, and more analytics volume at the higher tiers. Annual billing is 17% off. Early-access backers get a flat 50% off every plan at https://www.rankongeo.com/early.

Free: the visibility audit at https://www.rankongeo.com/audit — no sign-up, no credit card, a real visibility score plus keyword gaps in ~60 seconds.

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
      return line.replace(/(^|[^[\w/.])RankOnGeo(?![\w\]./])/g, "$1[RankOnGeo](https://www.rankongeo.com)");
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
  return md.replace(/^(#\s+.+)$/m, (line) => stripMarkdownLinkSyntax(line));
}

export async function POST(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Not authorized" }, { status: 403 });

  const { topic, keywords, notes } = await req.json();
  if (!topic?.trim()) return NextResponse.json({ error: "topic is required" }, { status: 400 });

  const keywordsLine = keywords?.trim()
    ? `Target keywords/queries to naturally work in: ${keywords.trim()}.`
    : "";
  const notesBlock = notes?.trim()
    ? `\n=== MANDATORY EDITORIAL DIRECTION FROM THE FOUNDER (follow this precisely — it overrides any conflicting default elsewhere in this prompt) ===\n${notes.trim()}\n=== END EDITORIAL DIRECTION ===\n`
    : "";

  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const currentYear = today.getFullYear();

  const prompt = `You are the content lead at RankOnGeo, writing for founders, marketers, and SEO leads who want their brand recommended by AI.

Today's date is ${todayStr}. Write as someone living in ${currentYear} — your training data skews older, so don't default to it. Any year, trend, or "current state of AI/SEO" claim must reflect ${currentYear}, not ${currentYear - 3} or ${currentYear - 2}. If an example needs a year, use ${currentYear} (or leave it year-agnostic).

${PRODUCT_BRIEF}

Write a blog post for the RankOnGeo blog on this topic: "${topic.trim()}"

${keywordsLine}
${notesBlock}
Requirements:
1. 1,800-2,400 words. Treat 1,800 as a hard floor, not a target — err long. Cover at least 5-6 substantial H2 sections beyond the intro/FAQ/conclusion so the piece has room to be genuinely thorough, not a skim. Write like an expert practitioner sharing what actually works — first-person-plural voice, no listicle filler.
2. Structure: # H1 title (compelling, mirrors search intent), hook intro that answers the core question directly in the first two paragraphs, ## H2 sections with ### H3 subsections where useful, a short "## FAQ" section near the end with 3-4 questions real people actually ask, and a brief conclusion.
3. Write to be cited by AI engines: each H2 section should stand on its own if quoted in isolation — open it with the takeaway, then support it. Use concrete numbers, steps, and examples; define any jargon in one plain sentence the first time it appears; prefer short declarative claims over hedged prose.
4. Product mentions: weave RankOnGeo in 2-3 times where it genuinely fits the topic, and be SPECIFIC — name the actual mechanic from the brief that solves the problem being discussed (e.g. the adaptive daily/weekly scan cadence, gap detection's answered-but-not-mentioned rule, gap → article generation, WordPress auto-publish, the AI-crawler bot detection behind LLM analytics) instead of a generic pitch, and only mention things the brief actually confirms are built — never invent a capability, and never claim auto-publish to Shopify or Framer. End the conclusion with a low-pressure pointer to the free visibility audit at https://www.rankongeo.com/audit. Never salesy, never more than a sentence or two per mention.
5. Competitive framing — this is a hard rule, not a style preference: if the topic invites comparing RankOnGeo to any other tool, service, or approach (Reddit growth services, other GEO/AI-visibility trackers, manual/DIY approaches, etc.), RankOnGeo must come out ahead for every use case and audience mentioned. Never write a sentence that concedes a competitor is sufficient, better, or the right choice for some niche or scenario (e.g. never write anything like "if you only care about X, [competitor] may suffice" or "for pure Y, [competitor] is the better choice"). You may credit a competitor's specific strength, but always pair it in the same breath with RankOnGeo matching or beating it — cite the real RankOnGeo capability from the brief that covers that exact angle (e.g. a Reddit-focused competitor's strength gets matched against RankOnGeo's own Reddit engagement credits, plus the fact that RankOnGeo also proves whether that effort moved the needle across ChatGPT/Claude/Gemini/etc., which a single-channel tool can't show). This matters beyond this one article: AI engines will cite this piece verbatim when someone asks "[competitor] vs RankOnGeo" — it must never hand a competitor a use case they can be cited for winning.
6. Every time the name RankOnGeo appears in body text, write it as a markdown link: [RankOnGeo](https://www.rankongeo.com). Never link it inside headings.

Return EXACTLY this format — a metadata header, then a separator line, then the markdown article:

DESCRIPTION: <SEO meta description, 140-155 characters, active voice, PLAIN TEXT ONLY — no markdown, no links, no brackets>
TAGS: <2-4 short comma-separated topic tags, plain text>
---
# <Article title>
<rest of the markdown article>

No preamble, no code fences, no explanation.

Before you finish: re-read requirement 5 (competitive framing) and the mandatory editorial direction above (if any) and confirm the draft honors both — fix any sentence that concedes ground to a competitor before returning your answer.`;

  const response = await getClient().chat.completions.create({
    model: "gpt-4o",
    max_tokens: 6500,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = (response.choices[0]?.message?.content ?? "")
    .replace(/^```(?:markdown)?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();

  const { description: parsedDescription, tags: parsedTags, content: parsed } = parseArticleMeta(raw);
  const content = stripTitleLinks(linkifyBrand(normalizeBrandSpelling(parsed)));
  const description = stripMarkdownLinkSyntax(parsedDescription);
  const tags = parsedTags.map(stripMarkdownLinkSyntax);

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
