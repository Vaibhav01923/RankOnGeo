import OpenAI from "openai";
import { serverClient } from "@/lib/supabase";
import { requiresPaywall } from "@/lib/plan-limits";
import { qualityProblems, rewriteArticle, writeArticle, type WrittenArticle } from "@/lib/article-writer";
import { canUpdateInPlace, publishToChannel, type PublishChannel } from "@/lib/publish-article";
import { isDueForReview, isNewPostDue, judgePerformance, normalizeKeyword, pickNextTopic, type Performance, type ReviewableArticle } from "@/lib/autopilot-rules";
import { syncResearchTopics } from "@/lib/keyword-research";
import { findKeywordOpportunities } from "@/lib/keyword-opportunities";
import type { KeywordOpportunity } from "@/lib/keyword-rules";
import { decryptToken, fetchPageStats, fetchTopQueries, getAccessToken, gscConfigured, strikingDistance, type PageStats } from "@/lib/gsc";

// Blog autopilot: keeps a steady stream of on-topic, SEO/GEO-optimised posts
// going out for a brand, and revisits posts that aren't earning traffic.
//
// Deliberate limits — this runs unattended against customers' live sites:
//  * off until the customer switches it on, paid plans only;
//  * at most one long generation per brand per run;
//  * a post is only judged after it has had time to be indexed, at most once
//    per review window, and rewritten a bounded number of times;
//  * a live post is only overwritten where the destination can address it by
//    id. Everywhere else the rewrite is saved as a draft for the customer.

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_QUEUED_TOPICS = 3;

// ---- orchestration ---------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

type BrandRow = { id: string; user_id: string; name: string; domain: string; niche: string | null; description: string | null; competitors: string[] | null; target_audience: string[] | null };
type Settings = {
  brand_id: string;
  enabled: boolean;
  channel_id: string | null;
  posts_per_week: number;
  publish_mode: "publish" | "draft";
  auto_rewrite: boolean;
};

export type RunSummary = { actions: string[]; error?: string; skipped?: string };

async function ideasFromAi(brand: BrandRow, avoid: string[]): Promise<string[]> {
  const prompt = `List 12 distinct blog keywords or questions that people search for (in Google and in AI assistants like ChatGPT) that a company in this niche should rank for. Mix comparison ("best X for Y"), how-to, and problem-aware searches. Return one per line, no numbering, no commentary.

Company: ${brand.name} (${brand.domain})
Niche: ${brand.niche ?? "unspecified"}
What it does: ${brand.description ?? "unspecified"}
Competitors: ${(brand.competitors ?? []).slice(0, 6).join(", ") || "unspecified"}

Do not repeat or lightly reword any of these already-covered topics:
${avoid.slice(0, 60).map((a) => `- ${a}`).join("\n") || "- (none yet)"}`;
  const res = await new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions.create({
    model: "gpt-5.4-nano-2026-03-17",
    max_completion_tokens: 800,
    messages: [{ role: "user", content: prompt }],
  });
  return (res.choices[0]?.message?.content ?? "")
    .split("\n")
    .map((l) => l.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter(Boolean);
}

async function gscAccess(db: Db, brandId: string): Promise<{ token: string; siteUrl: string } | null> {
  if (!gscConfigured()) return null;
  const { data: conn } = await db.from("gsc_connections").select("refresh_token_enc, site_url").eq("brand_id", brandId).maybeSingle();
  if (!conn?.site_url) return null;
  const refresh = decryptToken(conn.refresh_token_enc);
  if (!refresh) return null;
  const t = await getAccessToken(refresh);
  return t.ok ? { token: t.token, siteUrl: conn.site_url } : null;
}

// Keeps a few topics queued. Sources, best first: what AI engines answer
// without mentioning the brand (its visibility gaps), searches Google already
// half-associates the site with, and finally fresh ideas for the niche — so
// the queue works from day one and gets sharper as data arrives.
// The brand's keyword research (what buyers search, with volume) is the first
// thing Autopilot writes for. Use the saved list; only when there is none, and
// the queue is running low, build it now (one paid lookup, then cached).
async function ensureResearchTopics(db: Db, brand: BrandRow, allowFetch: boolean): Promise<void> {
  const { data: scan } = await db.from("keyword_opportunity_scans").select("keywords").eq("brand_id", brand.id).maybeSingle();
  let list = (scan?.keywords ?? null) as KeywordOpportunity[] | null;
  if (!list && allowFetch) {
    try {
      list = (await findKeywordOpportunities(brand, db)).keywords;
    } catch (e) {
      console.error("[autopilot] keyword research failed", e instanceof Error ? e.message : e);
    }
  }
  if (list?.length) await syncResearchTopics(db, brand.id, list);
}

async function refillTopics(db: Db, brand: BrandRow): Promise<number> {
  const queuedNow = async () => (await db.from("autopilot_topics").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).eq("status", "queued")).count ?? 0;
  await ensureResearchTopics(db, brand, (await queuedNow()) < MIN_QUEUED_TOPICS);
  if ((await queuedNow()) >= MIN_QUEUED_TOPICS) return 0;

  const [{ data: existingTopics }, { data: existingArticles }] = await Promise.all([
    db.from("autopilot_topics").select("keyword").eq("brand_id", brand.id),
    db.from("articles").select("keyword").eq("brand_id", brand.id),
  ]);
  const seen = new Set<string>([...(existingTopics ?? []), ...(existingArticles ?? [])].map((r: { keyword: string | null }) => normalizeKeyword(r.keyword ?? "")).filter(Boolean));
  const fresh: { keyword: string; source: "gap" | "search" | "ai" }[] = [];
  const add = (list: string[], source: "gap" | "search" | "ai", cap: number) => {
    let n = 0;
    for (const raw of list) {
      const keyword = normalizeKeyword(raw);
      if (keyword.length < 4 || keyword.length > 120 || seen.has(keyword) || n >= cap) continue;
      seen.add(keyword);
      fresh.push({ keyword, source });
      n++;
    }
  };

  const { data: latestRun } = await db.from("scan_runs").select("id").eq("brand_id", brand.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (latestRun) {
    const { data: gaps } = await db.from("scan_results").select("prompt_text, brand_mentioned").eq("scan_run_id", latestRun.id).eq("brand_mentioned", false);
    add((gaps ?? []).map((g: { prompt_text: string }) => g.prompt_text), "gap", 8);
  }

  const gsc = await gscAccess(db, brand.id);
  if (gsc) {
    const rows = await fetchTopQueries(gsc.token, gsc.siteUrl);
    if (rows) add(strikingDistance(rows, 12), "search", 8);
  }

  if (fresh.length < MIN_QUEUED_TOPICS + 2) {
    try {
      add(await ideasFromAi(brand, [...seen]), "ai", 10);
    } catch (e) {
      console.error("[autopilot] idea generation failed", e instanceof Error ? e.message : e);
    }
  }

  if (!fresh.length) return 0;
  const { error } = await db.from("autopilot_topics").upsert(
    fresh.map((f) => ({ brand_id: brand.id, keyword: f.keyword, source: f.source })),
    { onConflict: "brand_id,keyword", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  return fresh.length;
}

async function writeWithGate(input: Parameters<typeof writeArticle>[0]): Promise<WrittenArticle> {
  let last: WrittenArticle | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    last = await writeArticle(input);
    if (qualityProblems(last).length === 0) return last;
  }
  throw new Error(`Generated article failed quality checks: ${qualityProblems(last!).join(", ")}`);
}

async function logPublish(db: Db, brandId: string, channelId: string | null, articleId: string, title: string, ok: boolean, error: string | null) {
  await db.from("publishing_log").insert({ brand_id: brandId, channel_id: channelId, article_id: articleId, article_title: title, status: ok ? "published" : "failed", error_message: error });
}

async function createPost(db: Db, brand: BrandRow, settings: Settings, channel: PublishChannel | null): Promise<string> {
  const { data: queued } = await db.from("autopilot_topics").select("id, keyword, source, volume, created_at").eq("brand_id", brand.id).eq("status", "queued");
  const topic = pickNextTopic((queued ?? []) as { id: string; keyword: string; source: string; volume: number | null; created_at: string }[]);
  if (!topic) return "No topics available to write about yet.";

  let written: WrittenArticle;
  try {
    written = await writeWithGate({ topic: topic.keyword, brandName: brand.name, niche: brand.niche ?? "", brandDescription: brand.description });
  } catch (e) {
    // A topic that can't be written to standard twice isn't retried forever.
    await db.from("autopilot_topics").update({ status: "skipped" }).eq("id", topic.id);
    throw e;
  }

  const { data: article, error } = await db
    .from("articles")
    .insert({
      brand_id: brand.id,
      user_id: brand.user_id,
      title: written.title,
      content: written.article,
      keyword: topic.keyword,
      status: "draft",
      word_count: written.wordCount,
      description: written.description,
      tags: written.tags,
      source: "autopilot",
      channel_id: settings.channel_id,
    })
    .select("id")
    .single();
  if (error || !article) throw new Error(error?.message ?? "Couldn't save the article");
  await db.from("autopilot_topics").update({ status: "used", article_id: article.id }).eq("id", topic.id);

  if (settings.publish_mode === "draft" || !channel) return `Wrote a draft: "${written.title}"`;

  const result = await publishToChannel(channel, { title: written.title, content: written.article, keyword: topic.keyword, description: written.description, tags: written.tags, image_url: null });
  await logPublish(db, brand.id, settings.channel_id, article.id, written.title, result.success, result.error);
  if (!result.success) throw new Error(`Wrote "${written.title}" but publishing failed: ${result.error}`);
  await Promise.all([
    db.from("articles").update({ status: "published", published_at: new Date().toISOString(), published_url: result.publishedUrl, remote_id: result.remoteId }).eq("id", article.id),
    db.from("publishing_channels").update({ last_published_at: new Date().toISOString() }).eq("id", settings.channel_id),
  ]);
  return `Published: "${written.title}"`;
}

async function measure(db: Db, brand: BrandRow, url: string, gsc: { token: string; siteUrl: string } | null): Promise<Performance | null> {
  if (gsc) {
    const stats: PageStats | null = await fetchPageStats(gsc.token, gsc.siteUrl, url);
    if (stats) return { source: "gsc", impressions: stats.impressions, clicks: stats.clicks, position: stats.position, queries: stats.queries.map((q) => q.label) };
  }
  // No Search Console: fall back to our own tracker, but only if it has ever
  // received a real visit — otherwise "zero visits" just means "not installed".
  const { data: realVisit } = await db.from("web_visits").select("id").eq("brand_id", brand.id).not("visitor_id", "like", "test-%").limit(1).maybeSingle();
  if (!realVisit) return null;
  let path = "/";
  try { path = new URL(url).pathname; } catch {}
  const since = new Date(Date.now() - 28 * DAY_MS).toISOString();
  const { count } = await db.from("web_visits").select("id", { count: "exact", head: true }).eq("brand_id", brand.id).eq("path", path).gte("created_at", since);
  return { source: "traffic", pageviews: count ?? 0 };
}

async function reviewAndRewrite(db: Db, brand: BrandRow, settings: Settings, channel: PublishChannel | null): Promise<string | null> {
  const { data: published } = await db
    .from("articles")
    .select("id, title, content, keyword, description, tags, status, published_at, published_url, remote_id, channel_id, last_reviewed_at, rewrite_count")
    .eq("brand_id", brand.id)
    .eq("status", "published")
    .not("published_url", "is", null)
    .order("published_at", { ascending: true })
    .limit(50);
  const due = (published ?? []).filter((a: ReviewableArticle) => isDueForReview(a)).slice(0, 3);
  if (!due.length) return null;

  const gsc = await gscAccess(db, brand.id);
  for (const a of due) {
    const perf = await measure(db, brand, a.published_url, gsc);
    if (!perf) continue; // nothing to judge with — leave it for when data exists
    const verdict = judgePerformance(perf);
    const markReviewed = () => db.from("articles").update({ last_reviewed_at: new Date().toISOString() }).eq("id", a.id);
    if (!verdict.underperforming) { await markReviewed(); continue; }

    const rewritten = await rewriteArticle({
      topic: a.keyword || a.title,
      brandName: brand.name,
      niche: brand.niche ?? "",
      brandDescription: brand.description,
      existingTitle: a.title,
      existingContent: a.content ?? "",
      findings: verdict.findings,
      queriesToCover: verdict.queries.slice(0, 10),
      keepTitle: verdict.keepTitle,
    });
    // Reviewed as soon as the rewrite exists: a failure after this point (bad
    // output, the destination rejecting the update) waits out the review
    // window instead of regenerating a long article every run. Only a failure
    // of the generation itself, above, leaves it to be retried next run.
    await markReviewed();
    const problems = qualityProblems(rewritten);
    if (problems.length) return `Skipped rewriting "${a.title}" — the new version failed quality checks (${problems.join(", ")}).`;

    const inPlace = settings.publish_mode === "publish" && channel && a.channel_id === settings.channel_id && canUpdateInPlace(channel.type, a.remote_id);
    if (inPlace) {
      const result = await publishToChannel(channel, { title: rewritten.title, content: rewritten.article, keyword: a.keyword, description: rewritten.description, tags: rewritten.tags, image_url: null }, { update: { remoteId: a.remote_id } });
      await logPublish(db, brand.id, settings.channel_id, a.id, `Rewrite: ${rewritten.title}`, result.success, result.error);
      if (!result.success) throw new Error(`Rewrote "${a.title}" but updating the live post failed: ${result.error}`);
      await db.from("articles").update({ title: rewritten.title, content: rewritten.article, description: rewritten.description, tags: rewritten.tags, word_count: rewritten.wordCount, rewrite_count: (a.rewrite_count ?? 0) + 1, updated_at: new Date().toISOString() }).eq("id", a.id);
      return `Rewrote and updated the live post: "${rewritten.title}" (${verdict.findings[0]})`;
    }

    // Can't safely overwrite the live post from here — hand the improved
    // version over as a draft instead of guessing.
    await db.from("articles").insert({ brand_id: brand.id, user_id: brand.user_id, title: rewritten.title, content: rewritten.article, keyword: a.keyword, status: "draft", word_count: rewritten.wordCount, description: rewritten.description, tags: rewritten.tags, source: "autopilot" });
    await db.from("articles").update({ rewrite_count: (a.rewrite_count ?? 0) + 1 }).eq("id", a.id);
    return `Wrote an improved version of "${a.title}" as a draft — replace the live post with it (${verdict.findings[0]})`;
  }
  return null;
}

export async function runAutopilot(brandId: string, opts: { force?: boolean } = {}): Promise<RunSummary> {
  const db: Db = serverClient();
  const summary: RunSummary = { actions: [] };

  const { data: settings } = await db.from("autopilot_settings").select("*").eq("brand_id", brandId).maybeSingle();
  if (!settings || (!settings.enabled && !opts.force)) return { ...summary, skipped: "not enabled" };

  const { data: brand } = await db.from("brands").select("id, user_id, name, domain, niche, description, competitors, target_audience").eq("id", brandId).maybeSingle();
  if (!brand) return { ...summary, skipped: "brand not found" };
  if (await requiresPaywall(db, brand.user_id)) return { ...summary, skipped: "plan" };

  let channel: PublishChannel | null = null;
  if (settings.channel_id) {
    const { data } = await db.from("publishing_channels").select("type, url, api_key, username, status").eq("id", settings.channel_id).maybeSingle();
    if (data && data.status !== "paused") channel = data;
  }

  try {
    if (settings.publish_mode === "publish" && !channel) throw new Error("Choose a publishing channel (or switch to “save as drafts”).");

    await refillTopics(db, brand);

    const { data: last } = await db.from("articles").select("created_at").eq("brand_id", brandId).eq("source", "autopilot").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (opts.force || isNewPostDue(last?.created_at ?? null, settings.posts_per_week)) {
      summary.actions.push(await createPost(db, brand, settings, channel));
    } else if (settings.auto_rewrite) {
      const rewrite = await reviewAndRewrite(db, brand, settings, channel);
      if (rewrite) summary.actions.push(rewrite);
    }
    await db.from("autopilot_settings").update({ last_run_at: new Date().toISOString(), last_error: null }).eq("brand_id", brandId);
  } catch (e) {
    summary.error = e instanceof Error ? e.message : "Autopilot failed";
    await db.from("autopilot_settings").update({ last_run_at: new Date().toISOString(), last_error: summary.error.slice(0, 500) }).eq("brand_id", brandId);
  }
  return summary;
}
