"use client";

import type { ArticlePerformance } from "./useArticlePerformance";

const num = (n: number) => n.toLocaleString();

// The Analytics page's proof that the content RankOnGeo publishes earns visitors:
// views and visitors on those articles, and how many came from AI answers.
// Deliberately loud, because it is the number that shows the product working.
export function RankOnGeoTraffic({
  perf,
  onOpenArticles,
  onOpenKeywords,
  onConnectTracking,
}: {
  perf: ArticlePerformance | null;
  onOpenArticles: () => void;
  onOpenKeywords: () => void;
  onConnectTracking: () => void;
}) {
  if (!perf) return null;

  // Nothing published yet: point at how to get some.
  if (perf.totals.articles === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rust)]/35 bg-[var(--rust-wash)] px-5 py-4 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Traffic from RankOnGeo articles will appear here</p>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">Publish articles, or let auto-publishing write them, and you will see the visitors they bring in.</p>
        </div>
        <button onClick={onOpenKeywords} className="text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors whitespace-nowrap">See keywords →</button>
      </div>
    );
  }

  const top = perf.articles.filter((a) => a.views > 0).slice(0, 3);
  const cards = [
    { label: "Views", value: perf.totals.views },
    { label: "Visitors", value: perf.totals.visitors },
    { label: "From AI answers", value: perf.totals.aiVisits },
  ];

  return (
    <div className="rounded-xl border-2 border-[var(--rust)]/40 bg-[var(--rust-wash)] px-5 py-5 mb-5">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-semibold text-[var(--rust-deep)] uppercase tracking-widest">From RankOnGeo</p>
          <p className="text-base font-semibold text-[var(--ink)] mt-0.5">Traffic from the articles we published for you</p>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">{perf.totals.articles} article{perf.totals.articles === 1 ? "" : "s"} live · last {perf.days} days</p>
        </div>
        <button onClick={onOpenArticles} className="text-xs font-semibold text-[var(--rust-deep)] hover:underline whitespace-nowrap">All articles →</button>
      </div>

      {!perf.trackingConnected || perf.totals.tracked === 0 ? (
        <p className="text-xs text-[var(--ink-soft)]">
          {!perf.trackingConnected ? "Connect website tracking to count the visitors these articles bring in. " : "Add each article's live link on the Articles tab to count its visitors. "}
          <button onClick={!perf.trackingConnected ? onConnectTracking : onOpenArticles} className="font-semibold text-[var(--rust-deep)] underline">{!perf.trackingConnected ? "Connect tracking" : "Open Articles"}</button>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {cards.map((c) => (
              <div key={c.label} className="rounded-lg bg-[var(--surface)] border border-[var(--line)] px-4 py-3">
                <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-wide">{c.label}</p>
                <p className="text-2xl font-semibold text-[var(--ink)] mt-0.5">{num(c.value)}</p>
              </div>
            ))}
          </div>
          {top.length > 0 && (
            <div className="mt-4 space-y-1.5">
              <p className="text-[11px] font-semibold text-[var(--ink-soft)]">Top articles</p>
              {top.map((a) => (
                <div key={a.id} className="flex items-center justify-between gap-3 text-xs">
                  <span className="truncate text-[var(--ink)]/85">{a.title}</span>
                  <span className="shrink-0 font-semibold text-[var(--ink)]">{num(a.views)} views{a.aiVisits > 0 && <span className="font-normal text-[var(--olive)]"> · {num(a.aiVisits)} from AI</span>}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
