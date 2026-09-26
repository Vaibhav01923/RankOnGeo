"use client";

import { useCallback, useEffect, useState } from "react";
import { changePct, num, pct, signed, type Delta, type Report, type ReportPeriod } from "@/lib/report";

export type ReportDestination = {
  id: string;
  name: string;
  kind: "slack" | "webhook" | "discord" | "email";
  url?: string | null;
  email?: string | null;
  status: "active" | "paused";
  scan_alerts?: boolean;
  weekly_report?: boolean;
  monthly_report?: boolean;
};

export type ReportDelivery = {
  id: string;
  event_type: string;
  status: "succeeded" | "failed";
  error_detail?: string | null;
  created_at: string;
  alert_destinations?: { name: string; kind: string } | null;
};

type SendResult = { destinationId: string; name: string; kind: string; ok: boolean; skipped?: boolean; error?: string };

const KIND_LABEL: Record<string, string> = { slack: "Slack", discord: "Discord", webhook: "Webhook", email: "Email" };
const EVENT_LABEL: Record<string, string> = { weekly_report: "Weekly report", monthly_report: "Monthly report", report_manual: "Report (sent now)", scan_completed: "Scan alert" };

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const shortDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "");

function Change({ delta, suffix = "" }: { delta: Delta | { change: number | null }; suffix?: string }) {
  const c = delta.change;
  if (c === null) return <span className="text-[11px] text-[var(--ink-faint)]">no earlier data</span>;
  if (c === 0) return <span className="text-[11px] text-[var(--ink-faint)]">no change</span>;
  const p = "previous" in delta ? changePct(delta as Delta) : null;
  return (
    <span className={`text-[11px] font-medium ${c > 0 ? "text-[var(--olive)]" : "text-red-700"}`}>
      {c > 0 ? "▲" : "▼"} {signed(c)}
      {suffix}
      {p !== null && suffix === "" ? ` (${signed(p)}%)` : ""}
    </span>
  );
}

function Kpi({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div className="panel rounded-xl px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)]">{label}</p>
      <p className="font-signal-serif text-3xl text-[var(--ink)] leading-tight mt-0.5">{value}</p>
      <div className="mt-0.5 min-h-[16px]">{children}</div>
    </div>
  );
}

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="panel rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-[var(--ink)]">{title}</p>
        {right}
      </div>
      {children}
    </div>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-[var(--ink-faint)]">{children}</p>;

export function ReportsTab({
  brandId,
  isFreeTier,
  onUpgrade,
  destinations,
  deliveries,
  onAddDestination,
  onUpdateDestination,
  onDeleteDestination,
  onDeliveriesChanged,
}: {
  brandId: string;
  isFreeTier: boolean;
  onUpgrade: () => void;
  destinations: ReportDestination[];
  deliveries: ReportDelivery[];
  onAddDestination: () => void;
  onUpdateDestination: (id: string, patch: Partial<ReportDestination>) => Promise<void>;
  onDeleteDestination: (id: string) => void;
  onDeliveriesChanged: () => void;
}) {
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [offset, setOffset] = useState(0);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sending, setSending] = useState<string | null>(null); // "all" or a destination id
  const [sendResults, setSendResults] = useState<SendResult[] | null>(null);
  const [sendError, setSendError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/reports?brandId=${brandId}&period=${period}&offset=${offset}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setError(d.error ?? "Couldn't load this report.");
      else setReport(d.report);
    } catch {
      setError("Couldn't load this report.");
    } finally {
      setLoading(false);
    }
  }, [brandId, period, offset]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function send(destinationId?: string) {
    if (isFreeTier) { onUpgrade(); return; }
    setSending(destinationId ?? "all");
    setSendResults(null);
    setSendError("");
    try {
      const res = await fetch("/api/reports/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId, period, offset, destinationId }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (d.reason === "upgrade") onUpgrade();
        else setSendError(d.error ?? "Couldn't send the report.");
      } else setSendResults(d.results ?? []);
      onDeliveriesChanged();
    } catch {
      setSendError("Couldn't send the report.");
    } finally {
      setSending(null);
    }
  }

  const activeCount = destinations.filter((d) => d.status === "active").length;
  const switchTo = (p: ReportPeriod) => { setPeriod(p); setOffset(0); setReport(null); };
  const quick = period === "weekly" ? [["This week", 0], ["Last week", -1]] as const : [["This month", 0], ["Last month", -1]] as const;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--ink)]">Reports</h2>
          <p className="text-sm text-[var(--ink-faint)] mt-0.5">Everything RankOnGeo did for you, and what came of it. Read it here or get it sent to you automatically.</p>
        </div>
        <div className="inline-flex rounded-lg border border-[var(--line)] p-0.5 bg-[var(--surface)]" role="group" aria-label="Report period">
          {(["weekly", "monthly"] as const).map((p) => (
            <button key={p} onClick={() => switchTo(p)} aria-pressed={period === p} className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${period === p ? "bg-[var(--rust)] text-[var(--surface)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}>
              {p === "weekly" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setOffset((o) => o - 1)} aria-label="Earlier" className="w-8 h-8 rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors">‹</button>
        <button onClick={() => setOffset((o) => Math.min(0, o + 1))} disabled={offset === 0} aria-label="Later" className="w-8 h-8 rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line-soft)] disabled:opacity-30 transition-colors">›</button>
        <span className="text-sm font-semibold text-[var(--ink)] ml-1">{report?.range.label ?? "…"}</span>
        {report?.range.inProgress && <span className="text-[10px] font-semibold uppercase tracking-wide bg-[var(--olive-wash)] text-[var(--olive)] px-2 py-0.5 rounded-full">so far</span>}
        <div className="flex gap-1.5 ml-2">
          {quick.map(([label, o]) => (
            <button key={label} onClick={() => setOffset(o)} className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${offset === o ? "bg-[var(--line)] text-[var(--ink)] font-medium" : "panel text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}>{label}</button>
          ))}
        </div>
        <button onClick={() => send()} disabled={sending !== null || loading} className="ml-auto text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] disabled:opacity-50 transition-colors">
          {sending === "all" ? "Sending…" : `Send this report now${activeCount ? ` to ${activeCount} destination${activeCount === 1 ? "" : "s"}` : ""}`}
        </button>
      </div>

      {(sendResults || sendError) && (
        <div role="status" className={`rounded-lg border px-4 py-3 text-xs ${sendError || sendResults?.some((r) => !r.ok) ? "border-red-500/25 bg-red-500/10 text-red-700" : "border-[var(--olive)]/40 bg-[var(--olive-wash)] text-[var(--olive)]"}`}>
          {sendError && <p>{sendError}</p>}
          {sendResults?.map((r) => (
            <p key={r.destinationId}>
              {r.ok ? "✓ Sent to" : "✗ Couldn't send to"} {r.name} ({KIND_LABEL[r.kind] ?? r.kind}){r.error ? `: ${r.error}` : ""}
            </p>
          ))}
        </div>
      )}

      {error && <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-700">{error} <button onClick={load} className="underline font-medium">Try again</button></div>}

      {loading && !report && (
        <div className="panel rounded-xl p-10 text-center">
          <span className="inline-block w-6 h-6 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <p className="text-sm text-[var(--ink-soft)] mt-3">Building your report…</p>
        </div>
      )}

      {report && (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <div className="panel rounded-xl px-5 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)]">{period === "weekly" ? "Weekly" : "Monthly"} summary</p>
            <p className="font-signal-serif text-xl text-[var(--ink)] mt-1 leading-snug">{report.headline}.</p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
            <Kpi label="AI visibility" value={report.visibility.score === null ? "—" : `${report.visibility.score}%`}>
              {report.visibility.score === null ? <span className="text-[11px] text-[var(--ink-faint)]">no scan yet</span> : <Change delta={report.visibility} suffix=" pts" />}
            </Kpi>
            <Kpi label="Articles published" value={String(report.articles.publishedCount)}>
              <span className="text-[11px] text-[var(--ink-faint)]">{report.articles.previousPublishedCount} the period before</span>
            </Kpi>
            {report.traffic.available && (
              <>
                <Kpi label="Visitors" value={num(report.traffic.visitors.value)}><Change delta={report.traffic.visitors} /></Kpi>
                <Kpi label="From AI answers" value={num(report.traffic.aiVisits.value)}><Change delta={report.traffic.aiVisits} /></Kpi>
              </>
            )}
            {report.crawlers.available && <Kpi label="AI crawler visits" value={num(report.crawlers.total.value)}><Change delta={report.crawlers.total} /></Kpi>}
            {report.search.connected && report.search.clicks && <Kpi label="Google clicks" value={num(report.search.clicks.value)}><Change delta={report.search.clicks} /></Kpi>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="What RankOnGeo did">
              <ul className="space-y-2">
                {report.activity.map((line) => (
                  <li key={line} className="flex gap-2 text-sm text-[var(--ink-soft)]"><span className="text-[var(--olive)] shrink-0">✓</span><span>{line}</span></li>
                ))}
              </ul>
            </Card>

            <Card title="AI visibility by engine" right={report.visibility.lastScanAt ? <span className="text-[11px] text-[var(--ink-faint)]">{report.visibility.scannedInPeriod ? `${report.visibility.scans} scan${report.visibility.scans === 1 ? "" : "s"} this period` : `last scan ${shortDate(report.visibility.lastScanAt)}`}</span> : null}>
              {report.visibility.engines.length === 0 ? (
                <Empty>No scan has run yet. Your first scan starts from the Overview tab.</Empty>
              ) : (
                <div className="space-y-2.5">
                  {report.visibility.engines.map((e) => (
                    <div key={e.engine}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-[var(--ink-soft)]">{e.label}</span>
                        <span className="font-semibold text-[var(--ink)]">{e.score}% {e.change ? <span className={e.change > 0 ? "text-[var(--olive)]" : "text-red-700"}>({signed(e.change)})</span> : null}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-[var(--line)] overflow-hidden"><div className="h-full rounded-full bg-[var(--rust)]" style={{ width: `${Math.max(2, e.score)}%` }} /></div>
                    </div>
                  ))}
                </div>
              )}
              {report.visibility.topGaps.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--line)]">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)] mb-1.5">Biggest gaps · {report.visibility.gapsNow} open{report.visibility.gapsPrevious !== null ? ` (${report.visibility.gapsPrevious} at the scan before)` : ""}</p>
                  <ul className="space-y-1.5">
                    {report.visibility.topGaps.map((g) => (
                      <li key={g.prompt} className="text-xs text-[var(--ink-soft)]">“{g.prompt}” <span className="text-[var(--ink-faint)]">missing from {g.engines.join(", ")}{g.competitor ? `; ${g.competitor} shown instead` : ""}</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>

          <Card title={`Articles published · ${report.articles.publishedCount}`} right={report.articles.draftsWritten ? <span className="text-[11px] text-[var(--ink-faint)]">{report.articles.draftsWritten} more draft{report.articles.draftsWritten === 1 ? "" : "s"} waiting</span> : null}>
            {report.articles.published.length === 0 ? (
              <Empty>{report.articles.autopublishOn ? "Nothing went live in this period. Auto-publishing is on, so the next article is on its way." : "Nothing went live in this period. Turn on auto-publishing in the SEO & GEO tab and RankOnGeo will write and publish for you."}</Empty>
            ) : (
              <ul className="divide-y divide-[var(--line)]">
                {report.articles.published.map((a) => (
                  <li key={a.id} className="py-2.5 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {a.url ? <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-[var(--rust)] hover:underline break-words">{a.title}</a> : <p className="text-sm font-medium text-[var(--ink)] break-words">{a.title}</p>}
                      <p className="text-[11px] text-[var(--ink-faint)] mt-0.5">{shortDate(a.publishedAt)}{a.keyword ? ` · ${a.keyword}` : ""} · {a.source === "autopilot" ? "written by Autopilot" : "written by you"}</p>
                    </div>
                    {report.traffic.available && a.url && (
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold text-[var(--ink)]">{a.views}</p>
                        <p className="text-[10px] text-[var(--ink-faint)]">view{a.views === 1 ? "" : "s"}{a.aiVisits ? ` · ${a.aiVisits} from AI` : ""}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Traffic">
              {!report.traffic.available ? (
                <Empty>Traffic, AI referrals and crawler tracking are part of the paid plan. <button onClick={onUpgrade} className="underline font-medium text-[var(--rust)]">Upgrade</button></Empty>
              ) : report.traffic.pageviews.value === 0 ? (
                <Empty>No visits were tracked in this period. Make sure the analytics snippet is installed (Analytics → Connections).</Empty>
              ) : (
                <div className="space-y-3 text-sm">
                  <p className="text-[var(--ink-soft)]"><span className="font-semibold text-[var(--ink)]">{num(report.traffic.pageviews.value)}</span> pageviews from <span className="font-semibold text-[var(--ink)]">{num(report.traffic.visitors.value)}</span> visitors</p>
                  {report.traffic.aiSources.length > 0 && <p className="text-xs text-[var(--ink-soft)]"><span className="font-semibold text-[var(--ink)]">From AI answers:</span> {report.traffic.aiSources.map((s) => `${s.label} ${s.count}`).join(" · ")}</p>}
                  {report.traffic.topPages.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)] mb-1">Top pages</p>
                      {report.traffic.topPages.map((p) => <p key={p.path} className="flex justify-between text-xs text-[var(--ink-soft)]"><span className="font-mono truncate mr-3">{p.path}</span><span>{p.views}</span></p>)}
                    </div>
                  )}
                  {report.traffic.topReferrers.length > 0 && <p className="text-xs text-[var(--ink-soft)]"><span className="font-semibold text-[var(--ink)]">Top sources:</span> {report.traffic.topReferrers.map((s) => `${s.label} ${s.count}`).join(" · ")}</p>}
                </div>
              )}
            </Card>

            <Card title="AI crawlers">
              {!report.crawlers.available ? (
                <Empty>Part of the paid plan.</Empty>
              ) : report.crawlers.total.value === 0 ? (
                <Empty>No AI crawler visits were recorded in this period.</Empty>
              ) : (
                <div className="space-y-2 text-xs text-[var(--ink-soft)]">
                  <p className="text-sm"><span className="font-semibold text-[var(--ink)]">{num(report.crawlers.total.value)}</span> visits from AI crawlers</p>
                  <p>{report.crawlers.byBot.map((b) => `${b.label} ${b.count}`).join(" · ")}</p>
                  {report.crawlers.topPages.length > 0 && <p><span className="font-semibold text-[var(--ink)]">Most crawled:</span> {report.crawlers.topPages.map((p) => `${p.path} (${p.count})`).join(", ")}</p>}
                </div>
              )}
            </Card>

            <Card title="Google Search">
              {!report.search.connected ? (
                <Empty>{report.search.note}</Empty>
              ) : report.search.clicks && report.search.impressions ? (
                <div className="space-y-2 text-sm text-[var(--ink-soft)]">
                  <p><span className="font-semibold text-[var(--ink)]">{num(report.search.impressions.value)}</span> impressions · <span className="font-semibold text-[var(--ink)]">{num(report.search.clicks.value)}</span> clicks{report.search.ctr !== null && report.search.impressions.value ? ` · ${pct(report.search.ctr, 1)} click rate` : ""}</p>
                  {report.search.position !== null && <p className="text-xs">Average position <span className="font-semibold text-[var(--ink)]">{report.search.position.toFixed(1)}</span>{report.search.previousPosition !== null ? ` (was ${report.search.previousPosition.toFixed(1)})` : ""}</p>}
                  {report.search.topQueries.length > 0 && <div><p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)] mb-1">Top searches</p>{report.search.topQueries.map((q) => <p key={q.label} className="flex justify-between text-xs"><span className="truncate mr-3">{q.label}</span><span>{q.clicks} clicks</span></p>)}</div>}
                  <p className="text-[11px] text-[var(--ink-faint)]">{report.search.note}</p>
                </div>
              ) : (
                <Empty>{report.search.note}</Empty>
              )}
            </Card>

            <Card title="Reddit engagement">
              {report.reddit.tasks === 0 ? (
                <Empty>No Reddit tasks were ordered in this period.</Empty>
              ) : (
                <p className="text-sm text-[var(--ink-soft)]"><span className="font-semibold text-[var(--ink)]">{report.reddit.tasks}</span> task{report.reddit.tasks === 1 ? "" : "s"} ({report.reddit.completed} completed) · {report.reddit.upvotes} upvotes ordered · {report.reddit.comments} post{report.reddit.comments === 1 ? "" : "s"}/comments · {num(report.reddit.creditsSpent)} credits used</p>
              )}
            </Card>
          </div>

          {report.articles.upcoming.length > 0 && (
            <Card title="Coming up next">
              <ul className="space-y-1.5">
                {report.articles.upcoming.slice(0, 5).map((u) => (
                  <li key={u.keyword} className="flex justify-between gap-4 text-sm text-[var(--ink-soft)]"><span className="min-w-0 break-words">{u.keyword} <span className="text-[10px] uppercase tracking-wide text-[var(--ink-faint)]">{u.kind === "prompt" ? "AI prompt" : "keyword"}</span></span><span className="text-xs text-[var(--ink-faint)] shrink-0">{u.scheduledAt ? `about ${shortDate(u.scheduledAt)}` : ""}</span></li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}

      {/* ---- delivery ---- */}
      <div className="panel rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Get this report automatically</p>
            <p className="text-xs text-[var(--ink-faint)] mt-0.5">Weekly reports go out Monday morning (09:00 UTC) for the week that just ended; monthly reports on the 1st for the month that just ended.</p>
          </div>
          <button onClick={onAddDestination} className="text-xs font-medium bg-[var(--rust)] text-[var(--surface)] px-3 py-1.5 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">+ Add email, Slack or Discord</button>
        </div>
        {destinations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-[var(--ink-soft)] mb-1">Not sent anywhere yet.</p>
            <p className="text-xs text-[var(--ink-faint)]">Add an email address, a Slack or Discord channel, or a webhook, and pick weekly, monthly or both.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="border-b border-[var(--line)]">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Destination</th>
                  {["Weekly", "Monthly", "Scan alerts"].map((h) => <th key={h} className="px-3 py-3 text-center text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">{h}</th>)}
                  <th className="px-3 py-3 text-center text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Status</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {destinations.map((d) => (
                  <tr key={d.id}>
                    <td className="px-5 py-3">
                      <p className="text-sm font-medium text-[var(--ink)]">{d.name}</p>
                      <p className="text-[11px] text-[var(--ink-faint)]">{KIND_LABEL[d.kind] ?? d.kind}{d.kind === "email" && d.email ? ` · ${d.email}` : ""}</p>
                    </td>
                    {(["weekly_report", "monthly_report", "scan_alerts"] as const).map((key) => (
                      <td key={key} className="px-3 py-3 text-center">
                        <input type="checkbox" checked={d[key] ?? (key === "scan_alerts")} onChange={(e) => onUpdateDestination(d.id, { [key]: e.target.checked })} aria-label={`${d.name}: ${key.replace("_", " ")}`} className="w-4 h-4 accent-[var(--rust)]" />
                      </td>
                    ))}
                    <td className="px-3 py-3 text-center">
                      <button onClick={() => onUpdateDestination(d.id, { status: d.status === "active" ? "paused" : "active" })} className={`text-[10px] font-medium px-2 py-0.5 rounded ${d.status === "active" ? "bg-[var(--rust)]/10 text-[var(--rust)]" : "bg-[var(--line)] text-[var(--ink-faint)]"}`}>{d.status === "active" ? "Active" : "Paused"}</button>
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <button onClick={() => send(d.id)} disabled={sending !== null || d.status !== "active"} className="text-[11px] font-medium text-[var(--rust)] hover:underline disabled:opacity-40 disabled:no-underline mr-3">{sending === d.id ? "Sending…" : "Send this report here"}</button>
                      <button onClick={() => onDeleteDestination(d.id)} className="text-[10px] text-red-700/80 hover:text-red-700">Remove</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-4 border-t border-[var(--line)]">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--ink-faint)] mb-2">Recent deliveries</p>
          {deliveries.length === 0 ? (
            <p className="text-xs text-[var(--ink-faint)]">Nothing sent yet.</p>
          ) : (
            <div className="space-y-2">
              {deliveries.slice(0, 8).map((d) => (
                <div key={d.id} className="flex items-start gap-3 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-[var(--ink-soft)]">{EVENT_LABEL[d.event_type] ?? d.event_type} · {d.alert_destinations?.name ?? "—"} ({KIND_LABEL[d.alert_destinations?.kind ?? ""] ?? d.alert_destinations?.kind ?? "—"})</p>
                    {d.error_detail && <p className="text-[10px] text-red-700 mt-0.5 break-words">{d.error_detail}</p>}
                  </div>
                  <span className="text-[10px] text-[var(--ink-faint)] shrink-0">{timeAgo(d.created_at)}</span>
                  <span className={`text-[10px] font-medium shrink-0 ${d.status === "succeeded" ? "text-[var(--olive)]" : "text-red-700"}`}>{d.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
