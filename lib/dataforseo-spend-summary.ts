// Turns raw spend rows into what the admin Costs page shows. Pure, so it can be
// tested without a database.

export const SPEND_SOURCES = ["scan_claude", "scan_perplexity", "scan_google", "keywords"] as const;
export type SpendSource = (typeof SPEND_SOURCES)[number];

export const SPEND_SOURCE_LABELS: Record<SpendSource, string> = {
  scan_claude: "Claude scans",
  scan_perplexity: "Perplexity scans",
  scan_google: "Google AI Overview scans",
  keywords: "Keyword research (setup)",
};

export type SpendRow = { created_at: string; source: string; cost: number | string };

export type SpendSummary = {
  days: { date: string; total: number; bySource: Record<SpendSource, number> }[];
  bySource: Record<SpendSource, { total: number; calls: number; avgPerCall: number }>;
  total: number;
  today: number;
  // Average spend per day over the last 7 days, but only counting days that
  // tracking existed for — so a brand-new log isn't averaged against empty
  // history. `avgDays` is how many days that average covers (1 to 7).
  avgDaily7d: number;
  avgDays: number;
  trackedSince: string | null;
};

const emptyBySource = (): Record<SpendSource, number> => ({ scan_claude: 0, scan_perplexity: 0, scan_google: 0, keywords: 0 });
const isSource = (s: string): s is SpendSource => (SPEND_SOURCES as readonly string[]).includes(s);
const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

// `days` is a continuous run ending today (UTC), oldest first, zero-filled, so
// the chart doesn't skip quiet days. The average divides by calendar days since
// tracking began (up to 7), not days-with-spend — an honest burn rate.
export function summarizeSpend(rows: SpendRow[], windowDays = 30, now = Date.now()): SpendSummary {
  const DAY = 24 * 60 * 60 * 1000;
  const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const days = Array.from({ length: windowDays }, (_, i) => ({ date: dayKey(now - (windowDays - 1 - i) * DAY), total: 0, bySource: emptyBySource() }));
  const byDate = new Map(days.map((d) => [d.date, d]));
  const bySource = Object.fromEntries(SPEND_SOURCES.map((s) => [s, { total: 0, calls: 0, avgPerCall: 0 }])) as SpendSummary["bySource"];

  let trackedSince: string | null = null;
  for (const r of rows) {
    const cost = Number(r.cost);
    if (!Number.isFinite(cost) || !isSource(r.source)) continue;
    if (!trackedSince || r.created_at < trackedSince) trackedSince = r.created_at;
    const day = byDate.get(r.created_at.slice(0, 10));
    if (!day) continue;
    day.total += cost;
    day.bySource[r.source] += cost;
    bySource[r.source].total += cost;
    bySource[r.source].calls += 1;
  }
  for (const s of SPEND_SOURCES) bySource[s].avgPerCall = bySource[s].calls ? bySource[s].total / bySource[s].calls : 0;

  const trackedDays = trackedSince ? Math.max(1, Math.round((Date.parse(dayKey(now)) - Date.parse(trackedSince.slice(0, 10))) / DAY) + 1) : 0;
  const avgDays = Math.min(7, trackedDays);
  const lastN = avgDays > 0 ? days.slice(-avgDays) : [];
  return {
    days: days.map((d) => ({ date: d.date, total: round(d.total), bySource: Object.fromEntries(SPEND_SOURCES.map((s) => [s, round(d.bySource[s])])) as Record<SpendSource, number> })),
    bySource: Object.fromEntries(SPEND_SOURCES.map((s) => [s, { total: round(bySource[s].total), calls: bySource[s].calls, avgPerCall: round(bySource[s].avgPerCall, 5) }])) as SpendSummary["bySource"],
    total: round(days.reduce((s, d) => s + d.total, 0)),
    today: round(days[days.length - 1]?.total ?? 0),
    avgDaily7d: avgDays > 0 ? round(lastN.reduce((s, d) => s + d.total, 0) / avgDays) : 0,
    avgDays,
    trackedSince,
  };
}
