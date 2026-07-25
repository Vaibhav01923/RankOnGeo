import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";

type EventType = "domain_submitted" | "trial_checkout_started" | "trial_started" | "trial_converted" | "acquisition_source";
const EVENT_TYPES: EventType[] = ["domain_submitted", "trial_checkout_started", "trial_started", "trial_converted", "acquisition_source"];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function dayKey(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = serverClient();
  const since30d = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  const [allTimeCounts, last30dCounts, domainRows, planRows, acquisitionSourceRows, seriesRows, recent] = await Promise.all([
    Promise.all(
      EVENT_TYPES.map((t) =>
        db.from("funnel_events").select("id", { count: "exact", head: true }).eq("event_type", t)
      )
    ),
    Promise.all(
      EVENT_TYPES.map((t) =>
        db.from("funnel_events").select("id", { count: "exact", head: true }).eq("event_type", t).gte("created_at", since30d)
      )
    ),
    db.from("funnel_events").select("domain").eq("event_type", "domain_submitted").not("domain", "is", null),
    db.from("funnel_events").select("plan").eq("event_type", "trial_started").not("plan", "is", null),
    db.from("funnel_events").select("metadata").eq("event_type", "acquisition_source"),
    db
      .from("funnel_events")
      .select("event_type, created_at")
      .in("event_type", ["domain_submitted", "trial_started", "trial_converted"])
      .gte("created_at", since30d),
    db.from("funnel_events").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  const allTime = Object.fromEntries(EVENT_TYPES.map((t, i) => [t, allTimeCounts[i].count ?? 0])) as Record<EventType, number>;
  const last30d = Object.fromEntries(EVENT_TYPES.map((t, i) => [t, last30dCounts[i].count ?? 0])) as Record<EventType, number>;

  const distinctDomains = new Set((domainRows.data ?? []).map((r) => r.domain as string)).size;

  const planCounts: Record<string, number> = {};
  for (const row of planRows.data ?? []) {
    const plan = row.plan as string;
    planCounts[plan] = (planCounts[plan] ?? 0) + 1;
  }

  const sourceCounts: Record<string, number> = {};
  for (const row of acquisitionSourceRows.data ?? []) {
    const source = (row.metadata as { source?: string } | null)?.source;
    if (!source) continue;
    sourceCounts[source] = (sourceCounts[source] ?? 0) + 1;
  }

  // Bucket into a fixed 30-day range (today inclusive) so the chart always
  // shows a continuous 30-column x-axis, not just days that happen to have data.
  const buckets = new Map<string, { domain_submitted: number; trial_started: number; trial_converted: number }>();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    buckets.set(d.toISOString().slice(0, 10), { domain_submitted: 0, trial_started: 0, trial_converted: 0 });
  }
  for (const row of seriesRows.data ?? []) {
    const key = dayKey(row.created_at as string);
    const bucket = buckets.get(key);
    if (bucket) bucket[row.event_type as "domain_submitted" | "trial_started" | "trial_converted"]++;
  }
  const series = Array.from(buckets.entries()).map(([date, counts]) => ({ date, ...counts }));

  const rate = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0);

  return NextResponse.json({
    allTime,
    last30d,
    distinctDomains,
    planCounts,
    sourceCounts,
    series,
    rates: {
      checkoutToStartedPct: rate(allTime.trial_started, allTime.trial_checkout_started),
      startedToConvertedPct: rate(allTime.trial_converted, allTime.trial_started),
      domainToConvertedPct: rate(allTime.trial_converted, allTime.domain_submitted),
    },
    recent: recent.data ?? [],
  });
}
