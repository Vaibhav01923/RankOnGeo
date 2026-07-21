const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Buckets event timestamps into a fixed-length series for the Web/LLM
// Analytics trend charts — hourly buckets for the 1-day range (a daily
// bucket would only ever produce one point), daily buckets otherwise.
// Always returns a full run of buckets oldest-first, zero-filled where
// nothing happened, so the chart's x-axis doesn't skip around.
export function buildEventSeries(timestamps: string[], days: number): { label: string; count: number }[] {
  const now = Date.now();

  if (days === 1) {
    const buckets = new Map<number, number>();
    for (const t of timestamps) {
      const hoursAgo = Math.floor((now - new Date(t).getTime()) / HOUR_MS);
      buckets.set(hoursAgo, (buckets.get(hoursAgo) ?? 0) + 1);
    }
    return Array.from({ length: 24 }, (_, i) => {
      const hoursAgo = 23 - i;
      const d = new Date(now - hoursAgo * HOUR_MS);
      return { label: d.toLocaleTimeString("en-US", { hour: "numeric" }), count: buckets.get(hoursAgo) ?? 0 };
    });
  }

  const buckets = new Map<string, number>();
  for (const t of timestamps) {
    buckets.set(t.slice(0, 10), (buckets.get(t.slice(0, 10)) ?? 0) + 1);
  }
  return Array.from({ length: days }, (_, i) => {
    const daysAgo = days - 1 - i;
    const d = new Date(now - daysAgo * DAY_MS);
    const key = d.toISOString().slice(0, 10);
    return { label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), count: buckets.get(key) ?? 0 };
  });
}
