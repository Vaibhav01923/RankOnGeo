"use client";

import { useCallback, useEffect, useState } from "react";

type Channel = { id: string; name: string; type: string; status: string | null };
type State = {
  settings: { enabled: boolean; channelId: string | null; publishMode: "publish" | "draft"; lastError: string | null };
  channels: Channel[];
  nextTopics: { keyword: string; source: string }[];
  postCount: number;
  isPaid: boolean;
};

// Channel types RankOnGeo can actually deliver posts to.
const PUBLISHABLE = new Set(["webhook", "wordpress"]);

const COPY = {
  keywords: {
    setupTitle: "Turn on auto-publishing",
    setupBody: "Connect your website once, and RankOnGeo writes and publishes blogs that target these keywords and rank on them, automatically.",
    onBody: "RankOnGeo is writing and publishing blogs to target these keywords and rank on them.",
    offBody: "Switch on and RankOnGeo will write and publish blogs that target these keywords and rank on them.",
  },
  seoGeo: {
    setupTitle: "Turn on auto-publishing",
    setupBody: "Connect your website once, and RankOnGeo writes and publishes articles for these keywords and AI prompts, automatically.",
    onBody: "RankOnGeo is writing and publishing articles for these keywords and AI prompts.",
    offBody: "Switch on and RankOnGeo will write and publish articles for these keywords and AI prompts. Or write each one yourself.",
  },
  research: {
    setupTitle: "Publish these articles automatically",
    setupBody: "Connect your website once and RankOnGeo writes and publishes articles for you, or write and publish each one yourself below.",
    onBody: "Auto-publishing is on. You can also write and publish any article yourself below.",
    offBody: "Turn it on and RankOnGeo writes and publishes articles for you. Or write and publish each one yourself below.",
  },
} as const;

// One compact control for auto-publishing, used wherever the customer decides
// what to write: not set up yet (a call to set it up), or an on/off switch.
export function AutopublishBar({
  brandId,
  context,
  isFreeTier,
  onUpgrade,
  onSetup,
  onChange,
}: {
  brandId: string;
  context: keyof typeof COPY;
  isFreeTier: boolean;
  onUpgrade: () => void;
  onSetup: () => void;
  // Called after the switch flips, so the list around it can refresh.
  onChange?: () => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const copy = COPY[context];

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/autopilot?brandId=${brandId}`);
      if (res.ok) setState(await res.json());
    } catch {}
  }, [brandId]);

  useEffect(() => { load(); }, [load]);

  if (!state) return <div className="h-16 rounded-xl bg-[var(--line-soft)] animate-pulse mb-5" />;

  const channels = state.channels.filter((c) => PUBLISHABLE.has(c.type) && c.status !== "paused");
  const isSetUp = channels.length > 0;
  const on = state.settings.enabled;
  const locked = isFreeTier || !state.isPaid;
  const next = state.nextTopics[0]?.keyword;

  async function toggle() {
    if (locked) { onUpgrade(); return; }
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      // Turning it on publishes straight to the connected website unless a
      // destination was already chosen.
      const body = !on
        ? { brandId, enabled: true, publishMode: "publish", channelId: state!.settings.channelId ?? channels[0]?.id ?? null }
        : { brandId, enabled: false };
      const res = await fetch("/api/autopilot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.reason === "upgrade") onUpgrade();
        else setError(d.error ?? "Couldn't change that");
      }
      await load();
      if (res.ok) onChange?.();
    } finally {
      setSaving(false);
    }
  }

  if (!isSetUp) {
    return (
      <div className="rounded-xl border border-[var(--rust)]/25 bg-[var(--rust-wash)] px-5 py-4 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--ink)]">{copy.setupTitle}</p>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5 max-w-xl">{copy.setupBody}</p>
        </div>
        <button onClick={locked ? onUpgrade : onSetup} className="text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors whitespace-nowrap">
          {locked ? "Upgrade to unlock" : "Set up auto-publishing"}
        </button>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border px-5 py-4 mb-5 ${on ? "border-[var(--olive)]/30 bg-[var(--olive)]/5" : "border-[var(--line)] bg-[var(--surface)]"}`}>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[var(--ink)]">Auto-publishing</p>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${on ? "bg-[var(--olive)]/15 text-[var(--olive)]" : "bg-[var(--line)] text-[var(--ink-soft)]"}`}>{on ? "On" : "Off"}</span>
          </div>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">{on ? copy.onBody : copy.offBody}</p>
          {on && next && <p className="text-[11px] text-[var(--ink-faint)] mt-1">Up next: &ldquo;{next}&rdquo; · {state.postCount} written so far</p>}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Turn auto-publishing on or off"
          onClick={toggle}
          disabled={saving}
          className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:opacity-60 ${on ? "bg-[var(--olive)]" : "bg-[var(--line)]"}`}
        >
          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-[var(--surface)] shadow transition-transform ${on ? "translate-x-5" : ""}`} />
        </button>
      </div>
      {error && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mt-3">{error}</p>}
      {state.settings.lastError && on && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mt-3">Last run had a problem: {state.settings.lastError}</p>}
    </div>
  );
}
