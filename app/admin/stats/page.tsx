"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PRICING } from "@/lib/pricing";

const PLAN_NAME: Record<string, string> = Object.fromEntries(PRICING.map((p) => [p.planKey, p.name]));

type DaySeries = { date: string; domain_submitted: number; trial_started: number; trial_converted: number };

type EventType = "domain_submitted" | "trial_checkout_started" | "trial_started" | "trial_converted" | "acquisition_source";

type FunnelEvent = {
  id: string;
  event_type: EventType;
  domain: string | null;
  email: string | null;
  plan: string | null;
  is_anonymous: boolean | null;
  metadata: { source?: string } | null;
  created_at: string;
};

type Stats = {
  allTime: Record<EventType, number>;
  last30d: Record<EventType, number>;
  distinctDomains: number;
  planCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
  series: DaySeries[];
  rates: { checkoutToStartedPct: number; startedToConvertedPct: number; domainToConvertedPct: number };
  recent: FunnelEvent[];
};

const EVENT_LABEL: Record<EventType, string> = {
  domain_submitted: "Domain submitted",
  trial_checkout_started: "Trial checkout started",
  trial_started: "Trial started",
  trial_converted: "Trial converted",
  acquisition_source: "Told us how they found us",
};

const EVENT_COLOR: Record<EventType, string> = {
  domain_submitted: "text-[var(--ink-soft)] bg-[var(--line-soft)]",
  trial_checkout_started: "text-[var(--rust-deep)] bg-[var(--rust-wash)]",
  trial_started: "text-[var(--olive)] bg-[var(--olive-wash)]",
  trial_converted: "text-[var(--olive)] bg-[var(--olive-wash)]",
  acquisition_source: "text-[var(--ink-soft)] bg-[var(--line-soft)]",
};

function KpiTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">{label}</p>
      <p className="mt-2 font-signal-serif text-3xl text-[var(--ink)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--ink-faint)]">{sub}</p>}
    </div>
  );
}

function MiniBarChart({ label, data, color }: { label: string; data: { date: string; count: number }[]; color: string }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => d.count), 1);
  const W = 300, H = 90, padB = 14;
  const barW = W / data.length;
  const hovered = hoverIdx !== null ? data[hoverIdx] : null;

  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">{label}</p>
        <p className="text-sm font-semibold text-[var(--ink)]">{data.reduce((s, d) => s + d.count, 0).toLocaleString()}</p>
      </div>
      <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
          {data.map((d, i) => {
            const barH = d.count > 0 ? Math.max((d.count / max) * (H - padB), 2) : 0;
            const x = i * barW;
            return (
              <g key={i} onMouseEnter={() => setHoverIdx(i)}>
                <rect x={x} y={0} width={barW} height={H} fill="transparent" />
                <rect x={x + barW * 0.2} y={H - padB - barH} width={Math.max(barW * 0.6, 1)} height={barH} rx="1.5" fill={color} opacity={hoverIdx === i ? 1 : 0.6} />
              </g>
            );
          })}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--cream)] px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${Math.min(90, Math.max(10, ((hoverIdx! + 0.5) / data.length) * 100))}%` }}
          >
            <p className="font-semibold text-[var(--ink)]">{hovered.count.toLocaleString()}</p>
            <p className="whitespace-nowrap text-[var(--ink-faint)]">{new Date(hovered.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminStatsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/check");
      const { isAdmin } = await res.json();
      setIsAdmin(isAdmin);
      if (!isAdmin) return;
      const statsRes = await fetch("/api/admin/stats");
      if (!statsRes.ok) { setError("Failed to load stats"); return; }
      setStats(await statsRes.json());
    })();
  }, []);

  if (isAdmin === null) {
    return <div className="px-6 py-24 text-center text-sm text-[var(--ink-faint)]">Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="px-6 py-24 text-center">
        <p className="font-signal-serif text-2xl text-[var(--ink)]">Not authorized</p>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          This area is for RankOnGeo admins. <Link href="/" className="text-[var(--rust)] underline">Back home</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--rust)]">Admin</p>
          <h1 className="font-signal-serif text-3xl font-[350] tracking-tight text-[var(--ink)]">Funnel stats</h1>
        </div>
        <Link
          href="/admin/blog"
          className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-faint)] hover:text-[var(--ink)]"
        >
          Blog studio →
        </Link>
      </header>

      {error && (
        <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {!stats ? (
        <div className="py-24 text-center text-sm text-[var(--ink-faint)]">Loading…</div>
      ) : (
        <>
          {/* KPI tiles */}
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile label="Domains submitted" value={stats.allTime.domain_submitted.toLocaleString()} sub={`${stats.last30d.domain_submitted.toLocaleString()} last 30d · ${stats.distinctDomains.toLocaleString()} distinct`} />
            <KpiTile label="Trial checkouts started" value={stats.allTime.trial_checkout_started.toLocaleString()} sub={`${stats.last30d.trial_checkout_started.toLocaleString()} last 30d`} />
            <KpiTile label="Trials started" value={stats.allTime.trial_started.toLocaleString()} sub={`${stats.rates.checkoutToStartedPct}% of checkouts`} />
            <KpiTile label="Trials converted" value={stats.allTime.trial_converted.toLocaleString()} sub={`${stats.rates.startedToConvertedPct}% of trials`} />
          </div>

          {/* Charts */}
          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <MiniBarChart label="Domains submitted (30d)" color="var(--ink-soft)" data={stats.series.map((s) => ({ date: s.date, count: s.domain_submitted }))} />
            <MiniBarChart label="Trials started (30d)" color="var(--rust)" data={stats.series.map((s) => ({ date: s.date, count: s.trial_started }))} />
            <MiniBarChart label="Trials converted (30d)" color="var(--olive)" data={stats.series.map((s) => ({ date: s.date, count: s.trial_converted }))} />
          </div>

          <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {/* Plan distribution */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 md:col-span-1">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">Trial plan mix</p>
              {Object.keys(stats.planCounts).length === 0 ? (
                <p className="text-sm text-[var(--ink-faint)]">No trials started yet.</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(stats.planCounts)
                    .sort(([, a], [, b]) => b - a)
                    .map(([plan, count]) => {
                      const total = Object.values(stats.planCounts).reduce((s, c) => s + c, 0);
                      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                      return (
                        <div key={plan}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-medium text-[var(--ink)]">{PLAN_NAME[plan] ?? plan}</span>
                            <span className="text-[var(--ink-faint)]">{count} · {pct}%</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-[var(--line-soft)]">
                            <div className="h-1.5 rounded-full bg-[var(--rust)]" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Overall funnel */}
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 md:col-span-2">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">Overall funnel</p>
              <div className="flex items-center gap-2 overflow-x-auto text-sm">
                {([
                  ["Domains", stats.allTime.domain_submitted],
                  ["Checkouts", stats.allTime.trial_checkout_started],
                  ["Trials", stats.allTime.trial_started],
                  ["Converted", stats.allTime.trial_converted],
                ] as const).map(([label, value], i, arr) => (
                  <div key={label} className="flex items-center gap-2">
                    <div className="rounded-xl border border-[var(--line)] bg-[var(--cream)] px-4 py-3 text-center">
                      <p className="font-signal-serif text-xl text-[var(--ink)]">{value.toLocaleString()}</p>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--ink-faint)]">{label}</p>
                    </div>
                    {i < arr.length - 1 && <span className="text-[var(--ink-faint)]">→</span>}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--ink-faint)]">
                {stats.rates.domainToConvertedPct}% of domain submissions eventually convert to a paying trial.
              </p>
            </div>
          </div>

          {/* Acquisition source */}
          <div className="mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">Where people found us</p>
              <p className="text-xs text-[var(--ink-faint)]">{stats.allTime.acquisition_source.toLocaleString()} answered</p>
            </div>
            {Object.keys(stats.sourceCounts).length === 0 ? (
              <p className="text-sm text-[var(--ink-faint)]">No answers yet — asked while a landing-page visitor&apos;s site is analyzing.</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {Object.entries(stats.sourceCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([source, count]) => {
                    const total = Object.values(stats.sourceCounts).reduce((s, c) => s + c, 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={source}>
                        <div className="mb-1 flex items-center justify-between text-xs">
                          <span className="font-medium text-[var(--ink)] truncate pr-2">{source}</span>
                          <span className="shrink-0 text-[var(--ink-faint)]">{count} · {pct}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-[var(--line-soft)]">
                          <div className="h-1.5 rounded-full bg-[var(--olive)]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Recent activity */}
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">Recent activity</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--ink-faint)]">
                    <th className="pb-2 pr-4 font-medium">Event</th>
                    <th className="pb-2 pr-4 font-medium">Domain / Email</th>
                    <th className="pb-2 pr-4 font-medium">Plan</th>
                    <th className="pb-2 font-medium">When</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((e) => (
                    <tr key={e.id} className="border-b border-[var(--line)]/60 last:border-0">
                      <td className="py-2 pr-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${EVENT_COLOR[e.event_type]}`}>{EVENT_LABEL[e.event_type]}</span>
                      </td>
                      <td className="py-2 pr-4 text-[var(--ink-soft)]">
                        {e.event_type === "acquisition_source" ? e.metadata?.source ?? "—" : e.domain ?? e.email ?? "—"}
                      </td>
                      <td className="py-2 pr-4 text-[var(--ink-soft)]">{e.plan ? PLAN_NAME[e.plan] ?? e.plan : "—"}</td>
                      <td className="py-2 text-[var(--ink-faint)]">{new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                    </tr>
                  ))}
                  {stats.recent.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-[var(--ink-faint)]">No activity yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
