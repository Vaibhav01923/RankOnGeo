"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AutopublishBar } from "./AutopublishBar";

type Row = {
  keyword: string;
  volume: number | null;
  source: string;
  status: "published" | "draft" | "queued" | "none";
  article: { id: string; title: string; url: string | null; status: string } | null;
  // When auto-publishing is on: the estimated time this keyword's article goes out.
  scheduledAt?: string | null;
  queueIndex?: number | null;
};
type Data = {
  keywords: Row[];
  hasResearch: boolean;
  volumeAvailable: boolean;
  researchedAt: string | null;
  canRefresh: boolean;
  autopilot?: { enabled: boolean; postsPerWeek: number; publishMode: "publish" | "draft"; nextPostAt: string | null };
  summary: { total: number; published: number; inProgress: number };
};

const STATUS: Record<Row["status"], { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-[var(--olive)]/15 text-[var(--olive)]" },
  draft: { label: "Draft ready", cls: "bg-[var(--rust-wash)] text-[var(--rust-deep)]" },
  queued: { label: "Up next", cls: "bg-[var(--line-soft)] text-[var(--ink-soft)]" },
  none: { label: "No article yet", cls: "bg-[var(--line-soft)] text-[var(--ink-faint)]" },
};

// "2d 4h 15m", "4h 15m", "12m". A time that has already passed means the next
// wake-up is picking it up right now.
function countdown(target: string, now: number): string {
  const totalMin = Math.floor((Date.parse(target) - now) / 60000);
  if (totalMin < 1) return "any moment now";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return `in ${d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`}`;
}

const clock = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

function volumeLabel(v: number | null, available: boolean): string {
  if (v === null) return available ? "low volume" : "—";
  return v.toLocaleString();
}

// Every keyword worth ranking for, how many people search it a month, and whether
// there is an article aiming at it. The auto-publishing switch sits on top because
// this is the list Autopilot writes for.
export function KeywordsTab({
  brandId,
  isFreeTier,
  onUpgrade,
  onSetupPublishing,
  onWriteArticle,
  onOpenArticle,
  lockedView,
}: {
  brandId: string;
  isFreeTier: boolean;
  onUpgrade: () => void;
  onSetupPublishing: () => void;
  onWriteArticle: (keyword: string) => void;
  onOpenArticle: (articleId: string) => void;
  lockedView: ReactNode;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");
  // While a new queue order is being saved, show it straight away instead of waiting on the server.
  const [order, setOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [dragKeyword, setDragKeyword] = useState<string | null>(null);
  const [overKeyword, setOverKeyword] = useState<string | null>(null);
  // Re-render every 30 seconds so the countdowns stay current.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/keyword-research?brandId=${brandId}`);
      if (res.ok) setData(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  async function saveOrder(keywords: string[]) {
    setOrder(keywords);
    setSavingOrder(true);
    setError("");
    try {
      const res = await fetch("/api/keyword-research/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, keywords }) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        if (d.reason === "upgrade") onUpgrade();
        else setError(d.error ?? "Couldn't save the new order.");
      }
      await load();
    } finally {
      setOrder(null);
      setSavingOrder(false);
    }
  }

  // Moves a queued keyword to a new place in the queue (0 = written first).
  function moveKeyword(keyword: string, toIndex: number) {
    const list = orderedQueue.map((r) => r.keyword);
    const from = list.indexOf(keyword);
    if (from < 0) return;
    const to = Math.max(0, Math.min(list.length - 1, toIndex));
    if (to === from) return;
    list.splice(from, 1);
    list.splice(to, 0, keyword);
    saveOrder(list);
  }

  async function findKeywords() {
    if (isFreeTier) { onUpgrade(); return; }
    setFinding(true);
    setError("");
    try {
      const res = await fetch("/api/keyword-research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.reason === "upgrade") onUpgrade();
        else setError(d.error ?? "Couldn't find keywords right now.");
      }
      await load();
    } finally {
      setFinding(false);
    }
  }

  const serverRows = data?.keywords ?? [];
  const serverQueue = serverRows.filter((r) => r.status === "queued" && r.scheduledAt && !!data?.autopilot?.enabled);
  const slotTimes = serverQueue.map((r) => r.scheduledAt as string);
  const orderedQueue = (order ? order.map((k) => serverQueue.find((r) => r.keyword === k)).filter((r): r is Row => !!r) : serverQueue)
    // A keyword the list doesn't mention (queued in the meantime) keeps its place at the end.
    .concat(order ? serverQueue.filter((r) => !order.includes(r.keyword)) : [])
    .map((r, i) => ({ ...r, scheduledAt: slotTimes[i] ?? r.scheduledAt, queueIndex: i }));
  const rows: Row[] = [...orderedQueue, ...serverRows.filter((r) => !serverQueue.includes(r))];
  const maxVolume = Math.max(...rows.map((r) => r.volume ?? 0), 1);
  const enabled = !!data?.autopilot?.enabled;
  const draftMode = data?.autopilot?.publishMode === "draft";
  const upcoming = rows.filter((r) => r.status === "queued" && r.scheduledAt);
  // Reordering only makes sense while there is a schedule to reorder.
  const reorderable = !!data?.autopilot?.enabled && orderedQueue.length > 1;
  // With auto-publishing off nothing is queued in practice, so a "queued" keyword is just one without an article.
  const shownStatus = (r: Row): Row["status"] => (r.status === "queued" && !enabled ? "none" : r.status);
  const coverage = data && data.summary.total > 0 ? Math.round((data.summary.published / data.summary.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[var(--ink)]">Keywords</h2>
        <p className="text-sm text-[var(--ink-faint)] mt-0.5">What your buyers search for, how many search it each month, and whether an article is aimed at it.</p>
      </div>

      <AutopublishBar brandId={brandId} context="keywords" isFreeTier={isFreeTier} onUpgrade={onUpgrade} onSetup={onSetupPublishing} onChange={load} />

      {isFreeTier ? (
        lockedView
      ) : loading && !data ? (
        <div className="flex items-center justify-center py-24"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
      ) : !data?.hasResearch && rows.length === 0 ? (
        <div className="panel rounded-xl p-8 text-center">
          <p className="text-base font-semibold text-[var(--ink)] mb-1">Find the keywords your buyers search</p>
          <p className="text-sm text-[var(--ink-soft)] max-w-md mx-auto mb-5">
            RankOnGeo looks up the high-intent searches in your niche and how often each is searched, so every article you publish has a target.
          </p>
          {error && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-4 max-w-md mx-auto">{error}</p>}
          <button onClick={findKeywords} disabled={finding} className="text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] px-5 py-2.5 rounded-lg hover:bg-[var(--rust-deep)] disabled:opacity-60 transition-colors">
            {finding ? "Finding keywords… about 20 seconds" : "Find my keywords"}
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {[
              { label: "Keywords", value: data!.summary.total, sub: "worth ranking for" },
              { label: "Published", value: data!.summary.published, sub: "have an article live" },
              { label: "In progress", value: data!.summary.inProgress, sub: "drafted or up next" },
              { label: "Covered", value: `${coverage}%`, sub: "of your keywords" },
            ].map((s) => (
              <div key={s.label} className="panel rounded-xl p-4">
                <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-semibold text-[var(--ink)] mt-1">{s.value}</p>
                <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {enabled && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 mb-3">
              {upcoming.length > 0 ? (
                <p className="text-xs text-[var(--ink-soft)] leading-relaxed">
                  <span className="font-semibold text-[var(--ink)]">{upcoming.length} article{upcoming.length === 1 ? "" : "s"} scheduled.</span>{" "}
                  {draftMode ? "Drafts are written" : "Articles are written and published"} about {data?.autopilot?.postsPerWeek} a week. Next: &ldquo;{upcoming[0].keyword}&rdquo; {countdown(upcoming[0].scheduledAt!, now)}.{reorderable && " Drag rows, or use the arrows, to change what is written first."}
                </p>
              ) : (
                <p className="text-xs text-[var(--ink-soft)]">Auto-publishing is on and there is nothing queued right now. It will pick new keywords as they are found.</p>
              )}
            </div>
          )}

          <div className="panel rounded-xl overflow-x-auto mb-3">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left">
                  {reorderable && <th className="pl-4 pr-0 py-3 w-24"><span className="sr-only">Order</span></th>}
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Keyword</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Searches / month</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Article</th>
                  <th className="px-5 py-3 text-right text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">{enabled ? (draftMode ? "Draft written" : "Publishes") : ""}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const status = shownStatus(r);
                  const scheduled = enabled && status === "queued" && !!r.scheduledAt;
                  const isNext = scheduled && r.queueIndex === 0;
                  const pill = scheduled ? { label: isNext ? "Next" : "Scheduled", cls: isNext ? "bg-[var(--olive)]/15 text-[var(--olive)]" : "bg-[var(--line-soft)] text-[var(--ink-soft)]" } : STATUS[status];
                  return (
                    <tr
                      key={r.keyword}
                      draggable={reorderable && scheduled && !savingOrder}
                      onDragStart={(e) => { setDragKeyword(r.keyword); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.keyword); }}
                      onDragOver={(e) => { if (dragKeyword && scheduled) { e.preventDefault(); setOverKeyword(r.keyword); } }}
                      onDrop={(e) => { e.preventDefault(); if (dragKeyword && scheduled && dragKeyword !== r.keyword) moveKeyword(dragKeyword, r.queueIndex ?? 0); setDragKeyword(null); setOverKeyword(null); }}
                      onDragEnd={() => { setDragKeyword(null); setOverKeyword(null); }}
                      className={`border-b border-[var(--line)] last:border-b-0 ${dragKeyword === r.keyword ? "opacity-40" : ""} ${overKeyword === r.keyword && dragKeyword && dragKeyword !== r.keyword ? "bg-[var(--rust-wash)]" : ""}`}
                    >
                      {reorderable && (
                        <td className="pl-4 pr-0 py-3 w-24">
                          {scheduled && (
                            <div className="flex items-center gap-0.5 text-[var(--ink-faint)]">
                              <span className="cursor-grab select-none px-1 text-base leading-none" title="Drag to change the order" aria-hidden="true">⋮⋮</span>
                              <button disabled={savingOrder || r.queueIndex === 0} onClick={() => moveKeyword(r.keyword, (r.queueIndex ?? 0) - 1)} aria-label={`Move “${r.keyword}” earlier`} title="Publish earlier" className="w-6 h-6 rounded hover:bg-[var(--line-soft)] hover:text-[var(--ink)] disabled:opacity-25 disabled:hover:bg-transparent text-[10px]">▲</button>
                              <button disabled={savingOrder || r.queueIndex === orderedQueue.length - 1} onClick={() => moveKeyword(r.keyword, (r.queueIndex ?? 0) + 1)} aria-label={`Move “${r.keyword}” later`} title="Publish later" className="w-6 h-6 rounded hover:bg-[var(--line-soft)] hover:text-[var(--ink)] disabled:opacity-25 disabled:hover:bg-transparent text-[10px]">▼</button>
                              {(r.queueIndex ?? 0) > 1 && (
                                <button disabled={savingOrder} onClick={() => moveKeyword(r.keyword, 0)} title="Publish next" className="ml-0.5 rounded px-1 h-6 text-[10px] font-semibold hover:bg-[var(--line-soft)] hover:text-[var(--ink)] disabled:opacity-25">Top</button>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                      <td className="px-5 py-3 text-[var(--ink)]">{r.keyword}</td>
                      <td className="px-5 py-3 w-48">
                        <div className="flex items-center gap-2.5">
                          <span className={`text-xs w-16 shrink-0 ${r.volume === null ? "text-[var(--ink-faint)]" : "font-semibold text-[var(--ink)]"}`}>{volumeLabel(r.volume, !!data?.volumeAvailable)}</span>
                          {r.volume !== null && (
                            <span className="flex-1 h-1.5 bg-[var(--line-soft)] rounded-full overflow-hidden">
                              <span className="block h-full bg-[var(--olive)] rounded-full" style={{ width: `${Math.max(4, Math.round((r.volume / maxVolume) * 100))}%` }} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${pill.cls}`}>{pill.label}</span>
                      </td>
                      <td className="px-5 py-3 text-right whitespace-nowrap">
                        {scheduled ? (
                          <div title="Estimated. Auto-publishing checks every 6 hours and follows your posts-per-week pace.">
                            <p className="text-xs font-semibold text-[var(--ink)]">{countdown(r.scheduledAt!, now)}</p>
                            <p className="text-[10px] text-[var(--ink-faint)]">{clock(r.scheduledAt!)}</p>
                          </div>
                        ) : status === "published" && r.article?.url ? (
                          <a href={r.article.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--rust)] hover:underline">View live ↗</a>
                        ) : status === "published" || status === "draft" ? (
                          <button onClick={() => r.article && onOpenArticle(r.article.id)} className="text-xs font-semibold text-[var(--rust)] hover:underline">Open</button>
                        ) : enabled ? (
                          <span className="text-[11px] text-[var(--ink-faint)]">Not scheduled</span>
                        ) : (
                          <button onClick={() => onWriteArticle(r.keyword)} className="text-xs font-semibold border border-[var(--line)] text-[var(--ink-soft)] px-3 py-1.5 rounded-lg hover:bg-[var(--line-soft)] transition-colors">Write article</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--ink-faint)] max-w-2xl">
              {data?.volumeAvailable
                ? "Approximate monthly Google searches in the US, from Google Ads data. Rankings take time: new articles need to be found and indexed, so results build over weeks and months."
                : "Search volumes are unavailable right now. Rankings take time, so results build over weeks and months."}
              {enabled && " Publish times are estimates: auto-publishing checks every 6 hours and follows your posts-per-week pace."}
              {data?.researchedAt && <> Researched {new Date(data.researchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.</>}
            </p>
            {data?.canRefresh && (
              <button onClick={findKeywords} disabled={finding} className="text-xs font-semibold text-[var(--rust)] hover:underline disabled:opacity-60">
                {finding ? "Refreshing…" : "Refresh keywords"}
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{error}</p>}
        </>
      )}
    </div>
  );
}
