"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { AnalyticsSetup, timeAgo, type AnalyticsStatus } from "./AnalyticsSetup";
import type { SearchConsole } from "./useSearchConsole";

export type ConnectionsView = "list" | "instructions";

function Row({ title, body, connected, detail, actions }: { title: string; body: string; connected: boolean; detail: string; actions: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border border-[var(--line)] rounded-xl px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${connected ? "bg-[var(--olive)]" : "bg-[var(--ink-faint)]/50"}`} />
          <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        </div>
        <p className="text-xs text-[var(--ink-soft)] mt-1">{body}</p>
        <p className={`text-xs mt-1 truncate ${connected ? "text-[var(--olive)] font-medium" : "text-[var(--ink-faint)]"}`}>{detail}</p>
      </div>
      <div className="flex items-center gap-3 shrink-0">{actions}</div>
    </div>
  );
}

const primary = "text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-3.5 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors whitespace-nowrap";
const secondary = "text-xs font-semibold border border-[var(--line)] text-[var(--ink-soft)] px-3.5 py-2 rounded-lg hover:bg-[var(--line-soft)] transition-colors whitespace-nowrap";
const danger = "text-xs font-semibold text-red-700/80 hover:text-red-700 underline disabled:opacity-50 whitespace-nowrap";

// Everything RankOnGeo is connected to for this site, in one popup: what's
// connected, how to connect what isn't, and a way to disconnect. The install
// steps live one click deeper so the list itself stays short.
export function ConnectionsModal({
  view,
  onView,
  onClose,
  status,
  gsc,
  brandId,
  siteKey,
  domain,
  isFree,
  onUpgrade,
  onTest,
  testing,
  testError,
  onRefreshStatus,
  onChooseSite,
}: {
  view: ConnectionsView | null;
  onView: (v: ConnectionsView) => void;
  onClose: () => void;
  status: AnalyticsStatus | null;
  gsc: SearchConsole;
  brandId: string;
  siteKey: string;
  domain: string;
  isFree: boolean;
  onUpgrade: () => void;
  onTest: (type: "web" | "bot") => void;
  testing: boolean;
  testError: string;
  onRefreshStatus: () => void;
  onChooseSite: () => void;
}) {
  const open = view !== null;

  // While the popup is open, keep checking so a row turns green on its own the
  // moment the first real visit or crawl arrives.
  const refreshRef = useRef(onRefreshStatus);
  refreshRef.current = onRefreshStatus;
  useEffect(() => {
    if (!open) return;
    const t = setInterval(() => refreshRef.current(), 6000);
    return () => clearInterval(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const g = status?.gsc;
  const connectHref = `/api/gsc/connect?brandId=${brandId}`;
  const instructionsAction = (label: string) => (isFree ? <button onClick={onUpgrade} className={primary}>Upgrade to unlock</button> : <button onClick={() => onView("instructions")} className={secondary}>{label}</button>);

  async function disconnectGoogle() {
    await gsc.disconnect();
    onRefreshStatus();
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="connections-title"
        className="bg-[var(--surface)] rounded-2xl w-full max-w-2xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-[var(--line)] flex items-start justify-between gap-4">
          <div>
            {view === "instructions" && (
              <button onClick={() => onView("list")} className="text-xs font-semibold text-[var(--rust)] hover:text-[var(--rust-deep)] mb-1">← All connections</button>
            )}
            <h2 id="connections-title" className="text-lg font-semibold text-[var(--ink)]">
              {view === "instructions" ? "Connect your site" : "Connections"}
            </h2>
            <p className="text-xs text-[var(--ink-faint)] mt-0.5">
              {view === "instructions" ? "Pick where your site is built for exact steps. This closes with the X." : `What's connected to ${domain || "this site"}. Disconnect anything here.`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)] text-xl leading-none shrink-0">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {view === "list" && (
            <div className="space-y-3">
              <Row
                title="Website tracking"
                body="Visitors, pageviews and the people arriving from ChatGPT and other AI answers."
                connected={!!status?.web.connected}
                detail={status?.web.connected ? `Connected · last visit ${timeAgo(status.web.lastSeenAt)}` : "Not connected"}
                actions={instructionsAction(status?.web.connected ? "Instructions" : "Connect")}
              />
              <Row
                title="AI-crawler tracking"
                body="GPTBot, ClaudeBot, PerplexityBot and other AI crawlers reading your pages. Optional."
                connected={!!status?.bot.connected}
                detail={status?.bot.connected ? `Connected · last crawl ${timeAgo(status.bot.lastSeenAt)}` : "Not connected"}
                actions={instructionsAction(status?.bot.connected ? "Instructions" : "Connect")}
              />
              {g?.configured && (
                <Row
                  title="Google Search Console"
                  body="Search clicks, impressions, top queries and rankings, merged into your analytics. Read-only."
                  connected={!!g.connected}
                  detail={
                    gsc.data?.reconnect
                      ? "Access expired · reconnect to keep Google data"
                      : g.connected
                        ? `Connected · ${(g.siteUrl ?? "").replace(/^sc-domain:/, "")}${g.email ? ` · ${g.email}` : ""}`
                        : g.linked
                          ? `${g.email ?? "Google account"} linked · choose your site`
                          : "Not connected"
                  }
                  actions={
                    <>
                      {gsc.data?.reconnect && <a href={connectHref} className={primary}>Reconnect</a>}
                      {!gsc.data?.reconnect && g.linked && !g.connected && <button onClick={onChooseSite} className={primary}>Choose site</button>}
                      {!g.linked && <a href={connectHref} className={primary}>Connect</a>}
                      {/* Every brand can be on a different Google account (an agency running
                          several clients' Search Console, say) — this switches just this
                          brand's connection without touching any other brand's. */}
                      {g.linked && <a href={`${connectHref}&switchAccount=1`} className={secondary}>Change account</a>}
                      {g.linked && <button onClick={disconnectGoogle} disabled={gsc.busy} className={danger}>Disconnect</button>}
                    </>
                  }
                />
              )}
              <p className="text-xs text-[var(--ink-faint)] pt-1">
                Website and AI-crawler tracking run from a snippet on your own site, so to stop them, remove that snippet. Disconnecting Google also revokes RankOnGeo&apos;s access in your Google account.
              </p>
            </div>
          )}

          {view === "instructions" && (
            siteKey ? (
              <AnalyticsSetup siteKey={siteKey} domain={domain} onTest={onTest} testing={testing} testError={testError} />
            ) : (
              <div className="flex items-center justify-center py-16"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
