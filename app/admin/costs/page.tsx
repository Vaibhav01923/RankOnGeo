"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SPEND_SOURCES, SPEND_SOURCE_LABELS, type SpendSource, type SpendSummary } from "@/lib/dataforseo-spend-summary";

type Costs = SpendSummary & {
  account: { balance: number; deposited: number; spentToday: number } | null;
  runwayDays: number | null;
  dailyKeywordCap: number;
  dataForSeoEnabled: boolean;
};

const SOURCE_COLORS: Record<SpendSource, string> = {
  scan_claude: "var(--rust)",
  scan_perplexity: "var(--olive)",
  scan_google: "var(--ink-soft)",
  keywords: "var(--rust-deep)",
};

const usd = (n: number, dp = 2) => `$${n.toFixed(dp)}`;

function KpiTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">{label}</p>
      <p className="mt-2 font-signal-serif text-3xl text-[var(--ink)]">{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--ink-faint)]">{sub}</p>}
    </div>
  );
}

// Daily spend as stacked bars, one colour per source.
function SpendChart({ days }: { days: Costs["days"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...days.map((d) => d.total), 0.01);
  const W = 720, H = 180, padB = 18, barW = W / days.length;
  const hovered = hover !== null ? days[hover] : null;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {days.map((d, i) => {
          let y = H - padB;
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)}>
              <rect x={i * barW} y={0} width={barW} height={H - padB} fill="transparent" />
              {SPEND_SOURCES.map((s) => {
                const h = (d.bySource[s] / max) * (H - padB - 8);
                y -= h;
                return h > 0 ? <rect key={s} x={i * barW + barW * 0.15} y={y} width={barW * 0.7} height={h} fill={SOURCE_COLORS[s]} opacity={hover === i ? 1 : 0.8} /> : null;
              })}
              {i % 5 === 0 && <text x={i * barW + barW / 2} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--ink-faint)">{d.date.slice(5)}</text>}
            </g>
          );
        })}
      </svg>
      {hovered && (
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs shadow-lg" style={{ left: `${Math.min(88, Math.max(12, ((hover! + 0.5) / days.length) * 100))}%` }}>
          <p className="font-semibold text-[var(--ink)]">{hovered.date} · {usd(hovered.total, 3)}</p>
          {SPEND_SOURCES.filter((s) => hovered.bySource[s] > 0).map((s) => (
            <p key={s} className="text-[var(--ink-faint)]">{SPEND_SOURCE_LABELS[s]}: {usd(hovered.bySource[s], 3)}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminCostsPage() {
  const [data, setData] = useState<Costs | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/dataforseo")
      .then(async (r) => {
        if (r.status === 403) throw new Error("Admins only.");
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't load costs");
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  const untracked = data?.account ? Math.max(0, data.account.spentToday - data.today) : 0;

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--rust)]">Admin</p>
          <h1 className="font-signal-serif text-3xl font-[350] tracking-tight text-[var(--ink)]">API costs</h1>
          <p className="mt-1 text-sm text-[var(--ink-faint)]">What DataForSEO is charging, by day and by what caused it.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/admin/stats" className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-faint)] hover:text-[var(--ink)]">Funnel stats →</Link>
          <Link href="/admin/blog" className="rounded-full border border-[var(--line)] px-5 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--ink-faint)] hover:text-[var(--ink)]">Blog studio →</Link>
        </div>
      </header>

      {error && <div className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {!data && !error ? (
        <div className="py-24 text-center text-sm text-[var(--ink-faint)]">Loading…</div>
      ) : data ? (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <KpiTile label="Balance left" value={data.account ? usd(data.account.balance) : "—"} sub={data.account ? `of ${usd(data.account.deposited, 0)} deposited` : "couldn't reach DataForSEO"} />
            <KpiTile label="Spent today" value={data.account ? usd(data.account.spentToday) : usd(data.today)} sub={data.account ? `${usd(data.today)} itemised below` : "itemised"} />
            <KpiTile label="Average per day" value={data.avgDays > 0 ? usd(data.avgDaily7d) : "—"} sub={data.avgDays > 0 ? `over the last ${data.avgDays} tracked day${data.avgDays === 1 ? "" : "s"}` : "no tracked spend yet"} />
            <KpiTile label="Balance lasts about" value={data.runwayDays === null ? "—" : `${data.runwayDays} days`} sub={data.runwayDays === null ? "needs 3 days of tracked spend" : `at the last ${data.avgDays} days' pace`} />
          </div>

          {(!data.dataForSeoEnabled || untracked > 0.005) && (
            <div className="mb-8 space-y-2">
              {!data.dataForSeoEnabled && (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--line-soft)] px-4 py-3 text-xs text-[var(--ink-soft)]">
                  DataForSEO is switched off (<code>DATAFORSEO_ENABLED</code> is not <code>true</code>), so Claude, Perplexity and Google scans and keyword volumes are paused and nothing is being spent.
                </p>
              )}
              {untracked > 0.005 && (
                <p className="rounded-xl border border-[var(--line)] bg-[var(--line-soft)] px-4 py-3 text-xs text-[var(--ink-soft)]">
                  DataForSEO reports {usd(data.account!.spentToday)} spent today but {usd(data.today)} is itemised here. The difference ({usd(untracked)}) is spend that wasn&apos;t logged, such as calls made before tracking was added or from another environment.
                </p>
              )}
            </div>
          )}

          <div className="mb-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">Daily spend, last 30 days</p>
              <p className="text-sm font-semibold text-[var(--ink)]">{usd(data.total)} total</p>
            </div>
            <SpendChart days={data.days} />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
              {SPEND_SOURCES.map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-xs text-[var(--ink-soft)]">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SOURCE_COLORS[s] }} />
                  {SPEND_SOURCE_LABELS[s]}
                </span>
              ))}
            </div>
          </div>

          <div className="mb-8 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)]">Where it goes (last 30 days)</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--ink-faint)]">
                  <th className="pb-2 font-medium">Source</th>
                  <th className="pb-2 text-right font-medium">Calls</th>
                  <th className="pb-2 text-right font-medium">Avg per call</th>
                  <th className="pb-2 text-right font-medium">Total</th>
                  <th className="pb-2 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {SPEND_SOURCES.map((s) => {
                  const row = data.bySource[s];
                  return (
                    <tr key={s} className="border-t border-[var(--line)]">
                      <td className="py-2.5 text-[var(--ink)]">{SPEND_SOURCE_LABELS[s]}</td>
                      <td className="py-2.5 text-right text-[var(--ink-soft)]">{row.calls.toLocaleString()}</td>
                      <td className="py-2.5 text-right text-[var(--ink-soft)]">{row.calls ? usd(row.avgPerCall, 4) : "—"}</td>
                      <td className="py-2.5 text-right font-semibold text-[var(--ink)]">{usd(row.total)}</td>
                      <td className="py-2.5 text-right text-[var(--ink-soft)]">{data.total > 0 ? `${Math.round((row.total / data.total) * 100)}%` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-xs leading-relaxed text-[var(--ink-faint)]">
            {data.trackedSince
              ? `Itemised tracking started ${new Date(data.trackedSince).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}. Earlier spend isn't broken down here; DataForSEO's dashboard under Billing shows the full history.`
              : "Itemised tracking begins with the next paid call. Earlier spend isn't broken down here; DataForSEO's dashboard under Billing shows the full history."}{" "}
            Setup-wizard keyword lookups are capped at {data.dailyKeywordCap} a day (about {usd(data.dailyKeywordCap * 0.09, 2)}); change it with <code>KEYWORD_LOOKUPS_PER_DAY</code>.
          </p>
        </>
      ) : null}
    </div>
  );
}
