"use client";

import { useState } from "react";

// Trend chart for Web/LLM Analytics — a plain bar-per-bucket chart (hourly
// buckets for the 1-day range, daily otherwise; see lib/analytics-series.ts)
// with a hover tooltip. Deliberately simpler than the Top Citations chart
// (single series, no per-domain breakdown) so it doesn't need that chart's
// multi-series color palette or its cursor-following tooltip complexity.
export function AnalyticsSeriesChart({ series }: { series: { label: string; count: number }[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  if (series.length === 0) return null;
  const max = Math.max(...series.map((s) => s.count), 1);
  const W = 600, H = 140, padT = 8, padB = 20;
  const barW = W / series.length;
  const labelStep = Math.max(1, Math.ceil(series.length / 8));
  const hovered = hoverIdx !== null ? series[hoverIdx] : null;
  const hoverLeftPct = hoverIdx !== null ? Math.min(92, Math.max(8, ((hoverIdx + 0.5) / series.length) * 100)) : 0;

  return (
    <div className="relative" onMouseLeave={() => setHoverIdx(null)}>
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
      </svg>
      {hovered && (
        <div
          className="absolute top-0 pointer-events-none panel rounded-lg shadow-lg px-2.5 py-1.5 text-xs -translate-x-1/2"
          style={{ left: `${hoverLeftPct}%` }}
        >
          <p className="font-semibold text-[var(--ink)]">{hovered.count.toLocaleString()}</p>
          <p className="text-[var(--ink-faint)] whitespace-nowrap">{hovered.label}</p>
        </div>
      )}
    </div>
  );
}
