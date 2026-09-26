"use client";

import { useState } from "react";

// Trend chart for Web/LLM Analytics — a plain bar-per-bucket chart (hourly
// buckets for the 1-day range, daily otherwise; see lib/analytics-series.ts)
// with a hover tooltip. Deliberately simpler than the Top Citations chart
// (single series, no per-domain breakdown) so it doesn't need that chart's
// multi-series color palette or its cursor-following tooltip complexity.
//
// `overlay` adds a second line (Google clicks) matched to the bars by label, so
// the site's own traffic and Google's numbers read off one chart. Left out for
// the hourly 24-hour view, where Google has no hourly data to match.
export function AnalyticsSeriesChart({
  series,
  overlay,
  primaryName = "Pageviews",
  overlayName = "Google clicks · 2-day delay",
}: {
  series: { label: string; count: number }[];
  overlay?: { label: string; count: number }[];
  primaryName?: string;
  overlayName?: string;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (series.length === 0) return null;
  const overlayByLabel = overlay ? new Map(overlay.map((o) => [o.label, o.count])) : null;
  const overlayCounts = overlayByLabel ? series.map((s) => overlayByLabel.get(s.label) ?? 0) : null;
  const hasOverlay = !!overlayCounts && overlayCounts.some((c) => c > 0);
  const max = Math.max(...series.map((s) => s.count), ...(hasOverlay ? overlayCounts! : []), 1);
  const W = 600, H = 140, padT = 8, padB = 20;
  const barW = W / series.length;
  const labelStep = Math.max(1, Math.ceil(series.length / 8));
  const hovered = hoverIdx !== null ? series[hoverIdx] : null;
  const hoverLeftPct = hoverIdx !== null ? Math.min(92, Math.max(8, ((hoverIdx + 0.5) / series.length) * 100)) : 0;

  const linePoints = hasOverlay
    ? overlayCounts!.map((c, i) => `${(i * barW + barW / 2).toFixed(1)},${(H - padB - (c / max) * (H - padT - padB)).toFixed(1)}`).join(" ")
    : "";

  return (
    <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
      {hasOverlay && (
        <div className="flex flex-wrap items-center gap-4 mb-2 text-[11px] text-[var(--ink-soft)]">
          <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-[var(--rust)] opacity-70" />{primaryName}</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-0.5 bg-[var(--olive)]" />{overlayName}</span>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {series.map((s, i) => {
          const barH = s.count > 0 ? Math.max((s.count / max) * (H - padT - padB), 2) : 0;
          const x = i * barW;
          const y = H - padB - barH;
          return (
            <g key={i} onMouseEnter={() => setHoverIdx(i)}>
              <rect x={x} y={padT} width={barW} height={H - padT - padB} fill="transparent" />
              <rect x={x + barW * 0.15} y={y} width={Math.max(barW * 0.7, 1)} height={barH} rx="2" fill="var(--rust)" opacity={hoverIdx === i ? 1 : 0.55} />
              {i % labelStep === 0 && (
                <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="8" fill="var(--ink-faint)">{s.label}</text>
              )}
            </g>
          );
        })}
        {hasOverlay && <polyline points={linePoints} fill="none" stroke="var(--olive)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />}
      </svg>
      {hovered && (
        <div
          className="absolute top-0 pointer-events-none panel rounded-lg shadow-lg px-2.5 py-1.5 text-xs -translate-x-1/2"
          style={{ left: `${hoverLeftPct}%` }}
        >
          <p className="font-semibold text-[var(--ink)]">{hovered.count.toLocaleString()}{hasOverlay && <span className="font-normal text-[var(--ink-faint)]"> {primaryName.toLowerCase()}</span>}</p>
          {hasOverlay && <p className="font-semibold text-[var(--olive)]">{overlayCounts![hoverIdx!].toLocaleString()} <span className="font-normal text-[var(--ink-faint)]">Google clicks</span></p>}
          <p className="text-[var(--ink-faint)] whitespace-nowrap">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}
