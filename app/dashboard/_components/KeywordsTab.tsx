"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AutopublishBar } from "./AutopublishBar";

type Row = {
  keyword: string;
  volume: number | null;
  source: string;
  status: "published" | "draft" | "queued" | "none";
  article: { id: string; title: string; url: string | null; status: string } | null;
};
type Data = {
  keywords: Row[];
  hasResearch: boolean;
  volumeAvailable: boolean;
  researchedAt: string | null;
  canRefresh: boolean;
  summary: { total: number; published: number; inProgress: number };
};

const STATUS: Record<Row["status"], { label: string; cls: string }> = {
  published: { label: "Published", cls: "bg-[var(--olive)]/15 text-[var(--olive)]" },
  draft: { label: "Draft ready", cls: "bg-[var(--rust-wash)] text-[var(--rust-deep)]" },
  queued: { label: "Up next", cls: "bg-[var(--line-soft)] text-[var(--ink-soft)]" },
  none: { label: "No article yet", cls: "bg-[var(--line-soft)] text-[var(--ink-faint)]" },
};

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

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/keyword-research?brandId=${brandId}`);
      if (res.ok) setData(await res.json());
    } catch {} finally {
      setLoading(false);
    }
  }, [brandId]);

  useEffect(() => { setLoading(true); load(); }, [load]);

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

  const rows = data?.keywords ?? [];
  const maxVolume = Math.max(...rows.map((r) => r.volume ?? 0), 1);
  const coverage = data && data.summary.total > 0 ? Math.round((data.summary.published / data.summary.total) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto w-full">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-[var(--ink)]">Keywords</h2>
        <p className="text-sm text-[var(--ink-faint)] mt-0.5">What your buyers search for, how many search it each month, and whether an article is aimed at it.</p>
      </div>

      <AutopublishBar brandId={brandId} context="keywords" isFreeTier={isFreeTier} onUpgrade={onUpgrade} onSetup={onSetupPublishing} />

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

          <div className="panel rounded-xl overflow-x-auto mb-3">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left">
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Keyword</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Searches / month</th>
                  <th className="px-5 py-3 text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Article</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.keyword} className="border-b border-[var(--line)] last:border-b-0">
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
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {r.status === "published" && r.article?.url ? (
                        <a href={r.article.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--rust)] hover:underline">View live ↗</a>
                      ) : r.status === "published" || r.status === "draft" ? (
                        <button onClick={() => r.article && onOpenArticle(r.article.id)} className="text-xs font-semibold text-[var(--rust)] hover:underline">Open</button>
                      ) : (
                        <button onClick={() => onWriteArticle(r.keyword)} className="text-xs font-semibold border border-[var(--line)] text-[var(--ink-soft)] px-3 py-1.5 rounded-lg hover:bg-[var(--line-soft)] transition-colors">Write article</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--ink-faint)] max-w-2xl">
              {data?.volumeAvailable
                ? "Approximate monthly Google searches in the US, from Google Ads data. Rankings take time: new articles need to be found and indexed, so results build over weeks and months."
                : "Search volumes are unavailable right now. Rankings take time, so results build over weeks and months."}
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
