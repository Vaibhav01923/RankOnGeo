import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin";
import { isUnpaidPlan } from "@/lib/plan-limits";
import { OFFER_ACTIONS, SETUP_STEPS } from "@/lib/setup-funnel";

type EventType = "domain_submitted" | "trial_checkout_started" | "trial_started" | "trial_converted" | "acquisition_source";
const EVENT_TYPES: EventType[] = ["domain_submitted", "trial_checkout_started", "trial_started", "trial_converted", "acquisition_source"];

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Stats were reset on this date: funnel_events was emptied (earlier rows were
// mostly internal testing), and the Domains table only lists brands created
// since then so it starts from zero too. Older brands are still in the DB.
const STATS_START = "2026-09-28T17:35:00Z";

function dayKey(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = serverClient();
  const since30d = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();

  // Exact row counts for each value of a metadata key, in the order given.
  async function countByMetadata(eventType: string, key: string, values: readonly string[], since: string | undefined): Promise<number[]> {
    const counts = await Promise.all(
      values.map(async (v) => {
        let q = db.from("funnel_events").select("id", { count: "exact", head: true }).eq("event_type", eventType).eq(`metadata->>${key}`, v);
        if (since) q = q.gte("created_at", since);
        const { count, error } = await q;
        if (error) console.error("[admin/stats] funnel count failed", eventType, v, error.message);
        return count ?? 0;
      })
    );
    return counts;
  }

  const [
    allTimeCounts,
    last30dCounts,
    domainRows,
    planRows,
    acquisitionSourceRows,
    seriesRows,
    brandRows,
    userPlanRows,
    sourceByDomainRows,
    stepCountsAllTime,
    stepCounts30d,
    offerCountsAllTime,
    offerCounts30d,
    { data: authUsers },
  ] = await Promise.all([
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
    db.from("brands").select("id, name, domain, user_id, created_at").gte("created_at", STATS_START).order("created_at", { ascending: false }).limit(200),
    db.from("user_plans").select("user_id, plan, dodo_customer_id, dodo_subscription_id, payment_failed_at"),
    db
      .from("funnel_events")
      .select("domain, metadata, created_at")
      .eq("event_type", "acquisition_source")
      .not("domain", "is", null)
      .order("created_at", { ascending: false }),
    // /setup wizard step-reach funnel (see app/api/track/step) — one row per
    // visitor per step, deduped client-side per page load. Counted per step in
    // the database rather than fetched and tallied here: a plain select stops at
    // 1000 rows, which this funnel (8 rows per visitor) passes quickly.
    countByMetadata("setup_step_reached", "stepName", SETUP_STEPS, undefined),
    countByMetadata("setup_step_reached", "stepName", SETUP_STEPS, since30d),
    // What visitors did on the offer step (step 7).
    countByMetadata("setup_offer_action", "action", OFFER_ACTIONS, undefined),
    countByMetadata("setup_offer_action", "action", OFFER_ACTIONS, since30d),
    db.auth.admin.listUsers({ perPage: 1000 }),
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

  // Counted by step NAME, not number: the wizard grew from 5 to 8 steps, so an
  // old row's number no longer means the same step, but "prompts", "reddit" and
  // "trial" still do.
  const stepFunnel = { allTime: stepCountsAllTime, last30d: stepCounts30d };
  const offerActions = { allTime: offerCountsAllTime, last30d: offerCounts30d };

  const emailByUserId = new Map((authUsers?.users ?? []).map((u) => [u.id, u.email ?? null]));
  // Every signup gets a user_plans row defaulting to plan:"starter" even before
  // they've paid anything — only show a plan here for accounts that actually
  // have an active paid subscription, otherwise an abandoned checkout reads as
  // a real "Pro" customer in this table.
  const planByUserId = new Map(
    (userPlanRows.data ?? [])
      .filter((r) => !isUnpaidPlan(r))
      .map((r) => [r.user_id as string, r.plan as string])
  );

  // Rows are already newest-first, so the first source seen per domain is the most recent.
  const sourceByDomain = new Map<string, string>();
  for (const row of sourceByDomainRows.data ?? []) {
    const domain = row.domain as string;
    const source = (row.metadata as { source?: string } | null)?.source;
    if (source && !sourceByDomain.has(domain)) sourceByDomain.set(domain, source);
  }

  const domains = (brandRows.data ?? []).map((b) => ({
    id: b.id as string,
    name: b.name as string,
    domain: b.domain as string,
    email: b.user_id ? emailByUserId.get(b.user_id as string) ?? null : null,
    plan: b.user_id ? planByUserId.get(b.user_id as string) ?? null : null,
    source: sourceByDomain.get(b.domain as string) ?? null,
    createdAt: b.created_at as string,
  }));

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
    stepFunnel,
    offerActions,
    domains,
  });
}
