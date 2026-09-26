"use client";

import { useState } from "react";
import { GOOGLE_DELAY_NOTE, type SearchConsole } from "./useSearchConsole";

// The one place Search Console setup shows up on the Analytics page: a slim bar
// above the numbers. Once connected it collapses to a single status line; the
// data itself is merged into the charts and tables below.
export function SearchConsoleBanner({ gsc, brandId }: { gsc: SearchConsole; brandId: string }) {
  const { data, loading, busy, actionError, reload, saveSite, disconnect } = gsc;
  const [choice, setChoice] = useState("");

  if (!data) return loading ? <div className="h-11 rounded-xl bg-[var(--line-soft)] animate-pulse mb-5" /> : null;
  if (!data.configured) return null;

  const connectHref = `/api/gsc/connect?brandId=${brandId}`;
  const card = "panel rounded-xl px-4 py-3 mb-5";
  const primary = "text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-3.5 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors whitespace-nowrap";
  const link = "text-xs font-semibold text-[var(--rust)] hover:underline whitespace-nowrap";
  const quiet = "text-xs font-semibold text-[var(--ink-faint)] hover:text-[var(--ink-soft)] underline disabled:opacity-50 whitespace-nowrap";
  const sites = data.sites ?? [];

  if (!data.connected) {
    return (
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">Add your Google Search data</p>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">
            Connect Google Search Console to see search clicks, impressions, top queries and rankings right in the charts and pages below. Read-only, and Google reports it with a {GOOGLE_DELAY_NOTE}.
          </p>
          {data.error && <p className="text-xs text-red-700 mt-1">{data.error}</p>}
        </div>
        <a href={connectHref} className={primary}>Connect Google Search Console</a>
      </div>
    );
  }

  if (data.reconnect || (data.error && !data.siteUrl && !data.sites?.length && !data.siteListError)) {
    return (
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">{data.reconnect ? "Search Console needs to be reconnected" : "Search Console is unavailable"}</p>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">{data.reconnect ? "Google access was revoked or expired." : data.error}</p>
        </div>
        <div className="flex items-center gap-3">
          <a href={connectHref} className={primary}>Reconnect</a>
          <button onClick={disconnect} disabled={busy} className={quiet}>Disconnect</button>
        </div>
      </div>
    );
  }

  if (data.siteListError && !data.siteUrl) {
    return (
      <div className={`${card} flex flex-wrap items-center justify-between gap-3`}>
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Couldn&apos;t read your Search Console properties</p>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">
            {data.siteListError === "api_disabled"
              ? "The Search Console API isn't switched on for RankOnGeo's Google project yet, so Google refused the request. This is a setup issue on our side, not your account."
              : data.siteListError === "forbidden"
                ? "Google refused access for this account. Reconnect and keep the Search Console box ticked."
                : "Google didn't respond properly. Please try again in a moment."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={reload} className={primary}>Try again</button>
          <a href={connectHref} className={link}>Reconnect</a>
          <button onClick={disconnect} disabled={busy} className={quiet}>Disconnect</button>
        </div>
      </div>
    );
  }

  if (!data.siteUrl) {
    return (
      <div className={card}>
        <p className="text-sm font-semibold text-[var(--ink)]">Choose your site</p>
        {sites.length === 0 ? (
          <>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5 mb-3">
              {`${data.email ?? "This Google account"} doesn't have any verified sites in Search Console yet. Add and verify your site there first, then come back, or connect a different Google account.`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="https://search.google.com/search-console" target="_blank" rel="noopener noreferrer" className={primary}>Open Search Console</a>
              <a href={connectHref} className={link}>Use a different account</a>
              <button onClick={reload} className={quiet}>Check again</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-[var(--ink-soft)] mt-0.5 mb-3">We couldn&apos;t automatically match your domain to a property on {data.email ?? "this Google account"}. Pick the one for this site:</p>
            {actionError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{actionError}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <select value={choice} onChange={(e) => setChoice(e.target.value)} className="text-xs border border-[var(--line)] rounded-lg px-2.5 py-2 bg-[var(--surface)] text-[var(--ink)] max-w-full">
                <option value="">Select a property…</option>
                {sites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
              </select>
              <button onClick={() => saveSite(choice)} disabled={!choice || busy} className={`${primary} disabled:opacity-50`}>Use this property</button>
              <button onClick={disconnect} disabled={busy} className={quiet}>Disconnect</button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Connected with a property: one quiet status line.
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-[var(--ink-faint)] mb-4 px-1">
      <span className="min-w-0 truncate">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-[var(--olive)] mr-1.5 align-middle" />
        Google Search Console · {data.siteUrl.replace(/^sc-domain:/, "")}
        {data.range && <> · {data.range.start} to {data.range.end} ({GOOGLE_DELAY_NOTE})</>}
      </span>
      <span className="flex items-center gap-3">
        {sites.length > 1 && (
          <select value={data.siteUrl} onChange={(e) => saveSite(e.target.value)} className="text-xs border border-[var(--line)] rounded-md px-2 py-1 bg-[var(--surface)] text-[var(--ink)]/80 max-w-[200px]">
            {sites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
          </select>
        )}
        <button onClick={disconnect} disabled={busy} className={quiet}>Disconnect</button>
      </span>
      {(data.error || actionError) && <span className="w-full text-red-700">{data.error ?? actionError}</span>}
    </div>
  );
}
