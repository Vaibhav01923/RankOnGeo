import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return "";
  const html = await res.text();
  const $ = cheerio.load(html);
  $("script, style, nav, footer, head").remove();
  return $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);
}

async function crawlSite(domain: string): Promise<{ pages: string[]; pageCount: number }> {
  const base = domain.startsWith("http") ? domain : `https://${domain}`;
  const origin = new URL(base).origin;

  // Fetch homepage
  const homepageRes = await fetch(base, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; SEOBot/1.0)" },
    signal: AbortSignal.timeout(8000),
  });
  if (!homepageRes.ok) throw new Error("Could not reach site");
  const homepageHtml = await homepageRes.text();

  // Extract internal links
  const $ = cheerio.load(homepageHtml);
  const links = new Set<string>();
  links.add(base);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    try {
      const resolved = new URL(href, origin).href;
      if (resolved.startsWith(origin) && !resolved.includes("#")) {
        links.add(resolved);
      }
    } catch {}
  });

  // Crawl up to 5 pages
  const toVisit = Array.from(links).slice(0, 5);
  const texts = await Promise.allSettled(toVisit.map(fetchPage));
  const pages = texts
    .filter((r): r is PromiseFulfilledResult<string> => r.status === "fulfilled" && r.value.length > 0)
    .map((r) => r.value);

  return { pages, pageCount: toVisit.length };
}

export async function POST(req: NextRequest) {
  const { domain } = await req.json();
  if (!domain) return NextResponse.json({ error: "domain is required" }, { status: 400 });

  let crawlResult;
  try {
    crawlResult = await crawlSite(domain);
  } catch (err) {
    return NextResponse.json({ error: "Failed to crawl site. Check the URL and try again." }, { status: 400 });
  }

  const { pages, pageCount } = crawlResult;
  const combinedContent = pages.join("\n\n---\n\n").slice(0, 12000);

  const prompt = `You are an SEO analyst. Analyze the following website content scraped from "${domain}" and return a JSON object with this exact structure:

{
  "brand": {
    "name": "Brand name",
    "adjective": "one word that describes the brand tone (e.g. professional, playful, bold)",
    "niche": "Short niche description",
    "description": "2-3 sentence description of what the brand does and how",
    "targetAudience": ["audience1", "audience2", "audience3"],
    "competitors": ["Competitor One", "Competitor Two", "Competitor Three"]
  },
  "keywords": [
    {
      "keyword": "example keyword phrase",
      "intent": "informational | commercial | transactional | navigational",
      "difficulty": "low | medium | high",
      "rationale": "One sentence explaining why this keyword is valuable"
    }
  ],
  "article": {
    "targetKeyword": "the top keyword from the list above",
    "title": "Article title targeting that keyword",
    "sections": ["Section 1 title", "Section 2 title", ...],
    "wordCount": 1800,
    "seoOptimized": true
  }
}

Rules:
- Return exactly 6 keywords
- These are AI DISCOVERY keywords — queries someone types into ChatGPT or Google when they have a PROBLEM and don't yet know which brand/tool solves it. The brand should be the ideal answer.
- Write from the searcher's perspective, NOT the brand's perspective
- 5 of the 6 must be brand-agnostic problem-first queries (no brand name in them)
- 1 of the 6 must include the actual brand name (for branded discovery, e.g. "is [Brand] good for X" or "[Brand] vs [Competitor]")
- Use formats like: "what's the best X for Y", "how do I solve X without Z", "X alternatives for Y teams", "best tool for X in 2025"
- At least one should include the year 2025
- At least one should name a specific audience (e.g. "for SaaS", "for ecommerce", "for solo founders")
- BAD: "Playwright integration strategies" — brand-aware, not a discovery query
- BAD: "Reddit marketing strategies" — too vague, not problem-first
- GOOD: "what's the best tool for cross-browser E2E testing in 2025" — someone who doesn't know Playwright yet
- GOOD: "how do I get my brand mentioned in ChatGPT answers" — someone who doesn't know organicreach.ai yet
- Article should have 7-8 sections
- Competitors should be real or plausible company names in the space
- Return ONLY the JSON, no markdown, no explanation

Website content:
${combinedContent}`;

  const message = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 1500,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const raw = (message.choices[0]?.message?.content ?? "").trim();
  let analysis;
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    analysis = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
  } catch {
    return NextResponse.json({ error: "Failed to parse analysis. Try again." }, { status: 500 });
  }

  return NextResponse.json({ pageCount, ...analysis });
}
