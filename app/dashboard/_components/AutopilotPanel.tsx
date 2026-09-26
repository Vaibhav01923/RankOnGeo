"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Channel = { id: string; name: string; type: string; status: string | null };
type Settings = {
  enabled: boolean;
  channelId: string | null;
  postsPerWeek: number;
  publishMode: "publish" | "draft";
  autoRewrite: boolean;
  lastRunAt: string | null;
  lastError: string | null;
};
type State = {
  settings: Settings;
  channels: Channel[];
  queuedTopics: number;
  nextTopics: { keyword: string; source: string }[];
  postCount: number;
  activity: { article_title: string | null; status: string | null; error_message: string | null; created_at: string }[];
  isPaid: boolean;
};

const CADENCES = [1, 2, 3, 5, 7];
// Channel types RankOnGeo can actually deliver to; anything else is manual.
const PUBLISHABLE = new Set(["webhook", "wordpress"]);

function ago(iso: string | null): string {
  if (!iso) return "never";
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function AutopilotPanel({
  brandId,
  isFreeTier,
  onUpgrade,
  onAddChannel,
  channelCount,
}: {
  brandId: string;
  isFreeTier: boolean;
  onUpgrade: () => void;
  onAddChannel: () => void;
  channelCount: number;
}) {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const pollUntil = useRef(0);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/autopilot?brandId=${brandId}`);
      if (res.ok) setState(await res.json());
    } catch {}
  }, [brandId]);

  // Reload when channels are added/removed elsewhere on the page.
  useEffect(() => { load(); }, [load, channelCount]);

  // After "Run now", poll for a few minutes — writing a full article takes a
  // minute or two in the background job.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      load();
      if (Date.now() > pollUntil.current) setRunning(false);
    }, 6000);
    return () => clearInterval(t);
  }, [running, load]);

  async function save(patch: Partial<{ enabled: boolean; channelId: string | null; postsPerWeek: number; publishMode: "publish" | "draft"; autoRewrite: boolean }>) {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/autopilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, ...patch }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.reason === "upgrade") onUpgrade();
        else setError(d.error ?? "Couldn't save that change");
      }
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function runNow() {
    setError("");
    const res = await fetch("/api/autopilot/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) { setError(d.error ?? "Couldn't start a run"); return; }
    pollUntil.current = Date.now() + 4 * 60 * 1000;
    setRunning(true);
  }

  // Selecting a channel decides the mode too: a channel means publish, none
  // means drafts. Keeps the two settings from contradicting each other.
  function chooseDestination(value: string) {
    if (value === "__draft") save({ publishMode: "draft", channelId: null });
    else save({ publishMode: "publish", channelId: value });
  }

  if (!state) {
    return <div className="panel rounded-xl p-5 mb-5"><div className="h-16 flex items-center justify-center"><span className="w-5 h-5 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div></div>;
  }

  const s = state.settings;
  const locked = isFreeTier || !state.isPaid;
  const publishableChannels = state.channels.filter((c) => PUBLISHABLE.has(c.type) && c.status !== "paused");
  const destination = s.publishMode === "draft" ? "__draft" : s.channelId ?? "";

  return (
    <div className="panel rounded-xl p-5 mb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-semibold text-[var(--ink)]">Autopilot</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${s.enabled ? "bg-[var(--olive)]/15 text-[var(--olive)]" : "bg-[var(--line)] text-[var(--ink-soft)]"}`}>{s.enabled ? "On" : "Off"}</span>
          </div>
          <p className="text-xs text-[var(--ink-soft)] leading-relaxed max-w-xl">
            Hands-off SEO blogging. RankOnGeo picks keywords from where AI engines don&apos;t mention you yet and what people search in your niche, writes a full, optimised article, publishes it to your site — then rewrites posts that aren&apos;t getting traction.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={s.enabled}
          aria-label="Turn Autopilot on or off"
          onClick={() => (locked ? onUpgrade() : save({ enabled: !s.enabled }))}
          disabled={saving}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${s.enabled ? "bg-[var(--olive)]" : "bg-[var(--line)]"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[var(--surface)] shadow transition-transform ${s.enabled ? "translate-x-5" : ""}`} />
        </button>
      </div>

      {locked && (
        <p className="text-xs text-[var(--ink-soft)] mt-3">
          Autopilot is part of the paid plan. <button onClick={onUpgrade} className="text-[var(--rust)] font-semibold hover:underline">Upgrade to turn it on →</button>
        </p>
      )}

      <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 ${locked ? "opacity-50 pointer-events-none" : ""}`}>
        <label className="block">
          <span className="block text-[11px] font-semibold text-[var(--ink-soft)] mb-1">Publish to</span>
          <select
            value={destination}
            onChange={(e) => chooseDestination(e.target.value)}
            disabled={saving}
            className="w-full text-xs border border-[var(--line)] rounded-lg px-2.5 py-2 bg-[var(--surface)] text-[var(--ink)]"
          >
            {!destination && <option value="">Choose…</option>}
            {publishableChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value="__draft">Save as drafts for me to review</option>
          </select>
        </label>
        <label className="block">
          <span className="block text-[11px] font-semibold text-[var(--ink-soft)] mb-1">Posts per week</span>
          <select
            value={s.postsPerWeek}
            onChange={(e) => save({ postsPerWeek: Number(e.target.value) })}
            disabled={saving}
            className="w-full text-xs border border-[var(--line)] rounded-lg px-2.5 py-2 bg-[var(--surface)] text-[var(--ink)]"
          >
            {CADENCES.map((n) => <option key={n} value={n}>{n} {n === 1 ? "post" : "posts"} a week</option>)}
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2">
          <input type="checkbox" checked={s.autoRewrite} onChange={(e) => save({ autoRewrite: e.target.checked })} disabled={saving} className="mb-0.5" />
          <span className="text-xs text-[var(--ink)]">Rewrite posts that underperform</span>
        </label>
      </div>

      {!locked && publishableChannels.length === 0 && s.publishMode !== "draft" && (
        <p className="text-xs text-[var(--ink-soft)] mt-3">
          No publishing channel yet. <button onClick={onAddChannel} className="text-[var(--rust)] font-semibold hover:underline">Add your website or WordPress →</button> — or choose &ldquo;Save as drafts&rdquo; to review each post first.
        </p>
      )}

      {error && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{error}</p>}
      {s.lastError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mt-3">Last run had a problem: {s.lastError}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-[var(--line)]">
        <p className="text-[11px] text-[var(--ink-faint)]">
          {state.postCount} written · {state.queuedTopics} keywords queued · last run {ago(s.lastRunAt)}
        </p>
        {!locked && (
          <button
            onClick={runNow}
            disabled={running}
            className="text-xs font-semibold border border-[var(--line)] px-3 py-1.5 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--line-soft)] disabled:opacity-60 transition-colors"
          >
            {running ? "Writing… this takes a minute or two" : "Write one now"}
          </button>
        )}
      </div>

      {state.nextTopics.length > 0 && (
        <p className="text-[11px] text-[var(--ink-faint)] mt-2">
          Up next: {state.nextTopics.slice(0, 3).map((t) => `“${t.keyword}”`).join(" · ")}
        </p>
      )}

      {state.activity.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-[11px] font-semibold text-[var(--ink-soft)]">Recent activity</p>
          {state.activity.slice(0, 5).map((a, i) => (
            <div key={i} className="flex items-center justify-between gap-3 text-xs">
              <span className="truncate text-[var(--ink)]/80">{a.article_title ?? "Untitled"}</span>
              <span className={`shrink-0 ${a.status === "failed" ? "text-red-700" : "text-[var(--ink-faint)]"}`}>{a.status === "failed" ? "failed" : a.status === "published" ? "published" : a.status} · {ago(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <details className="mt-4">
        <summary className="text-[11px] font-semibold text-[var(--rust)] cursor-pointer select-none">How rewriting works</summary>
        <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-2">
          After a post has been live for 45 days, Autopilot checks how it&apos;s doing — using Google Search Console if you&apos;ve connected it, or your own site analytics otherwise. If it isn&apos;t getting seen (or isn&apos;t getting clicked), it&apos;s rewritten to cover the searches it should be winning. On WordPress and on webhook endpoints that reply with an id, the live post is updated in place; anywhere else you get the improved version as a draft to swap in. Each post is reviewed at most every 45 days and rewritten at most 3 times.
        </p>
      </details>
    </div>
  );
}
