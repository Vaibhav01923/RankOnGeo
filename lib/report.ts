// The weekly / monthly report: what RankOnGeo did for a brand in a period and what
// came of it. Everything here is pure (no I/O) so it can be tested; the numbers are
// gathered in lib/report-data.ts and turned into email / Slack / Discord messages in
// lib/report-format.ts.

export type ReportPeriod = "weekly" | "monthly";

const DAY_MS = 24 * 60 * 60 * 1000;

export type PeriodRange = {
  period: ReportPeriod;
  // [from, to): from is inclusive, to is exclusive. Always UTC.
  from: string;
  to: string;
  // The same window one period earlier, for "vs last week".
  prevFrom: string;
  prevTo: string;
  label: string;
  // Stable id for de-duplicating sends: "2026-W39" or "2026-09".
  key: string;
  // True while the period has not ended yet (a "so far" report).
  inProgress: boolean;
};

const startOfWeekUtc = (ms: number) => {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return d.getTime() - dow * DAY_MS;
};

// ISO week number and the year it belongs to.
export function isoWeek(ms: number): { year: number; week: number } {
  // The Thursday of a week decides which year the week belongs to.
  const thursday = new Date(startOfWeekUtc(ms) + 3 * DAY_MS);
  const yearStart = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return { year: thursday.getUTCFullYear(), week: Math.floor((thursday.getTime() - yearStart) / (7 * DAY_MS)) + 1 };
}

const fmtDay = (ms: number, withYear = false) =>
  new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" });

// offset 0 is the period containing `now` (so far), -1 the one before it, and so on.
export function periodRange(period: ReportPeriod, offset = 0, now = Date.now()): PeriodRange {
  const off = Math.min(0, Math.max(-104, Math.trunc(offset)));
  if (period === "weekly") {
    const from = startOfWeekUtc(now) + off * 7 * DAY_MS;
    const to = from + 7 * DAY_MS;
    const { year, week } = isoWeek(from);
    return {
      period,
      from: new Date(from).toISOString(),
      to: new Date(to).toISOString(),
      prevFrom: new Date(from - 7 * DAY_MS).toISOString(),
      prevTo: new Date(from).toISOString(),
      label: `${fmtDay(from)} – ${fmtDay(to - DAY_MS, true)}`,
      key: `${year}-W${String(week).padStart(2, "0")}`,
      inProgress: now < to,
    };
  }
  const cur = new Date(now);
  const startOf = (monthsBack: number) => Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + off - monthsBack, 1);
  const from = startOf(0);
  const to = startOf(-1);
  const prevFrom = startOf(1);
  const f = new Date(from);
  return {
    period,
    from: new Date(from).toISOString(),
    to: new Date(to).toISOString(),
    prevFrom: new Date(prevFrom).toISOString(),
    prevTo: new Date(from).toISOString(),
    label: f.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
    key: `${f.getUTCFullYear()}-${String(f.getUTCMonth() + 1).padStart(2, "0")}`,
    inProgress: now < to,
  };
}

// ---- the report ------------------------------------------------------------

export type Delta = { value: number; previous: number | null; change: number | null };

export type EngineScore = { engine: string; label: string; score: number; previous: number | null; change: number | null };

export type ReportArticle = {
  id: string;
  title: string;
  keyword: string | null;
  url: string | null;
  publishedAt: string | null;
  source: "autopilot" | "manual";
  views: number;
  aiVisits: number;
};

export type Report = {
  period: ReportPeriod;
  range: PeriodRange;
  brand: { id: string; name: string; domain: string };
  generatedAt: string;
  headline: string;
  visibility: {
    score: number | null;
    previous: number | null;
    change: number | null;
    // The score is from the latest scan at or before the end of the period; this says if a scan ran inside it.
    scannedInPeriod: boolean;
    scans: number;
    lastScanAt: string | null;
    engines: EngineScore[];
    promptsTracked: number;
    gapsNow: number;
    gapsPrevious: number | null;
    topGaps: { prompt: string; engines: string[]; competitor: string | null }[];
    topCompetitors: { name: string; prompts: number }[];
  };
  articles: {
    publishedCount: number;
    previousPublishedCount: number;
    published: ReportArticle[];
    draftsWritten: number;
    publishedAllTime: number;
    upcoming: { keyword: string; kind: "keyword" | "prompt"; scheduledAt: string | null }[];
    autopublishOn: boolean;
    postsPerWeek: number | null;
  };
  traffic: {
    available: boolean;
    pageviews: Delta;
    visitors: Delta;
    aiVisits: Delta;
    aiSources: { label: string; count: number }[];
    topPages: { path: string; views: number }[];
    topReferrers: { label: string; count: number }[];
  };
  crawlers: {
    available: boolean;
    total: Delta;
    byBot: { label: string; count: number }[];
    topPages: { path: string; count: number }[];
  };
  search: {
    connected: boolean;
    clicks: Delta | null;
    impressions: Delta | null;
    ctr: number | null;
    position: number | null;
    previousPosition: number | null;
    topQueries: { label: string; clicks: number; impressions: number; position: number }[];
    note: string;
  };
  reddit: {
    tasks: number;
    completed: number;
    upvotes: number;
    comments: number;
    creditsSpent: number;
  };
  // Plain sentences for "what RankOnGeo did", in the order they are shown.
  activity: string[];
};

export function makeDelta(value: number, previous: number | null): Delta {
  return { value, previous, change: previous === null ? null : value - previous };
}

export const pct = (n: number, digits = 0) => `${(n * 100).toFixed(digits)}%`;

export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

export function num(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// "+12%" style change for counts; null when there is nothing to compare with.
export function changePct(d: Delta): number | null {
  if (d.previous === null || d.previous === 0) return null;
  return Math.round(((d.value - d.previous) / d.previous) * 100);
}

// The one-line summary at the top of the report and of every message.
export function buildHeadline(r: Pick<Report, "period" | "visibility" | "articles" | "traffic">): string {
  const word = r.period === "weekly" ? "week" : "month";
  const parts: string[] = [];
  const v = r.visibility;
  if (v.score !== null) {
    if (v.change !== null && v.change !== 0) parts.push(`AI visibility is ${v.score}% (${signed(v.change)} pts since the previous scan)`);
    else parts.push(`AI visibility is ${v.score}%`);
  } else {
    parts.push("No AI visibility scan yet");
  }
  const n = r.articles.publishedCount;
  parts.push(n === 0 ? `no articles published this ${word}` : `${n} article${n === 1 ? "" : "s"} published`);
  if (r.traffic.available && r.traffic.visitors.value > 0) parts.push(`${num(r.traffic.visitors.value)} visitor${r.traffic.visitors.value === 1 ? "" : "s"}`);
  return parts.join(", ");
}

// The "What RankOnGeo did" list, from the numbers already in the report.
export function buildActivity(r: Omit<Report, "activity" | "headline">): string[] {
  const out: string[] = [];
  const a = r.articles;
  if (a.publishedCount > 0) {
    const auto = a.published.filter((x) => x.source === "autopilot").length;
    out.push(`Published ${a.publishedCount} article${a.publishedCount === 1 ? "" : "s"}${auto ? ` (${auto} written and published automatically by Autopilot)` : ""}.`);
  }
  if (a.draftsWritten > 0) out.push(`Wrote ${a.draftsWritten} draft${a.draftsWritten === 1 ? "" : "s"} waiting for your review.`);
  const v = r.visibility;
  if (v.scans > 0) out.push(`Ran ${v.scans} AI visibility scan${v.scans === 1 ? "" : "s"} across ${v.engines.length || "all"} AI engines and ${v.promptsTracked} tracked prompts.`);
  if (v.gapsPrevious !== null && v.gapsNow < v.gapsPrevious) out.push(`Closed ${v.gapsPrevious - v.gapsNow} AI visibility gap${v.gapsPrevious - v.gapsNow === 1 ? "" : "s"} (${v.gapsNow} still open).`);
  if (r.traffic.available && r.traffic.pageviews.value > 0) {
    out.push(`Tracked ${num(r.traffic.pageviews.value)} pageviews from ${num(r.traffic.visitors.value)} visitors${r.traffic.aiVisits.value ? `, ${num(r.traffic.aiVisits.value)} of them arriving from AI answers` : ""}.`);
  }
  if (r.crawlers.available && r.crawlers.total.value > 0) out.push(`Detected ${num(r.crawlers.total.value)} visit${r.crawlers.total.value === 1 ? "" : "s"} from AI crawlers${r.crawlers.byBot[0] ? ` (most from ${r.crawlers.byBot[0].label})` : ""}.`);
  if (r.search.connected && r.search.clicks && r.search.impressions) out.push(`Google showed your site ${num(r.search.impressions.value)} times and sent ${num(r.search.clicks.value)} click${r.search.clicks.value === 1 ? "" : "s"}.`);
  if (r.reddit.tasks > 0) out.push(`Handled ${r.reddit.tasks} Reddit engagement task${r.reddit.tasks === 1 ? "" : "s"} (${r.reddit.completed} completed).`);
  if (out.length === 0) out.push("No new activity in this period yet.");
  return out;
}
