"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GapItem, ScanResult } from "@/lib/types";
import { normalizeKeyword } from "@/lib/keyword-list";
import { createSerialSaver } from "@/lib/serial-saver";
import { AutopublishBar } from "./AutopublishBar";
import type { ArticlePerformance } from "./useArticlePerformance";

// One place for everything articles are written for: the keywords buyers search
// (SEO) and the questions AI answers without mentioning the brand (GEO). The
// Targets view is the queue; Covered shows what published articles already hit.

type Row = {
  keyword: string;
  volume: number | null;
  source: string;
  status: "published" | "draft" | "queued" | "none";
  article: { id: string; title: string; url: string | null; status: string } | null;
  // While auto-publishing is on: the estimated time this target's article goes out.
  scheduledAt?: string | null;
  queueIndex?: number | null;
};
type Data = {
  keywords: Row[];
  hasResearch: boolean;
  volumeAvailable: boolean;
  researchedAt: string | null;
  canRefresh: boolean;
  usOnly?: boolean;
  autopilot?: { enabled: boolean; postsPerWeek: number; publishMode: "publish" | "draft"; nextPostAt: string | null };
};
type Target = Row & { kind: "keyword" | "prompt"; label: string; gap?: GapItem };
type ArticleLite = { id: string; title: string; keyword: string; status: string; publishedUrl?: string | null; publishedAt?: string | null; createdAt: string };

const ENGINE_NAMES: Record<string, string> = { chatgpt: "ChatGPT", claude: "Claude", gemini: "Gemini", perplexity: "Perplexity", google: "Google AI", grok: "Grok" };
const engineNames = (engines: string[]) => engines.map((e) => ENGINE_NAMES[e] ?? e).join(", ");

const STATUS: Record<Row["status"], { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-[var(--olive)]/15 text-[var(--olive)]" },
  draft: { label: "Draft ready", cls: "bg-[var(--rust-wash)] text-[var(--rust-deep)]" },
  queued: { label: "Up next", cls: "bg-[var(--line-soft)] text-[var(--ink-soft)]" },
  none: { label: "No article yet", cls: "bg-[var(--line-soft)] text-[var(--ink-faint)]" },
};

// "2d 4h 15m", "4h 15m", "12m". A time already passed means the next check is picking it up now.
function countdown(target: string, now: number): string {
  const totalMin = Math.floor((Date.parse(target) - now) / 60000);
  if (totalMin < 1) return "any moment now";
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  return `in ${d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m` : `${m}m`}`;
}
const clock = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const num = (n: number) => n.toLocaleString();

function TypeBadge({ kind }: { kind: Target["kind"] }) {
  return kind === "keyword"
    ? <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--line-soft)] text-[var(--ink-soft)]">Keyword</span>
    : <span className="text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-[var(--rust-wash)] text-[var(--rust-deep)]">AI prompt</span>;
}

export function SeoGeoTab({
  brandId,
  isFreeTier,
  onUpgrade,
  onSetupPublishing,
  gaps,
  results,
  articles,
  perf,
  onWriteKeyword,
  onWritePrompt,
  onOpenArticle,
}: {
  brandId: string;
  isFreeTier: boolean;
  onUpgrade: () => void;
  onSetupPublishing: () => void;
  gaps: GapItem[];
  results: ScanResult[];
  articles: ArticleLite[];
  perf: ArticlePerformance | null;
  onWriteKeyword: (keyword: string) => void;
  onWritePrompt: (gap: GapItem) => void;
  onOpenArticle: (articleId: string) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [finding, setFinding] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"targets" | "covered">("targets");
  const [filter, setFilter] = useState<"all" | "keyword" | "prompt">("all");
  // While a new queue order saves, show it straight away instead of waiting on the server.
  const [order, setOrder] = useState<string[] | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderSaved, setOrderSaved] = useState(false);
  const orderSeq = useRef(0);
  const orderFailed = useRef(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // `sync: false` asks the server to skip its background queue sync (used right after a reorder, when it is only a refresh).
  const load = useCallback(async (opts?: { sync?: boolean }) => {
    try {
      const res = await fetch(`/api/keyword-research?brandId=${brandId}${opts?.sync === false ? "&sync=0" : ""}`);
      if (res.ok) setData(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [brandId]);
  useEffect(() => { setLoading(true); load(); }, [load]);

  // ---- one list of targets: keywords and AI prompts -------------------------
  const enabled = !!data?.autopilot?.enabled;
  const draftMode = data?.autopilot?.publishMode === "draft";
  const gapByKey = new Map(gaps.map((g) => [normalizeKeyword(g.promptText), g]));
  // Every prompt being tracked, including ones AI already answers with the brand in them.
  const trackedPromptKeys = new Set(results.map((r) => normalizeKeyword(r.promptText)));
  const serverRows = data?.keywords ?? [];
  const apiKeys = new Set(serverRows.map((r) => r.keyword));
  const articleByKey = new Map<string, ArticleLite>();
  for (const a of articles) {
    const k = normalizeKeyword(a.keyword);
    if (k && (!articleByKey.has(k) || a.status === "published")) articleByKey.set(k, a);
  }

  const fromApi: Target[] = serverRows.map((r) => {
    const gap = gapByKey.get(r.keyword);
    const isPrompt = !!gap || r.source === "gap" || trackedPromptKeys.has(r.keyword);
    return { ...r, kind: isPrompt ? "prompt" : "keyword", label: gap?.promptText ?? r.keyword, gap };
  });
  // Prompts AI is missing you on that aren't in the queue yet (auto-publishing off, or not synced).
  const promptsOnly: Target[] = gaps
    .filter((g) => !apiKeys.has(normalizeKeyword(g.promptText)))
    .map((g) => {
      const a = articleByKey.get(normalizeKeyword(g.promptText));
      return {
        keyword: normalizeKeyword(g.promptText), volume: null, source: "gap",
        status: a ? (a.status === "published" ? "published" : "draft") : "none",
        article: a ? { id: a.id, title: a.title, url: a.publishedUrl ?? null, status: a.status } : null,
        kind: "prompt", label: g.promptText, gap: g,
      } as Target;
    });
  const all: Target[] = [...fromApi, ...promptsOnly];

  const queueRows = all.filter((r) => enabled && r.status === "queued" && r.scheduledAt);
  const slotTimes = queueRows.map((r) => r.scheduledAt as string);
  const orderedQueue: Target[] = (order ? order.map((k) => queueRows.find((r) => r.keyword === k)).filter((r): r is Target => !!r) : queueRows)
    .concat(order ? queueRows.filter((r) => !order.includes(r.keyword)) : [])
    .map((r, i) => ({ ...r, scheduledAt: slotTimes[i] ?? r.scheduledAt, queueIndex: i }));
  const rest = all
    .filter((r) => !queueRows.includes(r))
    .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "keyword" ? -1 : 1) || (b.volume ?? -1) - (a.volume ?? -1) || (b.gap?.engines.length ?? 0) - (a.gap?.engines.length ?? 0));
  const rows = [...orderedQueue, ...rest];
  const shown = rows.filter((r) => filter === "all" || r.kind === filter);

  const counts = { keyword: rows.filter((r) => r.kind === "keyword").length, prompt: rows.filter((r) => r.kind === "prompt").length };
  const published = rows.filter((r) => r.status === "published").length;
  const inProgress = rows.filter((r) => r.status === "draft" || (enabled && r.status === "queued")).length;
  const coverage = rows.length ? Math.round((published / rows.length) * 100) : 0;
  const maxVolume = Math.max(...rows.map((r) => r.volume ?? 0), 1);
  const upcoming = orderedQueue;
  // Reordering acts on the whole queue, so it is only offered when nothing is filtered out.
  const reorderable = enabled && orderedQueue.length > 1 && filter === "all";
  const statusOf = (r: Target): Row["status"] => (r.status === "queued" && !enabled ? "none" : r.status);
  const veil = isFreeTier ? "blur-[5px] select-none cursor-pointer" : "";

  // Reordering never locks the list: each change shows at once, and saves go out one at a
  // time with the newest order winning, so the order can be changed as often as you like.
  type OrderSave = { brandId: string; keywords: string[]; fail: (reason?: string, message?: string) => void };
  const orderSaver = useMemo(
    () =>
      createSerialSaver<OrderSave>(async ({ brandId: id, keywords, fail }) => {
        try {
          const res = await fetch("/api/keyword-research/order", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: id, keywords }) });
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            fail(d.reason, d.error);
          }
        } catch {
          fail();
        }
      }),
    []
  );
  function saveOrder(keywords: string[]) {
    const seq = ++orderSeq.current;
    setOrder(keywords);
    setSavingOrder(true);
    setOrderSaved(false);
    setError("");
    orderFailed.current = false;
    const fail = (reason?: string, message?: string) => {
      orderFailed.current = true;
      if (reason === "upgrade") onUpgrade();
      else setError(message ?? "Couldn't save the new order.");
    };
    orderSaver.push({ brandId, keywords, fail }).then(async () => {
      if (seq !== orderSeq.current) return; // a newer change is still on its way; it will finish the job
      // The order is saved (or has failed): stop showing "updating" now and refresh quietly behind it.
      setSavingOrder(false);
      if (!orderFailed.current) {
        setOrderSaved(true);
        clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setOrderSaved(false), 2500);
      }
      await load({ sync: false });
      if (seq !== orderSeq.current) return;
      // Back to what the server has: the saved order, or the old one if saving failed.
      setOrder(null);
    });
  }
  function move(key: string, toIndex: number) {
    const list = orderedQueue.map((r) => r.keyword);
    const from = list.indexOf(key);
    if (from < 0) return;
    const to = Math.max(0, Math.min(list.length - 1, toIndex));
    if (to === from) return;
    list.splice(from, 1);
    list.splice(to, 0, key);
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
  const write = (r: Target) => { if (isFreeTier) onUpgrade(); else if (r.kind === "prompt" && r.gap) onWritePrompt(r.gap); else onWriteKeyword(r.label); };

  // ---- what published articles already cover --------------------------------
  const perfById = new Map((perf?.articles ?? []).map((p) => [p.id, p]));
  const volumeByKey = new Map(serverRows.map((r) => [r.keyword, r.volume]));
  const promptSourceKeys = new Set(serverRows.filter((r) => r.source === "gap").map((r) => r.keyword));
  const covered = articles
    .filter((a) => a.status === "published" && a.keyword)
    .map((a) => {
      const key = normalizeKeyword(a.keyword);
      const isPrompt = gapByKey.has(key) || trackedPromptKeys.has(key) || promptSourceKeys.has(key);
      const mentionedBy = isPrompt ? [...new Set(results.filter((r) => normalizeKeyword(r.promptText) === key && r.brandMentioned).map((r) => r.engine))] : [];
      return { a, key, isPrompt, volume: volumeByKey.get(key) ?? null, mentionedBy, stillMissing: gapByKey.get(key)?.engines ?? [], views: perfById.get(a.id)?.views ?? null };
    })
    .sort((x, y) => (y.a.publishedAt ?? "").localeCompare(x.a.publishedAt ?? ""));
  const coveredKeywords = covered.filter((c) => !c.isPrompt);
  const coveredPrompts = covered.filter((c) => c.isPrompt);

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[var(--ink)]">SEO &amp; GEO</h2>
        <p className="text-sm text-[var(--ink-faint)] mt-0.5">
          One queue for the keywords buyers search on Google (SEO) and the questions AI answers without mentioning you (GEO). Every article is written for one of them.
        </p>
      </div>

      <AutopublishBar brandId={brandId} context="seoGeo" isFreeTier={isFreeTier} onUpgrade={onUpgrade} onSetup={onSetupPublishing} onChange={load} />

      <div className="flex gap-1 border-b border-[var(--line)] mb-5">
        {([["targets", "Targets", rows.length], ["covered", "Covered", covered.length]] as const).map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5 transition-colors ${view === id ? "border-[var(--rust)] text-[var(--rust-deep)]" : "border-transparent text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`}
          >
            {label}
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-soft)]">{n}</span>
          </button>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
      ) : view === "targets" ? (
        <>
          {!data?.hasResearch && (
            <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-4 mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Find the keywords your buyers search</p>
                <p className="text-xs text-[var(--ink-soft)] mt-0.5 max-w-lg">Add the SEO side: high-intent searches in your niche and how often each is searched.</p>
              </div>
              <button onClick={findKeywords} disabled={finding} className="text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] disabled:opacity-60 transition-colors whitespace-nowrap">
                {finding ? "Finding… about 20 seconds" : "Find my keywords"}
              </button>
            </div>
          )}

          {rows.length === 0 ? (
            <div className="panel rounded-xl p-8 text-center">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">Nothing to target yet</p>
              <p className="text-xs text-[var(--ink-soft)] max-w-md mx-auto">Run a scan to find the AI questions you are missing from, and find your keywords, and this fills up.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                {[
                  { label: "Targets", value: rows.length, sub: `${counts.keyword} keywords · ${counts.prompt} AI prompts` },
                  { label: "Published", value: published, sub: "have an article live" },
                  { label: "In progress", value: inProgress, sub: "drafted or up next" },
                  { label: "Covered", value: `${coverage}%`, sub: "of your targets" },
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
                      {draftMode ? "Drafts are written" : "Articles are written and published"} about {data?.autopilot?.postsPerWeek} a week, alternating keywords and AI prompts. Next: &ldquo;{upcoming[0].label}&rdquo; {countdown(upcoming[0].scheduledAt!, now)}.
                      {reorderable && " Drag rows, or use the arrows, to change what is written first."}
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--ink-soft)]">Auto-publishing is on and there is nothing queued right now. It picks up new keywords and prompts as they are found.</p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-1.5 mb-3">
                {([["all", `All ${rows.length}`], ["keyword", `Keywords ${counts.keyword}`], ["prompt", `AI prompts ${counts.prompt}`]] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setFilter(id)} className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${filter === id ? "bg-[var(--rust)] text-[var(--surface)]" : "panel text-[var(--ink-soft)] hover:bg-[var(--line-soft)]"}`}>{label}</button>
                ))}
                {enabled && orderedQueue.length > 1 && filter !== "all" && <span className="text-[11px] text-[var(--ink-faint)] ml-1">Show All to reorder.</span>}
                {(savingOrder || orderSaved) && (
                  <span role="status" aria-live="polite" className={`ml-auto inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium ${savingOrder ? "border-[var(--rust)]/40 bg-[var(--rust-wash)] text-[var(--rust-deep)]" : "border-[var(--olive)]/40 bg-[var(--olive-wash)] text-[var(--olive)]"}`}>
                    {savingOrder ? (
                      <>
                        <span className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />
                        Updating the order…
                      </>
                    ) : (
                      <>✓ Order saved</>
                    )}
                  </span>
                )}
              </div>

              <div className="panel rounded-xl overflow-x-auto mb-3 relative">
                {savingOrder && <div className="absolute inset-x-0 top-0 h-0.5 bg-[var(--rust)] animate-pulse" aria-hidden="true" />}
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--line)] text-left">
                      {reorderable && <th className="pl-4 pr-0 py-3 w-24"><span className="sr-only">Order</span></th>}
                      <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Target</th>
                      <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Demand</th>
                      <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Article</th>
                      <th className="px-5 py-3 text-right text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">{enabled ? (draftMode ? "Draft written" : "Publishes") : ""}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => {
                      const status = statusOf(r);
                      const scheduled = enabled && status === "queued" && !!r.scheduledAt;
                      const isNext = scheduled && r.queueIndex === 0;
                      const pill = scheduled ? { label: isNext ? "Next" : "Scheduled", cls: isNext ? "bg-[var(--olive)]/15 text-[var(--olive)]" : "bg-[var(--line-soft)] text-[var(--ink-soft)]" } : STATUS[status];
                      const stillMissing = r.gap?.engines ?? [];
                      return (
                        <tr
                          key={`${r.kind}:${r.keyword}`}
                          draggable={reorderable && scheduled}
                          onDragStart={(e) => { setDragKey(r.keyword); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", r.keyword); }}
                          onDragOver={(e) => { if (dragKey && scheduled) { e.preventDefault(); setOverKey(r.keyword); } }}
                          onDrop={(e) => { e.preventDefault(); if (dragKey && scheduled && dragKey !== r.keyword) move(dragKey, r.queueIndex ?? 0); setDragKey(null); setOverKey(null); }}
                          onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                          className={`border-b border-[var(--line)] last:border-b-0 align-top ${dragKey === r.keyword ? "opacity-40" : ""} ${overKey === r.keyword && dragKey && dragKey !== r.keyword ? "bg-[var(--rust-wash)]" : ""}`}
                        >
                          {reorderable && (
                            <td className="pl-4 pr-0 py-3 w-24">
                              {scheduled && (
                                <div className="flex items-center gap-0.5 text-[var(--ink-faint)]">
                                  <span className="cursor-grab select-none px-1 text-base leading-none" title="Drag to change the order" aria-hidden="true">⋮⋮</span>
                                  <button disabled={r.queueIndex === 0} onClick={() => move(r.keyword, (r.queueIndex ?? 0) - 1)} aria-label={`Move “${r.label}” earlier`} title="Publish earlier" className="w-6 h-6 rounded hover:bg-[var(--line-soft)] hover:text-[var(--ink)] disabled:opacity-25 disabled:hover:bg-transparent text-[10px]">▲</button>
                                  <button disabled={r.queueIndex === orderedQueue.length - 1} onClick={() => move(r.keyword, (r.queueIndex ?? 0) + 1)} aria-label={`Move “${r.label}” later`} title="Publish later" className="w-6 h-6 rounded hover:bg-[var(--line-soft)] hover:text-[var(--ink)] disabled:opacity-25 disabled:hover:bg-transparent text-[10px]">▼</button>
                                  {(r.queueIndex ?? 0) > 1 && (
                                    <button onClick={() => move(r.keyword, 0)} title="Publish next" className="ml-0.5 rounded px-1 h-6 text-[10px] font-semibold hover:bg-[var(--line-soft)] hover:text-[var(--ink)]">Top</button>
                                  )}
                                </div>
                              )}
                            </td>
                          )}
                          <td className="px-5 py-3 max-w-[320px]">
                            <div className="flex items-start gap-2">
                              <span className="text-[var(--ink)]">{r.label}</span>
                              <TypeBadge kind={r.kind} />
                            </div>
                            {r.kind === "prompt" && stillMissing.length > 0 && (
                              <p className={`text-[11px] text-[var(--ink-faint)] mt-1 ${veil}`} onClick={isFreeTier ? onUpgrade : undefined}>
                                Missing from {engineNames(stillMissing)}{r.gap?.topCompetitor ? ` · ${r.gap.topCompetitor} appears instead` : ""}
                              </p>
                            )}
                          </td>
                          <td className="px-5 py-3 w-44">
                            {r.kind === "keyword" ? (
                              <div className={`flex items-center gap-2.5 ${veil}`} onClick={isFreeTier ? onUpgrade : undefined}>
                                <span className={`text-xs w-16 shrink-0 ${r.volume === null ? "text-[var(--ink-faint)]" : "font-semibold text-[var(--ink)]"}`}>{r.volume === null ? (data?.volumeAvailable ? "low volume" : "—") : num(r.volume)}</span>
                                {r.volume !== null && (
                                  <span className="flex-1 h-1.5 bg-[var(--line-soft)] rounded-full overflow-hidden">
                                    <span className="block h-full bg-[var(--olive)] rounded-full" style={{ width: `${Math.max(4, Math.round((r.volume / maxVolume) * 100))}%` }} />
                                  </span>
                                )}
                              </div>
                            ) : stillMissing.length > 0 ? (
                              <span className={`text-xs text-[var(--ink-soft)] ${veil}`} onClick={isFreeTier ? onUpgrade : undefined}>Missing in {stillMissing.length} AI engine{stillMissing.length === 1 ? "" : "s"}</span>
                            ) : (
                              <span className="text-xs font-medium text-[var(--olive)]">Mentioned by AI now</span>
                            )}
                          </td>
                          <td className="px-5 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${pill.cls} ${veil}`} onClick={isFreeTier ? onUpgrade : undefined}>{pill.label}</span>
                          </td>
                          <td className="px-5 py-3 text-right whitespace-nowrap">
                            {scheduled ? (
                              <div title="Estimated. Auto-publishing checks every 6 hours and follows your posts-per-week pace." className={veil} onClick={isFreeTier ? onUpgrade : undefined}>
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
                              <button onClick={() => write(r)} className="text-xs font-semibold border border-[var(--line)] text-[var(--ink-soft)] px-3 py-1.5 rounded-lg hover:bg-[var(--line-soft)] transition-colors">Write article</button>
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
                  Keyword volumes are approximate monthly Google searches worldwide, from Google Ads data. AI prompts are tracked questions where an AI engine answered without mentioning you.
                  Results build over weeks and months.
                  {enabled && " Publish times are estimates: auto-publishing checks every 6 hours and follows your posts-per-week pace."}
                  {data?.researchedAt && <> Keywords researched {new Date(data.researchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}.</>}
                  {data?.usOnly && " These volumes are from an earlier lookup and count US searches only; refresh to see worldwide numbers."}
                </p>
                {data?.hasResearch && data.canRefresh && (
                  <button onClick={findKeywords} disabled={finding} className="text-xs font-semibold text-[var(--rust)] hover:underline disabled:opacity-60">{finding ? "Refreshing…" : "Refresh keywords"}</button>
                )}
              </div>
              {error && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{error}</p>}
            </>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {[
              { label: "Keywords covered", value: coveredKeywords.length, sub: `of ${counts.keyword} keywords` },
              { label: "AI prompts covered", value: coveredPrompts.length, sub: `of ${counts.prompt} prompts` },
              { label: "Articles published", value: covered.length, sub: "on your website" },
            ].map((s) => (
              <div key={s.label} className="panel rounded-xl p-4">
                <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-wide">{s.label}</p>
                <p className="text-2xl font-semibold text-[var(--ink)] mt-1">{s.value}</p>
                <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">{s.sub}</p>
              </div>
            ))}
          </div>

          {covered.length === 0 ? (
            <div className="panel rounded-xl p-8 text-center">
              <p className="text-sm font-semibold text-[var(--ink)] mb-1">No published articles yet</p>
              <p className="text-xs text-[var(--ink-soft)] max-w-md mx-auto mb-4">Once an article is published, the keyword or AI prompt it targets shows up here.</p>
              <button onClick={() => setView("targets")} className="text-xs font-semibold text-[var(--rust)] hover:underline">See what is queued →</button>
            </div>
          ) : (
            <div className="space-y-6">
              <section>
                <h3 className="text-sm font-semibold text-[var(--ink)] mb-2">Keywords covered <span className="text-[var(--ink-faint)] font-normal">· SEO</span></h3>
                {coveredKeywords.length === 0 ? (
                  <p className="text-xs text-[var(--ink-faint)]">No published article targets a keyword yet.</p>
                ) : (
                  <div className="panel rounded-xl overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="border-b border-[var(--line)] text-left">
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Keyword</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Searches / month</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Article</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Views</th>
                      </tr></thead>
                      <tbody>
                        {coveredKeywords.map((c) => (
                          <tr key={c.a.id} className="border-b border-[var(--line)] last:border-b-0">
                            <td className="px-5 py-3 text-[var(--ink)]">{c.key}</td>
                            <td className="px-5 py-3 text-xs text-[var(--ink-soft)]">{c.volume === null ? "—" : num(c.volume)}</td>
                            <td className="px-5 py-3 max-w-[260px]">
                              <button onClick={() => onOpenArticle(c.a.id)} className="text-xs font-medium text-[var(--rust)] hover:underline text-left line-clamp-1">{c.a.title}</button>
                              {c.a.publishedUrl && <a href={c.a.publishedUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-[10px] text-[var(--ink-faint)] hover:underline">live ↗</a>}
                            </td>
                            <td className="px-5 py-3 text-right text-xs font-semibold text-[var(--ink)]">{c.views === null || !perf?.trackingConnected ? "—" : num(c.views)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-sm font-semibold text-[var(--ink)] mb-2">AI prompts covered <span className="text-[var(--ink-faint)] font-normal">· GEO</span></h3>
                {coveredPrompts.length === 0 ? (
                  <p className="text-xs text-[var(--ink-faint)]">No published article targets an AI prompt yet.</p>
                ) : (
                  <div className="panel rounded-xl overflow-x-auto">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead><tr className="border-b border-[var(--line)] text-left">
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">AI prompt</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Article</th>
                        <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">AI answers now</th>
                      </tr></thead>
                      <tbody>
                        {coveredPrompts.map((c) => (
                          <tr key={c.a.id} className="border-b border-[var(--line)] last:border-b-0 align-top">
                            <td className="px-5 py-3 text-[var(--ink)] max-w-[260px]">{c.a.keyword}</td>
                            <td className="px-5 py-3 max-w-[240px]">
                              <button onClick={() => onOpenArticle(c.a.id)} className="text-xs font-medium text-[var(--rust)] hover:underline text-left line-clamp-1">{c.a.title}</button>
                              {c.a.publishedUrl && <a href={c.a.publishedUrl} target="_blank" rel="noopener noreferrer" className="ml-2 text-[10px] text-[var(--ink-faint)] hover:underline">live ↗</a>}
                            </td>
                            <td className="px-5 py-3 text-xs">
                              {c.mentionedBy.length > 0 && <p className="font-medium text-[var(--olive)]">Mentioned by {engineNames(c.mentionedBy)}</p>}
                              {c.stillMissing.length > 0 && <p className="text-[var(--ink-faint)]">Still missing from {engineNames(c.stillMissing)}</p>}
                              {c.mentionedBy.length === 0 && c.stillMissing.length === 0 && <p className="text-[var(--ink-faint)]">Not checked yet. Scans run every 3 days.</p>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-[var(--ink-faint)] mt-2">AI engines take time to pick up new articles, so a prompt can stay &ldquo;missing&rdquo; for a few scans after its article goes live.</p>
              </section>
            </div>
          )}
        </>
      )}
    </div>
  );
}
