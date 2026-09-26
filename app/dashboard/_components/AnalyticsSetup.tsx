"use client";

import { useEffect, useRef, useState } from "react";
import {
  INTEGRATION_PLATFORMS,
  buildIntegrationPrompt,
  cloudflareWorkerSnippet,
  expressSnippet,
  nextProxySnippet,
  trackingScriptTag,
  type IntegrationPlatform,
  type IntegrationPlatformId,
} from "@/lib/integrations";

export type AnalyticsStatus = {
  web: { connected: boolean; lastSeenAt: string | null };
  bot: { connected: boolean; lastSeenAt: string | null };
  gsc?: { configured: boolean; connected: boolean };
  autopilot?: { enabled: boolean };
};

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`text-[11px] font-semibold border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 rounded-md text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors ${className}`}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

function StatusRow({ title, connected, detail, optional }: { title: string; connected: boolean; detail: string; optional?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border border-[var(--line)] rounded-lg px-3 py-2.5 bg-[var(--surface)]">
      <div className="flex items-center gap-2.5 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${
            connected ? "bg-[var(--olive)]" : optional ? "bg-[var(--ink-faint)]/50" : "bg-[var(--rust)] animate-pulse"
          }`}
        />
        <p className="text-sm font-medium text-[var(--ink)] truncate">{title}</p>
      </div>
      <p className={`text-xs shrink-0 ${connected ? "text-[var(--olive)] font-medium" : "text-[var(--ink-faint)]"}`}>{detail}</p>
    </div>
  );
}

export function AnalyticsSetup({
  siteKey,
  domain,
  status,
  onTest,
  testing,
  testError,
  onRefreshStatus,
}: {
  siteKey: string;
  domain: string;
  status: AnalyticsStatus | null;
  onTest: (type: "web" | "bot") => void;
  testing: boolean;
  testError: string;
  onRefreshStatus: () => void;
}) {
  const [platformId, setPlatformId] = useState<IntegrationPlatformId | null>(null);
  const [snippetTab, setSnippetTab] = useState<"next" | "express" | "cloudflare">("next");

  // Keep checking while this screen is open so the "waiting" state flips to
  // "connected" on its own the moment the first real visit lands. The ref
  // keeps the latest callback without restarting the timer on every render.
  const refreshRef = useRef(onRefreshStatus);
  refreshRef.current = onRefreshStatus;
  useEffect(() => {
    const t = setInterval(() => refreshRef.current(), 6000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("analyticsPlatform") as IntegrationPlatformId | null;
      if (saved && INTEGRATION_PLATFORMS.some((p) => p.id === saved)) setPlatformId(saved);
    } catch {}
  }, []);

  function choose(id: IntegrationPlatformId) {
    setPlatformId(id);
    try { localStorage.setItem("analyticsPlatform", id); } catch {}
  }

  const platform: IntegrationPlatform | null = INTEGRATION_PLATFORMS.find((p) => p.id === platformId) ?? null;
  const scriptTag = trackingScriptTag(siteKey);
  const prompt = buildIntegrationPrompt(siteKey, domain);
  const snippets = {
    next: nextProxySnippet(siteKey),
    express: expressSnippet(siteKey),
    cloudflare: cloudflareWorkerSnippet(siteKey),
  };

  return (
    <div className="space-y-5">
      {/* Connection status */}
      <div className="panel rounded-xl p-5">
        <p className="text-sm font-semibold text-[var(--ink)] mb-1">Connect your site</p>
        <p className="text-xs text-[var(--ink-faint)] mb-4">
          One step gets you traffic analytics. Custom-built sites also get AI-crawler tracking from the same single prompt. This page checks automatically — it turns green as soon as the first real visit arrives.
        </p>
        <div className="space-y-2">
          <StatusRow
            title="Web analytics"
            connected={!!status?.web.connected}
            detail={status?.web.connected ? `Connected · last visit ${timeAgo(status.web.lastSeenAt)}` : "Waiting for your first visit…"}
          />
          <StatusRow
            title="AI-crawler tracking"
            connected={!!status?.bot.connected}
            optional
            detail={status?.bot.connected ? `Connected · last crawl ${timeAgo(status.bot.lastSeenAt)}` : "Not connected (optional)"}
          />
        </div>
      </div>

      {/* Platform picker */}
      <div className="panel rounded-xl p-5">
        <p className="text-sm font-semibold text-[var(--ink)] mb-1">Where is your site built?</p>
        <p className="text-xs text-[var(--ink-faint)] mb-4">Pick your platform for exact, copy-paste steps.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {INTEGRATION_PLATFORMS.map((p) => {
            const active = p.id === platformId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => choose(p.id)}
                className={`flex items-center gap-2.5 text-left border rounded-xl px-3 py-3 transition-colors ${
                  active ? "border-[var(--rust)] bg-[var(--rust-wash)]" : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--rust)]/40"
                }`}
              >
                <span className="w-7 h-7 rounded-lg bg-[var(--line-soft)] text-[var(--ink-soft)] text-xs font-bold flex items-center justify-center shrink-0">
                  {p.name.charAt(0)}
                </span>
                <span className="text-sm font-medium text-[var(--ink)] leading-tight">{p.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Guide for the chosen platform */}
      {platform && (
        <div className="panel rounded-xl p-5">
          <p className="text-sm font-semibold text-[var(--ink)] mb-3">{platform.name}</p>

          {platform.useMasterPrompt ? (
            <>
              <p className="text-xs text-[var(--ink-soft)] mb-3">{platform.note}</p>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-xs font-semibold text-[var(--ink)]/90">
                  Paste this into Claude Code, Cursor, Copilot, Lovable, Bolt, v0 or ChatGPT
                </p>
                <CopyButton text={prompt} label="Copy prompt" className="!bg-[var(--rust)] !text-[var(--surface)] !border-[var(--rust)] hover:!bg-[var(--rust-deep)]" />
              </div>
              <pre className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-3 py-2.5 font-mono text-[11px] text-[var(--ink)]/90 overflow-auto max-h-72 whitespace-pre-wrap">{prompt}</pre>

              <details className="mt-4 group">
                <summary className="text-xs font-semibold text-[var(--rust)] cursor-pointer select-none">Prefer to do it by hand?</summary>
                <div className="mt-3 space-y-3">
                  <div>
                    <p className="text-xs text-[var(--ink-soft)] mb-1.5">1. Web analytics — add once in your global &lt;head&gt;:</p>
                    <div className="relative bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-3 py-2.5 pr-20 font-mono text-[11px] text-[var(--ink)]/90 overflow-x-auto">
                      {scriptTag}
                      <CopyButton text={scriptTag} className="absolute right-2 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--ink-soft)] mb-1.5">2. AI-crawler tracking — server-side, fire-and-forget on page requests:</p>
                    <div className="flex gap-1 border-b border-[var(--line)] mb-2">
                      {(["next", "express", "cloudflare"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSnippetTab(t)}
                          className={`px-3 py-1.5 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                            snippetTab === t ? "border-[var(--rust)] text-[var(--rust-deep)]" : "border-transparent text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                          }`}
                        >
                          {t === "next" ? "Next.js" : t === "express" ? "Express" : "Cloudflare Worker"}
                        </button>
                      ))}
                    </div>
                    <div className="relative">
                      <pre className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-3 py-2.5 font-mono text-[11px] text-[var(--ink)]/90 overflow-auto max-h-64 whitespace-pre">{snippets[snippetTab]}</pre>
                      <CopyButton text={snippets[snippetTab]} className="absolute right-2 top-2" />
                    </div>
                  </div>
                </div>
              </details>
            </>
          ) : (
            <>
              <ol className="space-y-2 mb-4">
                {platform.steps.map((s, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-[var(--ink-soft)]">
                    <span className="w-5 h-5 rounded-full bg-[var(--rust-wash)] text-[var(--rust-deep)] text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs font-semibold text-[var(--ink)]/90 mb-1.5">The script to paste</p>
              <div className="relative bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-3 py-2.5 pr-20 font-mono text-[11px] text-[var(--ink)]/90 overflow-x-auto">
                {scriptTag}
                <CopyButton text={scriptTag} className="absolute right-2 top-1/2 -translate-y-1/2" />
              </div>
              {platform.note && <p className="text-xs text-[var(--ink-faint)] mt-3">{platform.note}</p>}

              <details className="mt-4">
                <summary className="text-xs font-semibold text-[var(--rust)] cursor-pointer select-none">Also want AI-crawler tracking?</summary>
                <div className="mt-3">
                  <p className="text-xs text-[var(--ink-soft)] mb-2">
                    AI crawlers (GPTBot, ClaudeBot, PerplexityBot…) never run JavaScript, so the script above can&apos;t see them and {platform.name} gives no server access. If your domain runs through Cloudflare, this Worker does it — no changes to {platform.name} itself:
                  </p>
                  <div className="relative">
                    <pre className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-3 py-2.5 font-mono text-[11px] text-[var(--ink)]/90 overflow-auto max-h-64 whitespace-pre">{snippets.cloudflare}</pre>
                    <CopyButton text={snippets.cloudflare} className="absolute right-2 top-2" />
                  </div>
                </div>
              </details>
            </>
          )}

          <div className="mt-4 pt-4 border-t border-[var(--line)]">
            <p className="text-[11px] font-semibold text-[var(--ink-soft)] uppercase tracking-wide mb-1">Publishing blog posts to {platform.name}</p>
            <p className="text-xs text-[var(--ink-soft)]">{platform.publishing.text}</p>
          </div>
        </div>
      )}

      {/* Test + ID */}
      <div className="panel rounded-xl p-5">
        <p className="text-sm font-semibold text-[var(--ink)] mb-1">Try it before you install</p>
        <p className="text-xs text-[var(--ink-faint)] mb-3">
          Sends a clearly-labelled sample event so you can see the charts populate. It won&apos;t mark your install as connected — only a real visit does.
        </p>
        {testError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{testError}</p>}
        <div className="flex flex-wrap items-center gap-2.5 mb-4">
          <button
            type="button"
            onClick={() => onTest("web")}
            disabled={testing}
            className="text-xs font-semibold bg-[var(--ink)] text-[var(--surface)] px-3 py-2 rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {testing ? "Sending…" : "Send test pageview"}
          </button>
          <button
            type="button"
            onClick={() => onTest("bot")}
            disabled={testing}
            className="text-xs font-semibold border border-[var(--line)] px-3 py-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--line-soft)] disabled:opacity-50 transition-colors"
          >
            Send test AI-crawler hit
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--line)] rounded-lg px-3 py-2">
          <span className="text-xs text-[var(--ink-soft)]">
            Website ID: <span className="font-mono font-semibold text-[var(--ink)]">{siteKey}</span>
          </span>
          <CopyButton text={siteKey} />
        </div>
        <div className="flex flex-wrap gap-4 mt-3">
          <a href="/docs/web-analytics" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--rust)] hover:underline">Web analytics docs</a>
          <a href="/docs/llm-analytics" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--rust)] hover:underline">AI-crawler tracking docs</a>
        </div>
      </div>
    </div>
  );
}
