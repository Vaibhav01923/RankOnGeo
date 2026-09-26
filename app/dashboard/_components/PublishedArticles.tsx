"use client";

import { useState } from "react";
import type { ArticlePerf, ArticlePerformance } from "./useArticlePerformance";

const num = (n: number) => n.toLocaleString();

function pathLabel(url: string | null): string {
  if (!url) return "";
  try { return new URL(url).pathname; } catch { return url; }
}

// A published article with no live address on record can't have its views
// counted, so let the customer paste it in.
function AddUrl({ onSave }: { onSave: (url: string) => Promise<string | null> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    if (!value.trim() || busy) return;
    setBusy(true);
    setError("");
    const err = await onSave(value.trim());
    if (err) setError(err);
    setBusy(false);
  }
  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-1.5">
        <input
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); save(); } }}
          placeholder="Paste the live link to count views"
          className="w-56 border border-[var(--line)] bg-[var(--surface)] rounded-md px-2 py-1 text-[11px] outline-none focus:ring-1 focus:ring-[var(--rust)]/40"
        />
        <button onClick={save} disabled={busy || !value.trim()} className="text-[11px] font-semibold text-[var(--rust)] disabled:opacity-40">{busy ? "…" : "Save"}</button>
      </div>
      {error && <p className="text-[10px] text-red-700 mt-1">{error}</p>}
    </div>
  );
}

// The articles RankOnGeo has published to the customer's site, with what each
// one is earning: views, visitors, and visits that came from AI answers.
export function PublishedArticles({
  perf,
  loading,
  selectedId,
  onSelect,
  onAddUrl,
  onConnectTracking,
}: {
  perf: ArticlePerformance | null;
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddUrl: (articleId: string, url: string) => Promise<string | null>;
  onConnectTracking: () => void;
}) {
  if (!perf) {
    return loading ? <div className="h-32 rounded-xl bg-[var(--line-soft)] animate-pulse mb-5" /> : null;
  }
  if (perf.articles.length === 0) return null;

  const showViews = perf.trackingConnected;
  return (
    <div className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-[var(--ink)]">Published on your website</p>
        <p className="text-xs text-[var(--ink-faint)]">Views over the last {perf.days} days</p>
      </div>

      {!showViews && (
        <div className="rounded-xl border border-[var(--line)] bg-[var(--line-soft)] px-4 py-3 mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--ink-soft)]">Connect website tracking to see how many people read each article.</p>
          <button onClick={onConnectTracking} className="text-xs font-semibold text-[var(--rust)] hover:underline whitespace-nowrap">Connect tracking →</button>
        </div>
      )}

      <div className="panel rounded-xl overflow-x-auto">
        <table className="w-full min-w-[620px]">
          <thead>
            <tr className="border-b border-[var(--line)]">
              <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Article</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Views</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Visitors</th>
              <th className="px-3 py-3 text-right text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">From AI answers</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {perf.articles.map((a: ArticlePerf) => (
              <tr key={a.id} onClick={() => onSelect(a.id)} className={`border-b border-[var(--line)] last:border-b-0 cursor-pointer hover:bg-[var(--line-soft)] ${selectedId === a.id ? "bg-[var(--line-soft)]" : ""}`}>
                <td className="px-5 py-3">
                  <p className="text-sm font-medium text-[var(--ink)]/90 line-clamp-1">{a.title}</p>
                  <p className="text-[10px] text-[var(--ink-faint)] mt-0.5 font-mono truncate">
                    {a.keyword || pathLabel(a.url)}
                    {a.publishedAt && <> · {new Date(a.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</>}
                  </p>
                </td>
                {a.url ? (
                  <>
                    <td className="px-3 py-3 text-right text-sm font-semibold text-[var(--ink)]">{showViews ? num(a.views) : "—"}</td>
                    <td className="px-3 py-3 text-right text-sm text-[var(--ink-soft)]">{showViews ? num(a.visitors) : "—"}</td>
                    <td className="px-3 py-3 text-right text-sm text-[var(--ink-soft)]" title={a.aiEngines.map((e) => `${e.label}: ${e.count}`).join(", ")}>
                      {showViews ? (a.aiVisits > 0 ? <span className="font-semibold text-[var(--olive)]">{num(a.aiVisits)}</span> : "0") : "—"}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <a href={a.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-[var(--rust)] hover:underline">View ↗</a>
                    </td>
                  </>
                ) : (
                  <td colSpan={4} className="px-5 py-3 text-right">
                    <div className="flex justify-end"><AddUrl onSave={(url) => onAddUrl(a.id, url)} /></div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
