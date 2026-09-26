"use client";

import { useEffect, useRef, useState } from "react";
import { AnalyticsSeriesChart } from "./AnalyticsSeriesChart";

type Row = { label: string; clicks: number; impressions: number; ctr: number; position: number };
type Site = { siteUrl: string; permissionLevel: string };
type GscData = {
  configured: boolean;
  connected: boolean;
  reconnect?: boolean;
  error?: string;
  email?: string | null;
  siteUrl?: string | null;
  sites?: Site[];
  range?: { start: string; end: string };
  totals?: { clicks: number; impressions: number; ctr: number; position: number };
  series?: { label: string; count: number }[];
  queries?: Row[];
  pages?: Row[];
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel rounded-xl p-4">
      <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-[var(--ink)] mt-1">{value}</p>
      {sub && <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">{sub}</p>}
    </div>
  );
}

function RowsTable({ title, hint, rows, mono }: { title: string; hint: string; rows: Row[]; mono?: boolean }) {
  return (
    <div className="panel rounded-xl p-5 mb-5 overflow-x-auto">
      <p className="text-sm font-semibold text-[var(--ink)] mb-1">{title}</p>
      <p className="text-xs text-[var(--ink-faint)] mb-3">{hint}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--ink-faint)]">Nothing yet for this period.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[var(--ink-faint)]">
              <th className="py-2 font-medium">{title.includes("queries") ? "Query" : "Page"}</th>
              <th className="py-2 font-medium text-right">Clicks</th>
              <th className="py-2 font-medium text-right">Impressions</th>
              <th className="py-2 font-medium text-right">Position</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-[var(--line)]">
                <td className={`py-2 text-[var(--ink)]/80 truncate max-w-[260px] ${mono ? "font-mono" : ""}`}>{mono ? r.label.replace(/^https?:\/\/[^/]+/, "") || "/" : r.label}</td>
                <td className="py-2 text-right font-semibold text-[var(--ink)]">{r.clicks.toLocaleString()}</td>
                <td className="py-2 text-right text-[var(--ink-soft)]">{r.impressions.toLocaleString()}</td>
                <td className="py-2 text-right text-[var(--ink-soft)]">{r.position.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function SearchConsolePanel({ brandId, days, onTotals }: { brandId: string; domain: string; days: number; onOpenSetup: () => void; onTotals?: (t: { clicks: number; impressions: number } | null) => void }) {
  const [data, setData] = useState<GscData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [pickError, setPickError] = useState("");
  const [choice, setChoice] = useState("");
  // Held in a ref so an inline callback from the parent doesn't re-trigger the fetch.
  const onTotalsRef = useRef(onTotals);
  onTotalsRef.current = onTotals;

  useEffect(() => {
    if (!brandId) return;
    let cancelled = false;
    setLoading(true);
    fetch(`/api/gsc/data?brandId=${brandId}&days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setData(d.error && !("configured" in d) ? { configured: true, connected: false, error: d.error } : d);
        onTotalsRef.current?.(d.totals ? { clicks: d.totals.clicks, impressions: d.totals.impressions } : null);
      })
      .catch(() => { if (!cancelled) { setData({ configured: true, connected: false, error: "Couldn't load Search Console data." }); onTotalsRef.current?.(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [brandId, days, reloadKey]);

  async function saveSite(siteUrl: string) {
    if (!siteUrl || busy) return;
    setBusy(true);
    setPickError("");
    try {
      const res = await fetch("/api/gsc/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, siteUrl }) });
      if (!res.ok) setPickError((await res.json().catch(() => ({}))).error ?? "Couldn't save that property");
      else setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy || !confirm("Disconnect Google Search Console? Your Search analytics will stop appearing here.")) return;
    setBusy(true);
    try {
      await fetch("/api/gsc/disconnect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId }) });
      setReloadKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <div className="flex items-center justify-center py-24"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>;
  }
  if (!data) return null;

  if (!data.configured) {
    return (
      <div className="panel rounded-xl p-6">
        <p className="text-sm font-semibold text-[var(--ink)] mb-1">Google Search Console</p>
        <p className="text-sm text-[var(--ink-soft)]">Search Console connection is being switched on for your account. It will appear here shortly.</p>
      </div>
    );
  }

  const connectHref = `/api/gsc/connect?brandId=${brandId}`;

  if (!data.connected) {
    return (
      <div className="panel rounded-xl p-6">
        <p className="text-base font-semibold text-[var(--ink)] mb-1">See how you show up on Google</p>
        <p className="text-sm text-[var(--ink-soft)] mb-4 max-w-xl">
          Connect Google Search Console to see the searches that bring people to your site, your clicks, impressions and average position — next to your AI visibility, in one place. Read-only: RankOnGeo can never change anything in your Search Console.
        </p>
        {data.error && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{data.error}</p>}
        <a href={connectHref} className="inline-block text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2.5 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">
          Connect Google Search Console
        </a>
        <p className="text-[11px] text-[var(--ink-faint)] mt-3">You need to be an owner or full user of the site in Search Console. Takes about 20 seconds.</p>
      </div>
    );
  }

  if (data.reconnect || (data.error && !data.siteUrl && !data.sites)) {
    return (
      <div className="panel rounded-xl p-6">
        <p className="text-base font-semibold text-[var(--ink)] mb-1">{data.reconnect ? "Search Console needs to be reconnected" : "Search Console is unavailable"}</p>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          {data.reconnect ? "Google access was revoked or expired for this connection." : data.error}
        </p>
        <div className="flex items-center gap-3">
          <a href={connectHref} className="text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2.5 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">Reconnect</a>
          <button onClick={disconnect} disabled={busy} className="text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--ink-soft)] underline disabled:opacity-50">Disconnect</button>
        </div>
      </div>
    );
  }

  const siteOptions = data.sites ?? [];

  if (!data.siteUrl) {
    return (
      <div className="panel rounded-xl p-6">
        <p className="text-base font-semibold text-[var(--ink)] mb-1">Choose your site</p>
        {siteOptions.length === 0 ? (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-4">
              {`${data.email ?? "This Google account"} doesn't have any verified sites in Search Console yet. Add and verify your site there first, then come back — or connect a different Google account.`}
            </p>
            <div className="flex items-center gap-3">
              <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className="text-sm font-semibold bg-[var(--ink)] text-[var(--surface)] px-4 py-2.5 rounded-lg hover:opacity-90 transition-opacity">Open Search Console</a>
              <a href={connectHref} className="text-xs font-semibold text-[var(--rust)] hover:underline">Use a different account</a>
              <button onClick={() => setReloadKey((k) => k + 1)} className="text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--ink-soft)] underline">Check again</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-4">
              We couldn&apos;t automatically match your domain to a property on {data.email ?? "this Google account"}. Pick the one for this site:
            </p>
            {pickError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{pickError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={choice}
                onChange={(e) => setChoice(e.target.value)}
                className="text-sm border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--surface)] text-[var(--ink)] max-w-full"
              >
                <option value="">Select a property…</option>
                {siteOptions.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
              </select>
              <button onClick={() => saveSite(choice)} disabled={!choice || busy} className="text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] disabled:opacity-50 transition-colors">
                Use this property
              </button>
              <button onClick={disconnect} disabled={busy} className="text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--ink-soft)] underline disabled:opacity-50">Disconnect</button>
            </div>
          </>
        )}
      </div>
    );
  }

  const totals = data.totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 };
  const empty = totals.impressions === 0;

  return (
    <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <p className="text-xs text-[var(--ink-faint)]">
          {data.siteUrl} · {data.email}
          {data.range && <> · {data.range.start} to {data.range.end} <span title="Google reports Search data with a delay of about two days.">(2-day delay)</span></>}
        </p>
        <div className="flex items-center gap-3">
          {siteOptions.length > 1 && (
            <select
              value={data.siteUrl}
              onChange={(e) => saveSite(e.target.value)}
              className="text-xs border border-[var(--line)] rounded-lg px-2.5 py-1.5 bg-[var(--surface)] text-[var(--ink)]/80 max-w-[220px]"
            >
              {siteOptions.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
            </select>
          )}
          <button onClick={disconnect} disabled={busy} className="text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--ink-soft)] underline disabled:opacity-50">Disconnect</button>
        </div>
      </div>

      {data.error && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-4">{data.error}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Stat label="Clicks" value={totals.clicks.toLocaleString()} />
        <Stat label="Impressions" value={totals.impressions.toLocaleString()} />
        <Stat label="Click-through rate" value={`${(totals.ctr * 100).toFixed(1)}%`} />
        <Stat label="Avg. position" value={empty ? "—" : totals.position.toFixed(1)} sub="lower is better" />
      </div>

      {empty && !data.error ? (
        <div className="panel rounded-xl p-6 text-center">
          <p className="text-base font-semibold text-[var(--ink)] mb-1">No search data yet</p>
          <p className="text-sm text-[var(--ink-faint)]">Google hasn&apos;t reported any impressions for this property in the period. New sites and new pages take a few days to start showing up.</p>
        </div>
      ) : (
        <>
          {!!data.series?.length && (
            <div className="panel rounded-xl p-5 mb-5">
              <p className="text-sm font-semibold text-[var(--ink)] mb-3">Clicks from Google over time</p>
              <AnalyticsSeriesChart series={data.series} />
            </div>
          )}
          <RowsTable title="Top search queries" hint="What people typed into Google before landing on your site." rows={data.queries ?? []} />
          <RowsTable title="Top pages in search" hint="Your pages that get the most clicks from Google." rows={data.pages ?? []} mono />
        </>
      )}
    </div>
  );
}
