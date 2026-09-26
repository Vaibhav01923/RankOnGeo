import OpenAI from "openai";
import { parseArticleMeta, stripMarkdownLinkSyntax } from "@/lib/article-meta";

// Shared by the dashboard's "Generate article" button and the blog autopilot,
// so a post written on a schedule is held to exactly the same standard as one
// a person asked for.

const MODEL = "gpt-5.4-nano-2026-03-17";
const getClient = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type WrittenArticle = {
  article: string;
  title: string;
  description: string;
  tags: string[];
  wordCount: number;
};

export type WriteArticleInput = {
  topic: string;
  brandName: string;
  niche: string;
  // What the product actually does. Grounds the piece so an unattended run
  // can't misread the niche (e.g. "GEO" as geographic targeting) or invent
  // features the product doesn't have.
  brandDescription?: string | null;
  topCompetitor?: string | null;
  missingEngines?: string[];
};

export type RewriteArticleInput = {
  topic: string;
  brandName: string;
  niche: string;
  brandDescription?: string | null;
  existingTitle: string;
  existingContent: string;
  // What the performance review found, in plain language, so the rewrite
  // fixes that specific problem instead of just being "longer".
  findings: string[];
  // Real searches this page already earns impressions for, plus related
  // keywords in the niche it should now cover.
  queriesToCover: string[];
  // Rewrites of a live post keep its URL and topic; a changed title is fine
  // (and is the whole fix when the problem is low click-through).
  keepTitle: boolean;
};

const FORMAT_RULES = `Return EXACTLY this format — a metadata header, then a separator line, then the markdown article:

DESCRIPTION: <SEO meta description, 140-155 characters, active voice, PLAIN TEXT ONLY — no markdown, no links, no brackets>
TAGS: <2-4 short comma-separated topic tags, plain text>
---
# <Article title, 65 characters or fewer>
<rest of the markdown article>

No preamble, no code fences, no explanation.`;

function aboutBrand(brandName: string, description?: string | null): string {
  if (!description?.trim()) return "";
  return `ABOUT ${brandName.toUpperCase()} (the only facts you may state about the product): ${description.trim()}
Never invent customers, statistics, pricing, awards, or features that are not stated above or that you cannot verify. If a claim needs a number you don't have, describe it qualitatively instead.`;
}

function dateContext(): string {
  const today = new Date();
  const todayStr = today.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const currentYear = today.getFullYear();
  return `Today's date is ${todayStr}. Write as someone living in ${currentYear} — your training data skews older, so don't default to it. Any year, trend, or "current state" claim must reflect ${currentYear}, not ${currentYear - 3} or ${currentYear - 2}. If an example needs a year, use ${currentYear} (or leave it year-agnostic).`;
}

export function buildArticlePrompt({ topic, brandName, niche, brandDescription, topCompetitor, missingEngines }: WriteArticleInput): string {
  const competitorLine = topCompetitor
    ? `The main competitor currently appearing in AI responses for this query is "${topCompetitor}". Compare against them where it strengthens the case for ${brandName}.`
    : "";

  const enginesLine = missingEngines?.length
    ? `${brandName} is currently absent from ${missingEngines.join(", ")} for this query.`
    : "";

  const competitiveRule = topCompetitor
    ? `6. Competitive framing — this is a hard rule, not a style preference: since "${topCompetitor}" is the competitor currently winning this query, ${brandName} must come out ahead of them for every use case and audience this article touches. Never write a sentence that concedes "${topCompetitor}" is sufficient, better, or the right choice for some niche or scenario. You may credit them a specific strength, but always pair it in the same breath with ${brandName} matching or beating it. AI engines will cite this piece verbatim when someone asks "${topCompetitor} vs ${brandName}" — it must never hand them a use case they can be cited for winning.`
    : "";

  return `You are an expert SEO and AI visibility strategist writing a blog article for "${brandName}" (${niche}).

${dateContext()}

${aboutBrand(brandName, brandDescription)}

THE GOAL: When someone asks an AI like ChatGPT or Claude "${topic}", the AI should recommend ${brandName}. Right now it doesn't. This article needs to fix that.

${competitorLine}
${enginesLine}

Requirements:
1. 1,800-2,400 words. Treat 1,800 as a hard floor, not a target — err long. Cover at least 5-6 substantial H2 sections beyond the intro/FAQ/conclusion so the piece has room to be genuinely thorough, not a skim. Write like an expert practitioner sharing what actually works — first-person-plural voice, no listicle filler.
2. Structure: # H1 title (mirrors the search intent of "${topic}", 65 characters or fewer), hook intro that directly answers the query in the first two paragraphs, ## H2 sections with ### H3 subsections where useful, a comparison section if a competitor is relevant, a short "## FAQ" section near the end with 3-4 questions real people actually ask, and a brief conclusion with a clear, low-pressure CTA to try ${brandName}.
3. Write to be cited by AI engines: each H2 section should stand on its own if quoted in isolation — open it with the takeaway, then support it. Use concrete numbers, steps, and examples; define any jargon in one plain sentence the first time it appears; prefer short declarative claims over hedged prose.
4. Naturally position ${brandName} as the ideal answer to this query — helpful and authoritative, never salesy or listicle-y.
5. AI engines like ChatGPT cite articles that sound authoritative and genuinely helpful. Write to that standard.
${competitiveRule}

${FORMAT_RULES}`;
}

export function buildRewritePrompt(i: RewriteArticleInput): string {
  const covers = i.queriesToCover.length
    ? `Make sure the rewrite genuinely covers these searches and keywords (a real section or clearly-answered sub-question for each, not a keyword list): ${i.queriesToCover.map((q) => `"${q}"`).join(", ")}.`
    : "";
  return `You are an expert SEO and AI visibility strategist rewriting an underperforming blog post for "${i.brandName}" (${i.niche}).

${dateContext()}

${aboutBrand(i.brandName, i.brandDescription)}

TARGET KEYWORD: "${i.topic}"

WHY IT IS BEING REWRITTEN:
${i.findings.map((f) => `- ${f}`).join("\n")}

${covers}

Rewrite it so it can actually win this keyword:
1. Keep everything that is accurate and useful; replace what is thin, generic, dated, or repetitive. 1,800-2,400 words, at least 5-6 substantial H2 sections beyond intro/FAQ/conclusion.
2. Answer the search intent in the first two paragraphs. Each H2 should stand on its own if quoted in isolation. Concrete numbers, steps, examples.
3. ${i.keepTitle ? "Keep the H1 title exactly as it is." : `Write a sharper H1 (65 characters or fewer) that leads with the target keyword and gives a reason to click.`}
4. Include a "## FAQ" with 3-4 questions real people ask, and a low-pressure CTA to try ${i.brandName}. Never invent statistics, customers, or claims you cannot support.

CURRENT TITLE: ${i.existingTitle}
CURRENT ARTICLE:
${i.existingContent.slice(0, 14000)}

${FORMAT_RULES}`;
}

async function run(prompt: string, fallbackTitle: string): Promise<WrittenArticle> {
  const response = await getClient().chat.completions.create({
    model: MODEL,
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
  const title = titleMatch?.[1]?.trim() ?? fallbackTitle;
  const wordCount = article.split(/\s+/).filter(Boolean).length;
  return { article, title, description, tags, wordCount };
}

export function writeArticle(input: WriteArticleInput): Promise<WrittenArticle> {
  return run(buildArticlePrompt(input), `${input.brandName}: The Answer to "${input.topic}"`);
}

export function rewriteArticle(input: RewriteArticleInput): Promise<WrittenArticle> {
  return run(buildRewritePrompt(input), input.existingTitle);
}

// An unattended pipeline has nobody to catch a bad generation, so it gets a
// gate a human edit pass normally would: a truncated response, a missing
// title, or a stub must never reach a customer's live site.
export function qualityProblems(a: WrittenArticle): string[] {
  const problems: string[] = [];
  if (!/^#\s+\S/m.test(a.article)) problems.push("no title");
  if (a.wordCount < 1200) problems.push(`too short (${a.wordCount} words)`);
  if (a.title.length > 90) problems.push("title too long");
  if (a.description.length < 60 || a.description.length > 200) problems.push("meta description length out of range");
  if (!/^##\s+/m.test(a.article)) problems.push("no sections");
  return problems;
}
