"use client";

import { GOOGLE_DELAY_NOTE, type GscData, type GscRow } from "./useSearchConsole";

// Widgets that put Google Search Console numbers next to the site's own
// analytics instead of in a separate section.

const num = (n: number) => n.toLocaleString();
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export function DelayTag() {
  return <span className="text-[10px] font-medium text-[var(--ink-faint)] whitespace-nowrap">Google · {GOOGLE_DELAY_NOTE}</span>;
}

export function SearchStatsRow({ totals }: { totals: NonNullable<GscData["totals"]> }) {
  const cards = [
    { label: "Google clicks", value: num(totals.clicks) },
    { label: "Impressions", value: num(totals.impressions) },
    { label: "Click-through rate", value: pct(totals.ctr) },
    { label: "Avg. position", value: totals.impressions ? totals.position.toFixed(1) : "—" },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
      {cards.map((c) => (
        <div key={c.label} className="panel rounded-xl p-4">
          <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-wide">{c.label}</p>
          <p className="text-2xl font-semibold text-[var(--ink)] mt-1">{c.value}</p>
          <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">{GOOGLE_DELAY_NOTE}</p>
        </div>
      ))}
    </div>
  );
}

export function SearchQueriesCard({ rows }: { rows: GscRow[] }) {
  return (
    <div className="panel rounded-xl p-5 mb-5 overflow-x-auto">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-sm font-semibold text-[var(--ink)]">Top search queries</p>
        <DelayTag />
      </div>
      <p className="text-xs text-[var(--ink-faint)] mb-3">What people typed into Google before landing on your site.</p>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--ink-faint)]">Nothing yet for this period.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--ink-faint)]">
              <th className="py-2 font-medium">Query</th>
              <th className="py-2 font-medium text-right">Clicks</th>
              <th className="py-2 font-medium text-right">Impressions</th>
              <th className="py-2 font-medium text-right">Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-[var(--line)]">
                <td className="py-2 text-[var(--ink)]/80 truncate max-w-[260px]">{r.label}</td>
                <td className="py-2 text-right font-semibold text-[var(--ink)]">{num(r.clicks)}</td>
                <td className="py-2 text-right text-[var(--ink-soft)]">{num(r.impressions)}</td>
                <td className="py-2 text-right text-[var(--ink-soft)]">{r.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type OwnPage = { path: string; pageviews: number; bounceRate: number; avgDurationSeconds: number };

function pathOf(url: string): string {
  try {
    const p = new URL(url).pathname;
    return p.length > 1 ? p.replace(/\/$/, "") : p;
  } catch {
    return url;
  }
}

// One row per page, with the site's own numbers and Google's side by side.
// Either side can be missing: `ours` is null for accounts without site
// analytics, `google` is null until Search Console is connected.
export function PagesTable({ ours, google }: { ours: OwnPage[] | null; google: GscRow[] | null }) {
  const rows = new Map<string, { path: string; own?: OwnPage; g?: GscRow }>();
  for (const p of ours ?? []) rows.set(pathOf(p.path), { path: pathOf(p.path), own: p });
  for (const g of google ?? []) {
    const path = pathOf(g.label);
    const existing = rows.get(path);
    if (existing) existing.g = g;
    else rows.set(path, { path, g });
  }
  const merged = [...rows.values()]
    .sort((a, b) => (b.own?.pageviews ?? 0) - (a.own?.pageviews ?? 0) || (b.g?.clicks ?? 0) - (a.g?.clicks ?? 0))
    .slice(0, 12);
  if (merged.length === 0) return null;

  const showOwn = ours !== null;
  const showGoogle = google !== null;

  return (
    <div className="panel rounded-xl p-5 mb-5 overflow-x-auto">
      <p className="text-sm font-semibold text-[var(--ink)] mb-1">Pages</p>
      <p className="text-xs text-[var(--ink-faint)] mb-3">
        {showOwn && showGoogle
          ? "Your pageviews next to how each page does in Google. Bounce rate is for sessions that started on the page."
          : showGoogle
            ? "Your pages that get the most clicks from Google."
            : "Your most-visited pages. Bounce rate is for sessions that started on the page."}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[var(--ink-faint)]">
            <th className="py-2 font-medium">Page</th>
            {showOwn && <th className="py-2 font-medium text-right">Pageviews</th>}
            {showOwn && <th className="py-2 font-medium text-right">Bounce</th>}
            {showGoogle && <th className="py-2 font-medium text-right">Google clicks<br /><span className="font-normal text-[10px]">{GOOGLE_DELAY_NOTE}</span></th>}
            {showGoogle && <th className="py-2 font-medium text-right">Impressions<br /><span className="font-normal text-[10px]">{GOOGLE_DELAY_NOTE}</span></th>}
            {showGoogle && <th className="py-2 font-medium text-right">Position<br /><span className="font-normal text-[10px]">{GOOGLE_DELAY_NOTE}</span></th>}
          </tr>
        </thead>
        <tbody>
          {merged.map((r) => (
            <tr key={r.path} className="border-t border-[var(--line)]">
              <td className="py-2 font-mono text-[var(--ink)]/80 truncate max-w-[220px]">{r.path}</td>
              {showOwn && <td className="py-2 text-right font-semibold text-[var(--ink)]">{r.own ? num(r.own.pageviews) : "—"}</td>}
              {showOwn && <td className="py-2 text-right text-[var(--ink-soft)]">{r.own ? `${r.own.bounceRate}%` : "—"}</td>}
              {showGoogle && <td className="py-2 text-right font-semibold text-[var(--ink)]">{r.g ? num(r.g.clicks) : "—"}</td>}
              {showGoogle && <td className="py-2 text-right text-[var(--ink-soft)]">{r.g ? num(r.g.impressions) : "—"}</td>}
              {showGoogle && <td className="py-2 text-right text-[var(--ink-soft)]">{r.g ? r.g.position.toFixed(1) : "—"}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
