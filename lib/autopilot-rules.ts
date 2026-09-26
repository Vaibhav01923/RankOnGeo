// The decisions the blog autopilot makes, kept free of I/O so they can be
// tested on their own (see lib/autopilot.ts for the orchestration).

const DAY_MS = 24 * 60 * 60 * 1000;

export const REVIEW_MIN_AGE_DAYS = 45;
export const MAX_REWRITES = 3;

// ---- pure decision logic (unit tested) -------------------------------------

// Runs are frequent; the cadence gate decides whether a new post is due. Two
// hours of slack keeps a "3 posts a week" schedule from drifting a run late
// every cycle.
export function isNewPostDue(lastPostAt: string | null, postsPerWeek: number, now = Date.now()): boolean {
  if (!lastPostAt) return true;
  const interval = (7 * DAY_MS) / Math.max(1, Math.min(7, postsPerWeek));
  return now - new Date(lastPostAt).getTime() >= interval - 2 * 60 * 60 * 1000;
}

export type ReviewableArticle = {
  status: string | null;
  published_at: string | null;
  published_url: string | null;
  last_reviewed_at: string | null;
  rewrite_count: number | null;
};

export function isDueForReview(a: ReviewableArticle, now = Date.now()): boolean {
  if (a.status !== "published" || !a.published_url || !a.published_at) return false;
  if ((a.rewrite_count ?? 0) >= MAX_REWRITES) return false;
  const age = now - new Date(a.published_at).getTime();
  if (age < REVIEW_MIN_AGE_DAYS * DAY_MS) return false;
  if (a.last_reviewed_at && now - new Date(a.last_reviewed_at).getTime() < REVIEW_MIN_AGE_DAYS * DAY_MS) return false;
  return true;
}

export type Performance =
  | { source: "gsc"; impressions: number; clicks: number; position: number; queries: string[] }
  | { source: "traffic"; pageviews: number };

export type Verdict = { underperforming: boolean; findings: string[]; keepTitle: boolean; queries: string[] };

// What "not performing" means, in the order of how fixable it is. Search
// Console is the real signal; our own pageview count is the fallback for
// sites that only installed the tracker.
export function judgePerformance(p: Performance): Verdict {
  if (p.source === "traffic") {
    return p.pageviews < 10
      ? { underperforming: true, keepTitle: false, queries: [], findings: [`Only ${p.pageviews} visit${p.pageviews === 1 ? "" : "s"} in the last 28 days.`] }
      : { underperforming: false, keepTitle: true, queries: [], findings: [] };
  }
  const ctr = p.impressions ? p.clicks / p.impressions : 0;
  if (p.impressions < 50) {
    return {
      underperforming: true,
      keepTitle: true,
      queries: p.queries,
      findings: [`Google barely shows this page: ${p.impressions} impressions in 28 days.`, "It needs deeper, more complete coverage of the topic and the related searches people actually make."],
    };
  }
  if (p.position > 15) {
    return {
      underperforming: true,
      keepTitle: true,
      queries: p.queries,
      findings: [`Average position ${p.position.toFixed(1)} — stuck beyond the first page or two of results.`, "It needs to answer the intent more directly and thoroughly than the pages currently ranking above it."],
    };
  }
  if (p.impressions >= 500 && ctr < 0.01) {
    return {
      underperforming: true,
      keepTitle: false,
      queries: p.queries,
      findings: [`Shown ${p.impressions.toLocaleString()} times but clicked only ${(ctr * 100).toFixed(1)}% of the time — the title isn't earning the click.`],
    };
  }
  return { underperforming: false, keepTitle: true, queries: [], findings: [] };
}

export function normalizeKeyword(k: string): string {
  return k.toLowerCase().replace(/\s+/g, " ").trim().replace(/[?.!]+$/, "").trim();
}

const SOURCE_PRIORITY: Record<string, number> = { gap: 0, search: 1, ai: 2 };

export function pickNextTopic<T extends { source: string; created_at: string }>(queued: T[]): T | null {
  return [...queued].sort((a, b) => (SOURCE_PRIORITY[a.source] ?? 9) - (SOURCE_PRIORITY[b.source] ?? 9) || a.created_at.localeCompare(b.created_at))[0] ?? null;
}
