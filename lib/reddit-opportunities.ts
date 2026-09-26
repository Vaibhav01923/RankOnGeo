import OpenAI from "openai";
import { getRedditHeaders, searchReddit, getSubredditInfo } from "@/lib/reddit-search";

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export type RedditOpportunityBrand = {
  id: string;
  name: string;
  niche: string | null;
  description: string | null;
  competitors: string[] | null;
  target_audience: string[] | null;
};

export type RedditOpportunityThread = {
  // The reddit_threads row id once persisted — null until the follow-up
  // select after upsert resolves it (best-effort; a request-comment flow
  // that needs it should treat null as "draft fresh, don't rely on /api/reddit/draft").
  id: string | null;
  keyword: string;
  redditId: string;
  subreddit: string;
  title: string;
  url: string;
  body: string;
  score: number;
  numComments: number;
  createdAt: string | null;
  subredditSubscribers: number | null;
  estimatedViews: number;
  estimatedClientsLow: number;
  estimatedClientsHigh: number;
};

export type SuggestedRedditPost = {
  subreddit: string;
  subscribers: number | null;
  title: string;
  estimatedViewsLow: number;
  estimatedViewsHigh: number;
  estimatedClientsLow: number;
  estimatedClientsHigh: number;
};

export type RedditOpportunitiesResult = {
  threads: RedditOpportunityThread[];
  totalFound: number;
  suggestedPosts: SuggestedRedditPost[];
};

function estimateThreadViews(score: number, numComments: number, subscribers: number | null): number {
  const base = score * 45 + numComments * 180;
  const tierMultiplier = !subscribers ? 1 : subscribers > 1_000_000 ? 1.5 : subscribers > 200_000 ? 1.25 : subscribers > 20_000 ? 1.05 : 0.9;
  return Math.max(600, Math.round((base * tierMultiplier) / 50) * 50);
}

// A rough, clearly-an-estimate conversion range from "saw a genuine,
// well-placed mention" to "became a customer" — deliberately conservative
// (0.2%-0.8% of viewers) since this is word-of-mouth via a comment/post, not
// a paid ad with a direct CTA. Not meant to be precise, just directionally
// useful alongside the view estimate.
function estimateClientRange(viewsLow: number, viewsHigh: number): { low: number; high: number } {
  const low = Math.max(1, Math.round(viewsLow * 0.002));
  const high = Math.max(low + 1, Math.round(viewsHigh * 0.008));
  return { low, high };
}

// A handful of terms are so overloaded on 2026 Reddit (AI/agent hype, generic
// SaaS talk) that they can't be trusted as a relevance signal even when a
// brand's own niche/description legitimately mentions them — e.g. Playwright's
// niche mentions "AI agent workflows", but using the bare word "agent" as a
// signal term then matches completely unrelated posts like "AI agents today
// are far more dangerous than you think". Filtered out of the model's
// signalKeywords (belt-and-suspenders) and never used in the mechanical
// fallback below.
const OVERLOADED_TERMS = new Set([
  "ai", "agent", "agents", "automation", "automate", "workflow", "workflows",
  "tool", "tools", "platform", "software", "app", "apps", "saas", "tech",
]);
const NICHE_WORD_STOPWORDS = new Set(["modern", "about", "their", "which", "these", "those"]);

// Asking the model to self-report which competitor names double as ordinary
// English words is unreliable in practice — given "Wise" sitting right in
// the competitor list, it still returned an empty ambiguousTerms array. This
// is a deterministic safety net for known repeat offenders (short brand
// names that are also common dictionary words), unioned with whatever the
// model does catch — it's not meant to be exhaustive, just to guarantee the
// cases already found empirically don't regress if the model misses them
// again.
const KNOWN_AMBIGUOUS_TERMS = new Set([
  "wise", "cypress", "square", "current", "chime", "close", "drift", "loom",
  "notion", "buffer", "wave", "monday", "mint", "stripe",
]);

// Reddit's own search relevance is noisy for the kind of multi-word natural
// language queries the model generates ("best end-to-end testing tool" can
// surface a completely unrelated viral AITA post) — ranking the pooled
// results purely by score/comments then lets those off-topic viral posts
// crowd out the few genuinely on-topic ones. This is a cheap post-filter: a
// title has to actually contain a competitor name or a genuinely distinctive
// signal phrase before it's eligible to be ranked at all. The model curates
// signalKeywords itself (it's far better than a word-length heuristic at
// judging "specific to this niche" vs. "generic buzzword") — the mechanical
// niche-word fallback only kicks in if that call fails outright.
function buildSignalTerms(
  niche: string,
  competitors: string[],
  signalKeywords: string[],
  ambiguousTerms: string[]
): { terms: Set<string>; ambiguous: Set<string> } {
  const terms = new Set<string>();
  for (const c of competitors) {
    const t = c.trim().toLowerCase();
    if (t) terms.add(t);
  }
  for (const k of signalKeywords) {
    const t = k.trim().toLowerCase();
    if (t && !OVERLOADED_TERMS.has(t)) terms.add(t);
  }
  if (signalKeywords.length === 0) {
    for (const w of niche.toLowerCase().split(/[^a-z0-9+-]+/)) {
      if (w.length >= 6 && !NICHE_WORD_STOPWORDS.has(w) && !OVERLOADED_TERMS.has(w)) terms.add(w);
    }
  }
  // Only terms actually in use count — a flagged term that never made it
  // into `terms` (e.g. filtered by OVERLOADED_TERMS already) is a no-op.
  const ambiguous = new Set<string>();
  for (const a of [...ambiguousTerms, ...KNOWN_AMBIGUOUS_TERMS]) {
    const t = a.trim().toLowerCase();
    if (t && terms.has(t)) ambiguous.add(t);
  }
  return { terms, ambiguous };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Plain substring matching lets a short competitor name match INSIDE a
// completely unrelated longer word — "Revolut" (the fintech app) matches
// "Revolutionize" and "Revolutionary" via .includes(). Regex \b doesn't fully
// fix this: \b treats a hyphen as a word boundary, so "\bwise\b" still
// matches "wise" inside "year-wise" or "gameplay-wise" (the extremely common
// English "-wise" suffix meaning "in terms of") — that's how an exam-prep
// app and a board-game post once passed the filter for a money-transfer
// brand whose competitor is "Wise". Lookaround treats a hyphen as PART of a
// word (not a boundary) on either side, so "wise" only matches when it's
// truly standalone — "Wise's fees" still matches, "year-wise" doesn't.
const caseInsensitivePatternCache = new Map<string, RegExp>();
function buildBoundaryPattern(term: string, caseInsensitive: boolean): RegExp {
  return new RegExp(`(?<![A-Za-z0-9-])${escapeRegExp(term)}(?![A-Za-z0-9-])`, caseInsensitive ? "i" : "");
}

// Some terms are BOTH a real competitor name and an ordinary standalone
// English word/idiom — "Wise" also shows up as the casual "snack wise",
// "time wise" (no hyphen, so the lookaround above can't tell it apart from a
// genuine brand mention — both are grammatically standalone words). The
// model flags these as ambiguousTerms; for just those, match case-SENSITIVELY
// against Title-Case or ALL-CAPS only. Genuine brand mentions ("Wise",
// "WISE") are almost always capitalized; the casual idiom ("wise") almost
// never is. Doesn't catch a rarer case — a proper noun elsewhere that's
// ALSO capitalized (a video game character literally named "Wise") — that's
// an accepted residual limitation, same category as "Cypress" the tree.
const ambiguousPatternCache = new Map<string, RegExp>();
function titleMatchesSignal(title: string, signalTerms: Set<string>, ambiguousTerms: Set<string>): boolean {
  for (const term of signalTerms) {
    if (ambiguousTerms.has(term)) {
      let pattern = ambiguousPatternCache.get(term);
      if (!pattern) {
        const titleCase = term.charAt(0).toUpperCase() + term.slice(1);
        const upperCase = term.toUpperCase();
        const alternatives = Array.from(new Set([titleCase, upperCase])).map(escapeRegExp).join("|");
        pattern = new RegExp(`(?<![A-Za-z0-9-])(?:${alternatives})(?![A-Za-z0-9-])`);
        ambiguousPatternCache.set(term, pattern);
      }
      if (pattern.test(title)) return true;
      continue;
    }
    let pattern = caseInsensitivePatternCache.get(term);
    if (!pattern) {
      pattern = buildBoundaryPattern(term, true);
      caseInsensitivePatternCache.set(term, pattern);
    }
    if (pattern.test(title)) return true;
  }
  return false;
}

// Referral/deal subreddits (beermoney-style) periodically repost the exact
// same templated offer ("Wise - free £500 international transfer...") under
// slightly reworded titles — these aren't organic discussion, and letting
// 3-4 near-identical reposts through burns most of the display slots on one
// offer instead of showing distinct threads. Token-overlap (Jaccard)
// similarity, scoped to the same subreddit, catches near-verbatim reposts
// without being so loose it starts collapsing genuinely different complaint
// threads that happen to share domain vocabulary (every candidate here
// already contains a competitor name, so some baseline overlap is expected
// and fine).
function normalizeForDedup(title: string): string {
  return title
    .toLowerCase()
    .replace(/[£$€]\s?[\d,.]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function titleSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let intersection = 0;
  for (const t of aTokens) if (bTokens.has(t)) intersection++;
  const union = aTokens.size + bTokens.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Reworded reposts (the beermoneyuk case) only recur within one subreddit,
// so that check stays scoped there — but a literal crosspost of the exact
// same title to a second subreddit ("Alternates to Wise card for US" in both
// r/digitalnomad and r/travel) is still the same underlying discussion and
// shouldn't burn two slots either. Any-subreddit dedup uses a much higher bar
// so it only catches near-verbatim crossposts, not two distinct threads that
// happen to share domain vocabulary.
const SAME_SUBREDDIT_DUPLICATE_THRESHOLD = 0.6;
const ANY_SUBREDDIT_DUPLICATE_THRESHOLD = 0.85;

function dedupeNearIdenticalTitles<T extends { subreddit: string; title: string }>(sorted: T[], limit: number): T[] {
  const accepted: T[] = [];
  const acceptedNormalized: { subreddit: string; normalized: string }[] = [];
  for (const candidate of sorted) {
    if (accepted.length >= limit) break;
    const normalized = normalizeForDedup(candidate.title);
    const isDuplicate = acceptedNormalized.some((a) => {
      const similarity = titleSimilarity(a.normalized, normalized);
      const threshold = a.subreddit === candidate.subreddit ? SAME_SUBREDDIT_DUPLICATE_THRESHOLD : ANY_SUBREDDIT_DUPLICATE_THRESHOLD;
      return similarity >= threshold;
    });
    if (isDuplicate) continue;
    accepted.push(candidate);
    acceptedNormalized.push({ subreddit: candidate.subreddit, normalized });
  }
  return accepted;
}

// Keyword matching has a ceiling: no amount of regex/boundary/capitalization
// logic can tell that "Selenium brain tree" (a sci-fi game's fictional
// plant) or "Cypress Hill" (a band) or "Alternative to Bridgeland in
// Cypress" (a Houston neighborhood) aren't about browser-testing tools —
// those are genuine, correctly-capitalized proper nouns that just happen to
// collide with a competitor's name. Only real context understanding closes
// that gap, so this is a final LLM pass over the keyword-filtered shortlist
// before it ships. Runs on a slightly larger pool than the final display
// count so rejections still leave enough to fill out the list. Fails open
// (keeps everything) rather than risk blocking the whole step over a flaky
// call — worse to show nothing than to fall back to the keyword filter's
// output.
async function verifyRelevanceWithLLM(
  brandName: string,
  niche: string,
  competitors: string[],
  posts: { title: string; body: string }[]
): Promise<Set<number>> {
  const allIndices = new Set(posts.map((_, i) => i));
  if (posts.length === 0) return allIndices;

  // Title-only screening was too lossy for posts whose intent only shows up
  // in the body — "Facial Analysis Results from Qoves" reads as a neutral
  // fact from the title alone, but the actual post can be someone sharing a
  // competitor experience in a way that's a genuinely good place to mention
  // an alternative. A short snippet gives the model that context.
  const numbered = posts
    .map((p, i) => `${i + 1}. ${p.title}${p.body ? `\n   (body: ${p.body.slice(0, 200)})` : ""}`)
    .join("\n");
  const prompt = `You're screening real Reddit threads to find good places for "${brandName}" (a brand in: ${niche}) to leave a genuine, relevant comment — somewhere a real person mentioning the brand would read as helpful, not spammy.
Its competitors: ${competitors.join(", ") || "none listed"}.

A thread qualifies if the poster is showing INTEREST OR ENGAGEMENT with this exact category of product/decision — any of:
- Asking for a recommendation, alternative, or "what should I use"
- Actively comparing named products/services because they're deciding between them
- Complaining about their current tool/service and wanting to switch
- Sharing their own results/experience with a named competitor or the category in general (e.g. "got my results back from X", "tried Y, here's what happened") — these are good places to genuinely engage, not just narrow "about to buy right now" moments
- Asking an open question about the category itself (e.g. "has anyone tried X to do Y", "how accurate is Z") even without naming a specific competitor

REJECT anything that's merely topically adjacent without that engagement — general industry news, market analysis or opinion pieces ("is X overhyped", "the future of Y"), price/regulation/policy discussion, corporate announcements or tweets, big-picture philosophical discussion about the space with no personal angle, or a subreddit that's about trading/investing in a company's STOCK rather than using its product. Also reject threads that only superficially match via a word with an unrelated meaning (e.g. "Cypress" the tree/place/band, "Wise" meaning smart, "Selenium" the chemical element or a game item) — not the actual competitor.

Threads:
${numbered}

Return JSON: { "relevant": [the numbers of threads that qualify] }`;

  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    if (!Array.isArray(parsed.relevant)) return allIndices;
    const indices = new Set<number>();
    for (const n of parsed.relevant) {
      const idx = Number(n) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < posts.length) indices.add(idx);
    }
    return indices;
  } catch {
    return allIndices;
  }
}

// A sublinear power curve rather than fixed tiers — flat per-tier ranges
// meant a 25K-member and a 195K-member subreddit got the identical number,
// and the old percentages (well under 1% of subscribers even at the top
// end) badly understated what a post that actually lands on a subreddit's
// front page can reach. subscribers^0.85 grows continuously (no tier-
// boundary jumps) while still tapering off for huge subreddits, where any
// single post reaches a shrinking share of an increasingly massive base.
function estimatePostViewRange(subscribers: number | null): { low: number; high: number } {
  const base = Math.pow(subscribers ?? 5000, 0.85);
  const low = Math.max(200, Math.round((base * 0.7) / 50) * 50);
  const high = Math.max(low + 200, Math.round((base * 3.6) / 50) * 50);
  return { low, high };
}

const THREADS_TO_SHOW = 10;

export async function findRedditOpportunities(params: {
  brand: RedditOpportunityBrand;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writeDb: any;
  userId: string | null;
}): Promise<RedditOpportunitiesResult> {
  const { brand, writeDb, userId } = params;

  const competitors = (brand.competitors ?? []).slice(0, 4);
  const audience = (brand.target_audience ?? []).slice(0, 3);
  const niche = brand.niche ?? "this space";

  const ideaPrompt = `You help find HIGH-INTENT BUYERS for the brand "${brand.name}" on Reddit — people actively deciding on a purchase, not just discussing the industry.
Niche: ${niche}
${brand.description ? `About the brand: ${brand.description}` : ""}
${competitors.length ? `Competitors: ${competitors.join(", ")}` : ""}
${audience.length ? `Target audience: ${audience.join(", ")}` : ""}

Return JSON with this exact shape:
{
  "comparisonQueries": ["4-5 comparison/buying-intent phrases people type when they already know product names — pair a competitor with 'alternative', 'vs', or 'switching from' (cover each listed competitor at least once). Do NOT include the brand's own name."],
  "plainQueries": ["3-4 short, plain, generic search terms (2-4 words each) — the exact bare words someone would type even if they don't know any competitor or brand name yet, naming the specific thing/action they want (e.g. for a face-analysis app: 'face rating', 'facial analysis' — NOT 'recommend a facial analysis tool' or 'looking for a way to rate my face': drop sentence wrapper words like 'recommend a'/'looking for a way to', just the bare noun phrase). Avoid broad industry/macro topics that surface news or opinion pieces instead of product-seekers (e.g. avoid 'future of AI beauty tech' or 'stablecoin payments comparison') — stay anchored to the specific thing being searched for, not the industry as a whole. Do NOT include the brand's own name."],
  "postIdeas": ["3 short Reddit POST TITLE ideas (not comments) someone who works at this brand could genuinely post to a relevant subreddit — useful and non-spammy, the kind that gets upvoted rather than removed. No brand name in the title."],
  "signalKeywords": ["5-8 short words or phrases that would appear in a Reddit post genuinely relevant to THIS EXACT niche — used afterward to filter out unrelated search results, so they must be specific enough that a random unrelated post wouldn't contain them. Prefer terms tied to the actual product/decision (e.g. 'browser automation', 'end-to-end testing') over generic industry-topic phrases that also describe news/analysis content (e.g. avoid bare 'cross-border payments' or 'stablecoin payments' for a fintech brand — those match market-analysis posts as easily as buyer posts). Do NOT include generic buzzwords on their own like 'AI', 'agent', 'automation', 'tool', 'platform', or 'software' even if they appear in the niche description above."],
  "ambiguousTerms": ["Of the competitor names and signalKeywords above ONLY, list any that are ALSO an ordinary standalone English word, adjective, or common name unrelated to this brand — e.g. 'Wise' is also a common adjective ('penny wise'), 'Cypress' is also a tree/place name, 'Square' is also a shape. Empty array if none are ambiguous."]
}
Return ONLY valid JSON, no markdown.`;

  let comparisonQueries: string[] = [];
  let plainQueries: string[] = [];
  let postIdeas: string[] = [];
  let signalKeywords: string[] = [];
  let ambiguousTerms: string[] = [];
  try {
    const res = await getOpenAI().chat.completions.create({
      model: "gpt-4o-mini",
      max_tokens: 850,
      messages: [{ role: "user", content: ideaPrompt }],
      response_format: { type: "json_object" },
    });
    const parsed = JSON.parse(res.choices[0]?.message?.content ?? "{}");
    // The model is told not to include the brand's own name in a query, but
    // has been observed ignoring that (e.g. "Umax vs FaceMaxify") — a query
    // against a brand-new brand's own name returns ~nothing, silently
    // wasting a search slot. Cheap, deterministic backstop.
    const brandNameLower = brand.name.trim().toLowerCase();
    const cleanQueries = (arr: unknown): string[] =>
      Array.isArray(arr)
        ? arr
            .filter((q: unknown): q is string => typeof q === "string" && q.trim().length > 0)
            .filter((q: string) => !brandNameLower || !q.toLowerCase().includes(brandNameLower))
            .slice(0, 8)
        : [];
    comparisonQueries = cleanQueries(parsed.comparisonQueries);
    plainQueries = cleanQueries(parsed.plainQueries);
    if (Array.isArray(parsed.postIdeas)) postIdeas = parsed.postIdeas.filter((q: unknown) => typeof q === "string" && q.trim()).slice(0, 3);
    if (Array.isArray(parsed.signalKeywords)) signalKeywords = parsed.signalKeywords.filter((q: unknown) => typeof q === "string" && q.trim()).slice(0, 8);
    if (Array.isArray(parsed.ambiguousTerms)) ambiguousTerms = parsed.ambiguousTerms.filter((q: unknown) => typeof q === "string" && q.trim()).slice(0, 8);
  } catch {}

  if (comparisonQueries.length === 0 && plainQueries.length === 0) {
    comparisonQueries = [niche, ...competitors.map((c) => `${c} alternative`), ...competitors.map((c) => `${c} vs`)].filter(Boolean).slice(0, 8);
  }
  let queries = [...comparisonQueries, ...plainQueries];

  // User-provided keywords (social_keywords — the same table the dashboard's
  // Tasks-tab Reddit sync already uses) get searched for verbatim, on top of
  // whatever the model generated — guaranteed control over what gets
  // searched, rather than hoping the model infers the right query. Also
  // folded into the relevance signal terms below, so a thread that only
  // matches via a manual keyword (and not any AI-generated signal term)
  // still survives the filter instead of being silently dropped.
  let manualKeywords: string[] = [];
  try {
    const { data: keywordRows } = await writeDb
      .from("social_keywords")
      .select("keyword")
      .eq("brand_id", brand.id)
      .order("created_at", { ascending: false })
      .limit(10);
    manualKeywords = (keywordRows ?? []).map((k: { keyword: string }) => k.keyword.trim()).filter(Boolean);
  } catch {}
  if (manualKeywords.length) {
    // AI-generated queries always keep their own slots regardless of how
    // many manual keywords exist — capped independently rather than sharing
    // one pool, so a long manual keyword list can never crowd them out.
    queries = Array.from(new Set([...manualKeywords, ...queries]));
  }

  if (postIdeas.length === 0) {
    postIdeas = [
      `What's everyone using for ${niche} these days?`,
      `Tried a few ${niche} options recently — here's what I found`,
      `Looking for recommendations: ${niche}`,
    ];
  }

  const headers = await getRedditHeaders();
  const searchResults = await Promise.allSettled(
    queries.map((q) => searchReddit(q, headers, { sort: "relevance", time: "all", limit: 25 }))
  );

  const byId = new Map<string, { keyword: string; post: Record<string, unknown> }>();
  searchResults.forEach((r, i) => {
    if (r.status !== "fulfilled") return;
    for (const post of r.value) {
      const id = post.id as string | undefined;
      if (!id || byId.has(id)) continue;
      byId.set(id, { keyword: queries[i], post });
    }
  });

  const { terms: signalTerms, ambiguous: ambiguousSignalTerms } = buildSignalTerms(niche, competitors, signalKeywords, ambiguousTerms);
  // Fold the plain queries themselves in as additional signal terms. They're
  // short, specific, on-topic phrases by construction (that's why the model
  // picked them as search queries) and empirically overlap with real thread
  // titles far more reliably than the separately-generated signalKeywords —
  // e.g. signal keyword "face ratings" (plural) doesn't match a real title's
  // "face rating" (singular), but the plain query "face rating" does.
  // Tried outright bypassing the filter for plain-query hits instead of this
  // — worse: plain queries like "face rating" also surface huge-scored,
  // completely unrelated viral posts (r/science studies, r/politics
  // megathreads that happen to contain the words "face" and "rating"), which
  // then buried the genuinely relevant low-score threads before the LLM
  // verification pass ever saw them. Still filtering, just with a better
  // term list, keeps that protection intact.
  for (const q of plainQueries) {
    const t = q.trim().toLowerCase();
    if (t && !OVERLOADED_TERMS.has(t)) signalTerms.add(t);
  }
  const manualKeywordSet = new Set(manualKeywords.map((k) => k.toLowerCase()));
  // A title naming an actual competitor ("switch from Payoneer") is a much
  // stronger signal than one that only matched a generic niche phrase — show
  // those first, generic-match threads after.
  const competitorTerms = new Set(competitors.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const candidates = Array.from(byId.values())
    .map(({ keyword, post }) => ({
      keyword,
      redditId: post.id as string,
      subreddit: post.subreddit as string,
      title: post.title as string,
      url: `https://reddit.com${post.permalink as string}`,
      body: ((post.selftext as string) ?? "").slice(0, 500),
      score: (post.score as number) ?? 0,
      numComments: (post.num_comments as number) ?? 0,
      createdAt: post.created_utc ? new Date((post.created_utc as number) * 1000).toISOString() : null,
    }))
    .filter((t) => t.subreddit && t.title && t.score + t.numComments > 0);

  // Require the title to actually be on-topic before ranking by popularity —
  // otherwise a viral, unrelated post always wins over a quieter relevant
  // one. Deliberately NEVER fall back to the unfiltered pool when relevant
  // hits are scarce: a viral post pulled in by a noisy Reddit search can have
  // 100x the score of anything genuinely on-topic, so "show the raw top N
  // instead of too few" silently means "show whatever's most viral on all of
  // Reddit right now" — which for a fintech brand can mean surfacing a movie
  // review megathread or worse. Showing zero threads (the caller's empty
  // state) is always better than showing an irrelevant one.
  // A candidate found via one of the user's own manual keywords skips this
  // filter — they explicitly chose that search term, so it's trusted the
  // same way a competitor-name match is. It still has to clear the LLM
  // buying-intent pass below like everything else.
  const relevantSorted = candidates
    .filter((t) => manualKeywordSet.has(t.keyword.toLowerCase()) || titleMatchesSignal(t.title, signalTerms, ambiguousSignalTerms))
    .sort((a, b) => b.score + b.numComments * 3 - (a.score + a.numComments * 3));

  // Pull well more than THREADS_TO_SHOW into the LLM verification pass below
  // — keyword matching's false positives (proper-noun homonyms) get rejected
  // there, so starting from exactly the display count would often leave
  // fewer than that left.
  const dedupedPool = dedupeNearIdenticalTitles(relevantSorted, 40);
  const verifiedIndices = await verifyRelevanceWithLLM(brand.name, niche, competitors, dedupedPool.map((t) => ({ title: t.title, body: t.body })));
  const verified = dedupedPool.filter((_, i) => verifiedIndices.has(i));

  // Re-sort the verified set: direct competitor mentions first (score-sorted
  // within that group), then everything else that only matched a generic
  // signal phrase (also score-sorted) — `relevantSorted`'s order is stable
  // by score already, so this is a partition, not a re-sort of either group.
  const directCompetitorMatches = verified.filter((t) => titleMatchesSignal(t.title, competitorTerms, ambiguousSignalTerms));
  const otherMatches = verified.filter((t) => !titleMatchesSignal(t.title, competitorTerms, ambiguousSignalTerms));
  const ranked = [...directCompetitorMatches, ...otherMatches].slice(0, THREADS_TO_SHOW);

  const uniqueSubs = Array.from(new Set(ranked.map((t) => t.subreddit)));
  const subInfoEntries = await Promise.all(uniqueSubs.map(async (s) => [s, await getSubredditInfo(s, headers)] as const));
  const subInfo = new Map(subInfoEntries);

  let threads: RedditOpportunityThread[] = ranked.map((t) => {
    const subscribers = subInfo.get(t.subreddit)?.subscribers ?? null;
    const estimatedViews = estimateThreadViews(t.score, t.numComments, subscribers);
    const clients = estimateClientRange(estimatedViews, estimatedViews);
    return { ...t, id: null, subredditSubscribers: subscribers, estimatedViews, estimatedClientsLow: clients.low, estimatedClientsHigh: clients.high };
  });

  // Pair the strongest real, already-verified-to-exist subreddits (from the
  // threads we just found) with generated post ideas — safer than asking the
  // model to invent subreddit names, which risks recommending one that
  // doesn't exist or isn't actually relevant.
  const subredditWeight = new Map<string, number>();
  for (const t of threads) subredditWeight.set(t.subreddit, (subredditWeight.get(t.subreddit) ?? 0) + t.score + t.numComments * 3);
  const topSubs = Array.from(subredditWeight.entries()).sort((a, b) => b[1] - a[1]).map(([s]) => s);

  const suggestedPosts: SuggestedRedditPost[] = topSubs.slice(0, 3).map((sub, i) => {
    const subscribers = subInfo.get(sub)?.subscribers ?? null;
    const range = estimatePostViewRange(subscribers);
    const clients = estimateClientRange(range.low, range.high);
    return {
      subreddit: sub,
      subscribers,
      title: postIdeas[i] ?? postIdeas[0],
      estimatedViewsLow: range.low,
      estimatedViewsHigh: range.high,
      estimatedClientsLow: clients.low,
      estimatedClientsHigh: clients.high,
    };
  });

  // Best-effort persistence — seeds the dashboard's Reddit Marketing tab
  // with exactly what was just found. Deliberately does NOT write the
  // AI-generated queries into social_keywords: that table is now the user's
  // own manually-entered keyword list (searched verbatim every scan,
  // exempted from the relevance filter below on the assumption the user
  // picked it deliberately) — auto-saving every run's generated queries into
  // it would snowball across repeated scans and eventually crowd out fresh
  // AI query generation entirely, since the total query count is capped.
  try {
    if (threads.length) {
      const threadRows = threads.map((t) => ({
        brand_id: brand.id,
        keyword: t.keyword,
        reddit_id: t.redditId,
        subreddit: t.subreddit,
        title: t.title,
        url: t.url,
        body: t.body,
        score: t.score,
        num_comments: t.numComments,
        reddit_created_at: t.createdAt,
      }));
      await writeDb.from("reddit_threads").upsert(threadRows, { onConflict: "brand_id,reddit_id", ignoreDuplicates: true });

      // upsert with ignoreDuplicates doesn't return the rows (Postgres ON
      // CONFLICT DO NOTHING + RETURNING only reports newly-inserted rows,
      // not ones skipped as duplicates) — a follow-up select is the only way
      // to get every row's real id back, needed so a "request a comment"
      // action elsewhere can reuse /api/reddit/draft's threadId-based flow.
      const { data: persisted } = await writeDb
        .from("reddit_threads")
        .select("id, reddit_id")
        .eq("brand_id", brand.id)
        .in("reddit_id", threads.map((t) => t.redditId));
      const idByRedditId = new Map<string, string>((persisted ?? []).map((r: { id: string; reddit_id: string }) => [r.reddit_id, r.id]));
      threads = threads.map((t) => ({ ...t, id: idByRedditId.get(t.redditId) ?? null }));
    }
  } catch (e) {
    console.error("[reddit-opportunities] persistence failed", e);
  }

  return { threads, totalFound: byId.size, suggestedPosts };
}
