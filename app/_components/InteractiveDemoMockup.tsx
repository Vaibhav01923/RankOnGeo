"use client";
import { useState } from "react";

/* Engine hues — kept in sync with the real dashboard's palette (app/dashboard/page.tsx). */
const ENG_COLORS: Record<string, string> = {
  ChatGPT: "#4f8a5b",
  Claude: "#a8791f",
  Gemini: "#3f6fa8",
  Perplexity: "#2f8f96",
  "Google AI": "#6f7f3f",
};
const ENGINES = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Google AI"];

const LINKEDIN_HEX = "#0A66C2";

/* shared skin */
const card = "rounded-xl bg-[var(--surface)] border border-[var(--line)]";
const kpiLabel = "text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ink-faint)] mb-1";

// ── OVERVIEW ──────────────────────────────────────────────────────
// Mirrors the real dashboard overview: composite ring + trend, per-engine
// score cards ("x/y prompts · avg #"), and the tracked-prompts table. No
// invented metrics — the product doesn't report mention counts or sentiment.
function OverviewContent() {
  const trend = [70, 74, 72, 78, 80, 79, 83, 86, 84, 88, 90, 88, 91, 90, 92];
  const max = Math.max(...trend), min = Math.min(...trend);
  const norm = trend.map((v) => ((v - min) / (max - min)) * 55);
  const poly = norm.map((v, i) => `${i * 27 + 8},${60 - v}`).join(" ");
  const lastX = 8 + 14 * 27, lastY = 60 - norm[14];
  const engines = [
    { name: "ChatGPT", pct: 95, detail: "19/20 prompts · avg #2.2" },
    { name: "Gemini", pct: 90, detail: "18/20 prompts · avg #1.9" },
    { name: "Google AI", pct: 90, detail: "18/20 prompts · avg #1.6" },
  ];
  const rows: { text: string; marks: string[]; vis: number }[] = [
    { text: "Cypress alternative that supports WebKit", marks: ["#1", "#1", "✓"], vis: 100 },
    { text: "alternative to Selenium", marks: ["—", "#1", "✓"], vis: 67 },
    { text: "best Selenium alternatives for modern web apps", marks: ["—", "#2", "#3"], vis: 67 },
    { text: "Selenium alternative with auto-waiting assertions", marks: ["#2", "#1", "#1"], vis: 100 },
    { text: "alternative to Puppeteer", marks: ["#1", "#1", "✓"], vis: 100 },
    { text: "best Puppeteer alternatives for cross-browser testing", marks: ["#1", "#2", "#1"], vis: 100 },
    { text: "Puppeteer alternative that supports Firefox and WebKit", marks: ["#1", "✓", "✓"], vis: 100 },
    { text: "alternative to WebdriverIO", marks: ["—", "#3", "#1"], vis: 67 },
    { text: "best WebdriverIO alternatives for TypeScript e2e testing", marks: ["—", "#2", "#1"], vis: 67 },
    { text: "alternative to TestCafe", marks: ["#2", "#3", "✓"], vis: 100 },
    { text: "TestCafe alternative with better trace debugging", marks: ["—", "#2", "#1"], vis: 67 },
    { text: "best end-to-end testing framework for TypeScript teams", marks: ["—", "#2", "✓"], vis: 67 },
    { text: "Playwright pricing", marks: ["#1", "#1", "✓"], vis: 100 },
    { text: "Is Playwright free", marks: ["✓", "#1", "#2"], vis: 100 },
    { text: "Playwright review", marks: ["#2", "#1", "—"], vis: 67 },
    { text: "best browser automation tool for QA teams", marks: ["#1", "—", "#3"], vis: 67 },
    { text: "Playwright vs Selenium which is better", marks: ["—", "#2", "—"], vis: 33 },
  ];
  const R = 41, C = 2 * Math.PI * R;
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--rust)]">Overview</p>
      <h2 className="font-signal-serif mb-0.5 text-2xl text-[var(--ink)]">AI Visibility</h2>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">Visibility up to 92% composite, across ChatGPT, Gemini, Google AI.</p>

      <div className={`${card} mb-3 flex flex-col items-center gap-2 p-4`}>
        <div className="relative h-24 w-24">
          <svg width="96" height="96" viewBox="0 0 96 96" style={{ transform: "rotate(-90deg)" }} aria-hidden="true">
            <circle cx="48" cy="48" r={R} fill="none" stroke="var(--line)" strokeWidth="8" />
            <circle cx="48" cy="48" r={R} fill="none" stroke="var(--rust)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${0.92 * C} ${C}`} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-signal-serif text-xl leading-none text-[var(--ink)]">92%</span>
            <span className="mt-0.5 text-[7px] font-semibold uppercase tracking-wider text-[var(--ink-faint)]">Composite</span>
          </div>
        </div>
        <p className="text-[11px] text-[var(--ink-soft)]">Composite visibility across 5 AI engines</p>
        <svg width="220" height="38" viewBox="0 0 390 65" aria-hidden="true">
          <defs>
            <linearGradient id="demoSpark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="rgba(177,85,46,.25)" />
              <stop offset="1" stopColor="rgba(177,85,46,0)" />
            </linearGradient>
          </defs>
          <polygon points={`8,60 ${poly} ${lastX},60`} fill="url(#demoSpark)" />
          <polyline points={poly} fill="none" stroke="#b1552e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={lastX} cy={lastY} r="3.5" fill="#b1552e" />
        </svg>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2.5">
        {engines.map((e) => (
          <div key={e.name} className={`${card} p-3.5`}>
            <p className="mb-1 text-xs font-semibold text-[var(--ink)]">{e.name}</p>
            <p className="font-signal-mono text-2xl font-semibold text-[var(--ink)]">{e.pct}%</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">{e.detail}</p>
          </div>
        ))}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--ink)]/90">Tracked prompts</p>
          <p className="font-signal-mono text-[10px] text-[var(--ink-faint)]">20 total</p>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5 last:border-0">
            <span className="w-4 shrink-0 font-signal-mono text-[10px] text-[var(--ink-faint)]">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--ink)]/90">{r.text}</span>
            {r.marks.map((m, j) => (
              <span key={j} className="w-6 shrink-0 text-center font-signal-mono text-[10px] font-bold" style={{ color: m === "—" ? "var(--ink-faint)" : "var(--rust)" }}>
                {m}
              </span>
            ))}
            <span className="w-9 shrink-0 text-right font-signal-mono text-[11px] font-semibold text-[var(--ink)]">{r.vis}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ENGINES ───────────────────────────────────────────────────────
function EnginesContent() {
  const scans: Array<{ overall: number; data: Record<string, number>; time: string }> = [
    { overall: 74, data: { ChatGPT: 80, Claude: 78, Gemini: 72, Perplexity: 69, "Google AI": 79 }, time: "Jun 24, 2026, 8:00 AM" },
    { overall: 71, data: { ChatGPT: 75, Claude: 74, Gemini: 68, Perplexity: 71, "Google AI": 77 }, time: "Jun 21, 2026, 8:00 AM" },
    { overall: 68, data: { ChatGPT: 73, Claude: 70, Gemini: 65, Perplexity: 64, "Google AI": 74 }, time: "Jun 18, 2026, 8:00 AM" },
  ];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Engines</h2>
      <div className="space-y-2.5">
        {scans.map((scan, i) => (
          <div key={i} className={`${card} flex items-center gap-4 px-5 py-4`}>
            <span className="w-14 shrink-0 font-signal-mono text-3xl font-semibold text-[var(--ink)]">{scan.overall}%</span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--ink-soft)]">
                {ENGINES.map((e) => (
                  <span key={e}>
                    <span className="font-medium text-[var(--ink)]/80">{e}:</span>{" "}
                    <span className="text-[var(--ink-soft)]">{scan.data[e]}%</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[var(--ink-faint)]">{scan.time}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              {ENGINES.map((e) => (
                <span key={e} className="h-2 w-2 rounded-full" style={{ background: ENG_COLORS[e] }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PROMPTS ───────────────────────────────────────────────────────
const PROMPT_ENGINE_COLORS: Record<string, string> = { gpt: ENG_COLORS.ChatGPT, gemini: ENG_COLORS.Gemini, google: ENG_COLORS["Google AI"] };
const PROMPT_TYPE_COLORS: Record<string, string> = { branded: "#a855f7", competitor: "#b1552e", commercial: "#3b82f6" };

function PromptsContent() {
  const [search, setSearch] = useState("");
  const rows: { text: string; vis: number; engines: Record<"gpt" | "gemini" | "google", boolean>; competing: string; type: string }[] = [
    { text: "Playwright review", vis: 67, engines: { gpt: true, gemini: true, google: false }, competing: "Selenium", type: "branded" },
    { text: "Playwright pricing", vis: 100, engines: { gpt: true, gemini: true, google: true }, competing: "—", type: "branded" },
    { text: "Is Playwright free", vis: 100, engines: { gpt: true, gemini: true, google: true }, competing: "—", type: "branded" },
    { text: "best browser automation tool for QA teams", vis: 67, engines: { gpt: true, gemini: false, google: true }, competing: "Selenium", type: "commercial" },
    { text: "Playwright vs Selenium which is better", vis: 33, engines: { gpt: false, gemini: true, google: false }, competing: "Selenium", type: "competitor" },
  ];
  const filtered = rows.filter((r) => !search || r.text.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">Prompts</h2>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">Manage your search prompts &amp; track visibility gaps</p>

      <div className="mb-3 grid grid-cols-4 gap-2.5">
        {[
          { label: "PROMPTS", val: "20", sub: "tracked" },
          { label: "WITH GAPS", val: "5", sub: "need articles" },
          { label: "AVG VISIBILITY", val: "92%", sub: "across engines" },
          { label: "ENGINES", val: "3", sub: "being tracked" },
        ].map((s) => (
          <div key={s.label} className={`${card} p-3.5`}>
            <p className={kpiLabel}>{s.label}</p>
            <p className="font-signal-mono text-2xl font-semibold text-[var(--ink)]">{s.val}</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className={`${card} mb-3 px-4 py-3.5`}>
        <p className="mb-2 text-xs font-medium text-[var(--ink)]/90">20 of 25 prompts used</p>
        <div className="mb-2 flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-[var(--line)]">
          <div className="h-full rounded-full" style={{ width: "36%", background: PROMPT_TYPE_COLORS.commercial }} />
          <div className="h-full rounded-full" style={{ width: "24%", background: PROMPT_TYPE_COLORS.competitor }} />
          <div className="h-full rounded-full" style={{ width: "20%", background: PROMPT_TYPE_COLORS.branded }} />
        </div>
        <div className="flex gap-4">
          {([["commercial", "Commercial", 9], ["competitor", "Competitor", 6], ["branded", "Branded", 5]] as const).map(([key, label, count]) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 rounded-full" style={{ background: PROMPT_TYPE_COLORS[key] }} />
              <span className="text-[10px] text-[var(--ink-soft)]">{label} ({count})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--line-soft)] px-3 py-2 focus-within:border-[var(--rust)]/40 transition-colors">
        <svg className="h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prompts"
          className="flex-1 bg-transparent text-xs text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        />
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="grid grid-cols-[1fr_100px_90px_36px] gap-x-3 border-b border-[var(--line)] bg-[var(--line-soft)] px-4 py-2.5">
          <span className={kpiLabel + " mb-0"}>Prompts</span>
          <span className={kpiLabel + " mb-0"}>Engines</span>
          <span className={kpiLabel + " mb-0"}>Competing with</span>
          <span className={kpiLabel + " mb-0 text-center"}>Type</span>
        </div>
        {filtered.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_90px_36px] items-center gap-x-3 border-b border-[var(--line)] px-4 py-3 last:border-0">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="relative h-8 w-8 shrink-0">
                <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90">
                  <circle cx="16" cy="16" r="13" fill="none" stroke="var(--line)" strokeWidth="2.5" />
                  <circle
                    cx="16" cy="16" r="13" fill="none"
                    stroke="var(--rust)"
                    strokeWidth="2.5" strokeDasharray={`${r.vis * 0.817} 81.7`} strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-[var(--ink-soft)]">{r.vis}%</span>
              </div>
              <span className="truncate text-xs font-medium text-[var(--ink)]/90">{r.text}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {(["gpt", "gemini", "google"] as const).map((e) => (
                <span key={e} className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.engines[e] ? PROMPT_ENGINE_COLORS[e] : "var(--line)" }} />
              ))}
            </div>
            <span className="truncate text-[11px] text-[var(--ink-soft)]">{r.competing}</span>
            <div className="flex justify-center">
              <div className="h-2 w-2 rounded-full" style={{ background: PROMPT_TYPE_COLORS[r.type] }} />
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-[var(--ink-faint)]">No prompts match “{search}”.</p>
        )}
      </div>
    </div>
  );
}

// ── CITATIONS ─────────────────────────────────────────────────────
type EngageDemoItem = { platform: "Reddit" | "LinkedIn"; color: string; icon: string; url: string; prompt: string };

const CITATION_DOMAINS = [
  { rank: 1, domain: "youtube.com", count: 16, color: "#e5484d", icon: "▶", engagement: false },
  { rank: 2, domain: "reddit.com", count: 11, color: "#FF4500", icon: "R", engagement: true },
  { rank: 3, domain: "medium.com", count: 6, color: "#8a8f94", icon: "M", engagement: false },
  { rank: 4, domain: "linkedin.com", count: 5, color: LINKEDIN_HEX, icon: "in", engagement: true },
  { rank: 5, domain: "github.com", count: 3, color: "#6e7681", icon: "◆", engagement: false },
];

const CITATION_INSTANCES: Record<string, { url: string; source: string; prompt: string }[]> = {
  "reddit.com": [
    { url: "reddit.com/r/softwaretesting/comments/1b91vv6/playwright_costs/", source: "Google AI", prompt: "Is Playwright free" },
    { url: "reddit.com/r/QualityAssurance/comments/1mxe2yc/ai_in_qaautomation/", source: "Google AI", prompt: "best web automation tool for QA teams" },
    { url: "reddit.com/r/softwaretesting/comments/1bovaoa/selenium_vs_playwright/", source: "Google AI", prompt: "Playwright vs Selenium which is better" },
  ],
  "linkedin.com": [
    { url: "linkedin.com/posts/qa-weekly_playwright-vs-selenium-activity/", source: "Perplexity", prompt: "Playwright vs Selenium which is better" },
    { url: "linkedin.com/posts/testautomation-hub_switching-to-playwright/", source: "ChatGPT", prompt: "switching from Selenium to Playwright" },
  ],
  "youtube.com": [{ url: "youtube.com/watch?v=playwright-crash-course", source: "ChatGPT", prompt: "how good is Playwright" }],
  "medium.com": [{ url: "medium.com/@qaeng/playwright-vs-cypress-2026", source: "Gemini", prompt: "best browser automation tool for QA teams" }],
  "github.com": [{ url: "github.com/microsoft/playwright", source: "Perplexity", prompt: "Playwright review" }],
};

const REDDIT_REPLY = "Playwright's auto-waiting alone cut our flaky test rate way down — worth a look if Selenium timeouts are the pain point.";
const LINKEDIN_REPLY = "We moved our E2E suite from Selenium to Playwright and cut CI time in half — happy to share specifics if useful.";

function CitationsContent() {
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const [engageItem, setEngageItem] = useState<EngageDemoItem | null>(null);
  const [engageDraft, setEngageDraft] = useState("");
  const [engageSubmitted, setEngageSubmitted] = useState(false);
  const [upvoteEnabled, setUpvoteEnabled] = useState(false);
  const [upvoteQty, setUpvoteQty] = useState(10);
  const [upvoteSpeed, setUpvoteSpeed] = useState<"Slow" | "Normal" | "Fast">("Normal");

  const platforms: { name: "Reddit" | "LinkedIn"; color: string; icon: string; desc: string }[] = [
    { name: "Reddit", color: "#FF4500", icon: "R", desc: "Engage on Reddit threads to get cited in AI responses and boost your visibility." },
    { name: "LinkedIn", color: LINKEDIN_HEX, icon: "in", desc: "Engage on LinkedIn posts to get cited in AI responses and boost your visibility." },
  ];

  function openEngage(platform: "Reddit" | "LinkedIn", url: string, prompt: string) {
    const meta = platform === "Reddit" ? { color: "#FF4500", icon: "R" } : { color: LINKEDIN_HEX, icon: "in" };
    setEngageItem({ platform, url, prompt, ...meta });
    setEngageDraft("");
    setEngageSubmitted(false);
    setUpvoteEnabled(false);
    setUpvoteQty(10);
    setUpvoteSpeed("Normal");
  }

  return (
    <div className="relative p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">Citations</h2>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">Discover the sources AI uses in its responses</p>

      <p className="mb-0.5 text-xs font-medium text-[var(--ink)]/90">Engagement platforms</p>
      <p className="mb-3 text-[11px] text-[var(--ink-faint)]">Engage on these platforms to increase your AI visibility</p>
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        {platforms.map((p) => {
          const firstInstance = CITATION_INSTANCES[p.name === "Reddit" ? "reddit.com" : "linkedin.com"][0];
          return (
            <div key={p.name} className={`${card} p-3.5`}>
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: p.color }}>
                  {p.icon}
                </div>
                <span className="text-sm font-semibold text-[var(--ink)]">{p.name}</span>
                <span className="ml-auto whitespace-nowrap rounded-full bg-[var(--rust-wash)] px-1.5 py-0.5 text-[9px] font-bold text-[var(--rust-deep)]">
                  High impact
                </span>
              </div>
              <p className="mb-2.5 text-[10px] leading-snug text-[var(--ink-soft)]">{p.desc}</p>
              <button
                onClick={() => openEngage(p.name, firstInstance.url, firstInstance.prompt)}
                className="w-full rounded-lg py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
                style={{ background: p.color }}
              >
                Engage
              </button>
            </div>
          );
        })}
      </div>

      <div className={`${card} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
          <p className="text-xs font-medium text-[var(--ink)]/90">Top cited domains</p>
          <p className="text-[11px] text-[var(--ink-faint)]">121 domains</p>
        </div>
        <div className="grid grid-cols-[40px_1fr_70px_150px] gap-x-3 border-b border-[var(--line)] px-4 py-2">
          <span className={kpiLabel + " mb-0"}>Rank</span>
          <span className={kpiLabel + " mb-0"}>Domain</span>
          <span className={kpiLabel + " mb-0 text-right"}>Citations</span>
          <span className={kpiLabel + " mb-0 text-right"}>Details</span>
        </div>
        {CITATION_DOMAINS.map((d) => {
          const isExpanded = expandedDomain === d.domain;
          const instances = CITATION_INSTANCES[d.domain] ?? [];
          return (
            <div key={d.domain} className="border-b border-[var(--line)] last:border-0">
              <button
                onClick={() => setExpandedDomain(isExpanded ? null : d.domain)}
                className="grid w-full grid-cols-[40px_1fr_70px_150px] items-center gap-x-3 px-4 py-2.5 text-left transition-colors hover:bg-[var(--line-soft)] focus-visible:outline-none focus-visible:bg-[var(--line-soft)]"
                aria-expanded={isExpanded}
              >
                <span className="text-[11px] font-medium text-[var(--ink-faint)]">#{d.rank}</span>
                <div className="flex min-w-0 items-center gap-2">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-bold text-[#241b12]" style={{ background: d.color }}>
                    {d.icon}
                  </div>
                  <span className="truncate text-xs font-medium text-[var(--ink)]/90">{d.domain}</span>
                </div>
                <span className="text-right text-xs font-semibold text-[var(--ink)]">{d.count}</span>
                <div className="flex items-center justify-end gap-1.5">
                  <span className={`text-right text-[11px] font-medium ${d.engagement ? "text-[var(--rust-deep)]" : "text-[var(--ink-faint)]"}`}>
                    {d.engagement ? "Engagement opportunities" : "Learn more ↗"}
                  </span>
                  <svg className={`h-3 w-3 shrink-0 text-[var(--ink-faint)] transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
              {isExpanded && (
                <div className="border-t border-[var(--line)] bg-[var(--line-soft)] px-4 py-2">
                  {instances.map((inst, i) => (
                    <div key={i} className="flex items-center gap-2 border-b border-[var(--line)] py-1.5 last:border-0">
                      <a
                        href={`https://${inst.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="min-w-0 flex-1 truncate text-[11px] text-[var(--rust)] hover:underline"
                      >
                        {inst.url}
                      </a>
                      <span className="shrink-0 rounded border border-[var(--line)] bg-[var(--surface)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--ink-soft)]">
                        {inst.source}
                      </span>
                      <span className="hidden w-28 shrink-0 truncate text-[10px] italic text-[var(--ink-faint)] sm:block">{inst.prompt}</span>
                      {d.engagement && (
                        <button
                          onClick={() => openEngage(d.domain === "reddit.com" ? "Reddit" : "LinkedIn", inst.url, inst.prompt)}
                          className="shrink-0 rounded-md px-2 py-1 text-[10px] font-semibold text-white transition-all hover:brightness-110"
                          style={{ background: d.domain === "linkedin.com" ? LINKEDIN_HEX : "#FF4500" }}
                        >
                          Engage
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Engage side panel */}
      {engageItem && (
        <div className="absolute inset-0 z-20 flex overflow-hidden rounded-b-2xl">
          <div className="flex-1 bg-black/40" onClick={() => setEngageItem(null)} />
          <div className="flex h-full w-[280px] flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-2xl" style={{ animation: "fadeSlideIn 0.25s ease forwards" }}>
            <div className="flex items-center gap-2.5 border-b border-[var(--line)] px-4 py-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold text-white" style={{ background: engageItem.color }}>
                {engageItem.icon}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[var(--ink)]">Engage on {engageItem.platform}</p>
                <p className="truncate text-[10px] text-[var(--ink-faint)]">Draft a reply to influence this citation</p>
              </div>
              <button onClick={() => setEngageItem(null)} className="ml-auto shrink-0 text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]" aria-label="Close">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="border-b border-[var(--line)] bg-[var(--line-soft)] px-4 py-3">
              <p className={kpiLabel}>Thread</p>
              <p className="break-all text-[11px] leading-relaxed text-[var(--rust)]">{engageItem.url}</p>
              <p className="mt-1.5 truncate text-[10px] italic text-[var(--ink-faint)]">for prompt: &ldquo;{engageItem.prompt}&rdquo;</p>
            </div>

            <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3">
              {engageSubmitted ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--olive-wash)]">
                    <svg className="h-5 w-5 text-[var(--olive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-[var(--ink)]">Task submitted!</p>
                  <p className="text-[10px] text-[var(--ink-faint)]">Your reply is queued for review.</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className={kpiLabel + " mb-0"}>Reply draft</p>
                    <button
                      onClick={() => setEngageDraft(engageItem.platform === "Reddit" ? REDDIT_REPLY : LINKEDIN_REPLY)}
                      className="flex items-center gap-1 text-[10px] font-medium text-[var(--rust)] transition-opacity hover:opacity-80"
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      AI suggest
                    </button>
                  </div>
                  <textarea
                    value={engageDraft}
                    onChange={(e) => setEngageDraft(e.target.value)}
                    placeholder="Write your reply, or click AI suggest…"
                    rows={5}
                    className="w-full resize-none rounded-lg border border-[var(--line)] bg-[var(--line-soft)] p-2.5 text-[11px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--rust)]/40"
                  />

                  {engageItem.platform === "Reddit" && (
                    <div className="overflow-hidden rounded-lg border border-[var(--line)]">
                      <button
                        onClick={() => setUpvoteEnabled((v) => !v)}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-[var(--line-soft)]"
                        aria-expanded={upvoteEnabled}
                      >
                        <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded transition-colors ${upvoteEnabled ? "bg-[#FF4500]" : "border border-[var(--line)]"}`}>
                          {upvoteEnabled && (
                            <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <p className="text-[11px] font-semibold text-[var(--ink)]/90">Order upvotes to rank this reply</p>
                          <p className="text-[9px] text-[var(--ink-faint)]">Boost visibility so AI engines surface your comment</p>
                        </div>
                        <svg className={`h-3.5 w-3.5 shrink-0 text-[var(--ink-faint)] transition-transform ${upvoteEnabled ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {upvoteEnabled && (
                        <div className="space-y-2.5 border-t border-[var(--line)] px-3 pb-3 pt-2">
                          <div className="flex gap-2.5">
                            <div className="flex-1">
                              <p className="mb-1 text-[9px] font-semibold text-[var(--ink-faint)]">Quantity</p>
                              <div className="flex items-center gap-1.5">
                                <button onClick={() => setUpvoteQty((q) => Math.max(1, q - 5))} className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--line)] text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)]" aria-label="Fewer upvotes">−</button>
                                <span className="w-6 text-center text-xs font-semibold text-[var(--ink)]">{upvoteQty}</span>
                                <button onClick={() => setUpvoteQty((q) => q + 5)} className="flex h-6 w-6 items-center justify-center rounded-md border border-[var(--line)] text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)]" aria-label="More upvotes">+</button>
                              </div>
                            </div>
                            <div className="flex-1">
                              <p className="mb-1 text-[9px] font-semibold text-[var(--ink-faint)]">Speed</p>
                              <select
                                value={upvoteSpeed}
                                onChange={(e) => setUpvoteSpeed(e.target.value as "Slow" | "Normal" | "Fast")}
                                className="w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-1.5 py-1 text-[11px] text-[var(--ink)] outline-none"
                              >
                                <option value="Slow">Slow (safer)</option>
                                <option value="Normal">Normal</option>
                                <option value="Fast">Fast</option>
                              </select>
                            </div>
                          </div>
                          <div className="flex items-center justify-between rounded-md bg-[var(--line-soft)] px-2.5 py-1.5 text-[10px] text-[var(--ink-faint)]">
                            <span>{upvoteQty} upvotes × 0.5 credits</span>
                            <span className="font-semibold text-[var(--ink)]/90">{upvoteQty * 0.5} credits</span>
                          </div>
                          <p className="rounded-md bg-[var(--rust-wash)] px-2.5 py-1.5 text-[10px] leading-relaxed text-[var(--rust-deep)]">
                            Comments under 200 chars have ~35% removal rate. Keep replies natural and helpful.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>

            {!engageSubmitted && (
              <div className="border-t border-[var(--line)] px-4 py-3">
                <button
                  onClick={() => setEngageSubmitted(true)}
                  disabled={!engageDraft.trim()}
                  className="w-full rounded-lg py-2 text-xs font-semibold text-white transition-opacity disabled:opacity-40"
                  style={{ background: engageItem.color }}
                >
                  {upvoteEnabled ? `Submit Task · ${upvoteQty * 0.5} credits` : "Submit reply"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── COMPETITORS ───────────────────────────────────────────────────
function CompetitorsContent() {
  const data = [
    { name: "Selenium", pct: 35 }, { name: "Cypress", pct: 35 },
    { name: "Puppeteer", pct: 9 }, { name: "TestCafe", pct: 13 },
    { name: "Playwright", pct: 51, isMe: true },
  ];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <div className={`${card} p-5`}>
        <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">Competitors</h2>
        <p className="mb-5 text-xs text-[var(--ink-faint)]">Share of voice across AI engines</p>
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-4">
              <span className={`w-20 shrink-0 text-right text-sm ${d.isMe ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>{d.name}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${d.pct}%`,
                    background: d.isMe ? "var(--rust)" : "#60a5fa",
                  }}
                />
              </div>
              <span className={`w-9 shrink-0 text-right text-sm ${d.isMe ? "font-semibold text-[var(--rust)]" : "text-[var(--ink-soft)]"}`}>{d.pct}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── RESEARCH ──────────────────────────────────────────────────────
function ResearchContent() {
  const gaps = [
    { query: "what tools can help me create visual dashboards for test results?", absent: ["ChatGPT", "Gemini", "Perplexity"], instead: null, published: false },
    { query: "how to ensure my tests are resilient and not impacted by UI changes?", absent: ["ChatGPT", "Gemini", "Perplexity"], instead: "Selenium", published: false },
    { query: "what's the best way to run parallel tests in different browsers?", absent: ["Perplexity", "Gemini"], instead: "Selenium", published: false },
    { query: "what tool do I use for testing across multiple browsers effortlessly?", absent: ["ChatGPT", "Perplexity"], instead: "Selenium", published: true },
    { query: "how can I monitor browser sessions live during test execution?", absent: ["ChatGPT", "Gemini"], instead: "Cypress", published: false },
  ];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">Research</h2>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">20 queries where Playwright isn&apos;t mentioned</p>
      <div className="space-y-2.5">
        {gaps.map((g, i) => (
          <div key={i} className={`${card} p-4`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="mb-2 text-sm font-medium text-[var(--ink)]">{g.query}</p>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {g.absent.map((e) => (
                    <span key={e} className="rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      Not in {e}
                    </span>
                  ))}
                  {g.instead && <span className="text-[11px] text-[var(--ink-faint)]">· {g.instead} appears instead</span>}
                </div>
                <p className="text-[11px] text-[var(--ink-faint)]">Publishing an article that answers this query will teach AI engines to recommend Playwright for it.</p>
              </div>
              {g.published ? (
                <div className="mt-0.5 flex shrink-0 items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--olive)]">Published</span>
                  <span className="cursor-pointer text-xs text-[var(--ink-soft)] underline">View article ↗</span>
                </div>
              ) : (
                <button className="shrink-0 rounded-lg bg-[var(--rust-wash)] px-3 py-1.5 text-xs font-semibold text-[var(--rust-deep)] transition-colors hover:bg-[var(--rust)]/20">
                  Write article →
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TASKS ─────────────────────────────────────────────────────────
// Mirrors the real dashboard Tasks tab (app/dashboard/page.tsx): tiered
// order form (post/comment → service → quantity/speed or comment text)
// plus a Pending/Completed/Failed task list.
type RedditService = "post_upvote" | "post_downvote" | "comment_upvote" | "comment_downvote" | "custom_comments";

const TASK_SERVICE_META: Record<RedditService, { label: string; target: "post" | "comment"; creditsPerUnit: number; min: number; max: number; caveat?: string }> = {
  post_upvote: { label: "Upvotes", target: "post", creditsPerUnit: 0.5, min: 5, max: 1000 },
  post_downvote: {
    label: "Downvotes", target: "post", creditsPerUnit: 0.5, min: 5, max: 1000,
    caveat: "Only works on posts less than 24 hours old — on older posts the vote count may not visibly change, but it still limits the post's reach.",
  },
  comment_upvote: { label: "Upvotes", target: "comment", creditsPerUnit: 1, min: 5, max: 1000, caveat: "Only works on comments less than 24 hours old." },
  comment_downvote: { label: "Downvotes", target: "comment", creditsPerUnit: 1, min: 5, max: 1000, caveat: "Only works on comments less than 24 hours old." },
  custom_comments: { label: "Post a new comment", target: "post", creditsPerUnit: 5, min: 1, max: 1 },
};
const TASK_TARGET_SERVICES: Record<"post" | "comment", RedditService[]> = {
  post: ["post_upvote", "post_downvote", "custom_comments"],
  comment: ["comment_upvote", "comment_downvote"],
};

function RedditGlyph() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="white" fillOpacity="0.2" />
      <path fill="white" d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z" />
    </svg>
  );
}

type DemoTask = {
  id: number; service: RedditService; status: "completed" | "pending" | "failed";
  url: string; reply?: string; qty: number; speed: "Slow" | "Normal" | "Fast"; credits: number;
  engine?: string; time: string;
};

const INITIAL_TASKS: DemoTask[] = [
  { id: 1, service: "custom_comments", status: "completed", url: "reddit.com/r/QualityAssurance/comments/1uor3of/what_every_app_can_learn_from_duolingos/", reply: "Playwright's auto-waiting alone cut our flaky test rate way down — worth a look if Selenium timeouts are the pain point.", qty: 1, speed: "Normal", credits: 5, engine: "ChatGPT", time: "Jul 7, 05:04 AM" },
  { id: 2, service: "post_upvote", status: "completed", url: "reddit.com/r/webdev/comments/1uozmr3/playwright_vs_selenium_which_is_better/", qty: 25, speed: "Normal", credits: 12.5, engine: "Gemini", time: "Jul 7, 04:46 AM" },
  { id: 3, service: "custom_comments", status: "pending", url: "reddit.com/r/softwaretesting/comments/1bovaoa/selenium_vs_playwright/", reply: "We moved our E2E suite from Selenium to Playwright and cut CI time in half — happy to share specifics if useful.", qty: 1, speed: "Normal", credits: 5, engine: "Perplexity", time: "Jul 7, 04:12 AM" },
  { id: 4, service: "comment_upvote", status: "failed", url: "reddit.com/r/QualityAssurance/comments/1mxe2yc/ai_in_qaautomation/", qty: 10, speed: "Fast", credits: 10, engine: "Google AI", time: "Jul 6, 11:52 PM" },
];

function TasksContent() {
  const [target, setTarget] = useState<"post" | "comment">("post");
  const [service, setService] = useState<RedditService>("custom_comments");
  const [url, setUrl] = useState("");
  const [comment, setComment] = useState("");
  const [qty, setQty] = useState(10);
  const [speed, setSpeed] = useState<"Slow" | "Normal" | "Fast">("Normal");
  const [tasks, setTasks] = useState(INITIAL_TASKS);
  const [filter, setFilter] = useState<"pending" | "completed" | "failed">("completed");

  const meta = TASK_SERVICE_META[service];
  const credits = service === "custom_comments" ? meta.creditsPerUnit : qty * meta.creditsPerUnit;

  function submit() {
    const nextId = Math.max(...tasks.map((t) => t.id)) + 1;
    setTasks((prev) => [
      {
        id: nextId, service, status: "pending",
        url: url.trim() || "reddit.com/r/…",
        reply: service === "custom_comments" ? comment.trim() : undefined,
        qty: service === "custom_comments" ? 1 : qty, speed, credits, time: "just now",
      },
      ...prev,
    ]);
    setUrl("");
    setComment("");
    setFilter("pending");
  }

  const counts = {
    pending: tasks.filter((t) => t.status === "pending").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    failed: tasks.filter((t) => t.status === "failed").length,
  };
  const visible = tasks.filter((t) => t.status === filter);

  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">Tasks</h2>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">Order Reddit engagement directly, or track replies submitted from Citations.</p>

      <div className={`${card} mb-4 p-4`}>
        <p className="mb-1 text-xs font-semibold text-[var(--ink)]">Order Reddit engagement</p>
        <p className="mb-3 text-[10px] text-[var(--ink-faint)]">First pick what you&apos;re boosting — a whole post/thread, or one specific comment.</p>

        <div className="mb-3 grid grid-cols-2 gap-2">
          {(["post", "comment"] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTarget(t); setService(TASK_TARGET_SERVICES[t][0]); }}
              className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                target === t ? "border-[#FF4500] bg-[#FF4500]/5" : "border-[var(--line)] hover:bg-[var(--line-soft)]"
              }`}
            >
              <p className="text-xs font-semibold text-[var(--ink)]">{t === "post" ? "A whole post" : "One specific comment"}</p>
              <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">{t === "post" ? "Boost the thread's overall visibility" : "Boost one reply's ranking within a thread"}</p>
            </button>
          ))}
        </div>

        <div className="mb-3 flex w-fit gap-1 rounded-lg bg-[var(--line)] p-1">
          {TASK_TARGET_SERVICES[target].map((s) => (
            <button
              key={s}
              onClick={() => setService(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
                service === s ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]/80"
              }`}
            >
              {TASK_SERVICE_META[s].label}
            </button>
          ))}
        </div>

        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={target === "comment" ? "https://www.reddit.com/r/.../comments/.../comment/..." : "https://www.reddit.com/r/.../comments/..."}
          className="w-full rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 py-2 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--rust)]/40"
        />
        <p className="mb-3 mt-1 text-[10px] text-[var(--ink-faint)]">
          {target === "comment" ? "Paste the comment's own link, not the post's." : "The link to the post/thread itself."}
        </p>

        {service === "custom_comments" ? (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Comment to post…"
            rows={3}
            maxLength={1000}
            className="mb-3 w-full resize-y rounded-lg border border-[var(--line)] bg-[var(--cream)] px-3 py-2 text-xs text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--rust)]/40"
          />
        ) : (
          <div className="mb-3 flex gap-3">
            <div className="flex-1">
              <p className="mb-1.5 text-[10px] font-semibold text-[var(--ink-soft)]">Quantity ({meta.min}–{meta.max})</p>
              <div className="flex items-center gap-2">
                <button onClick={() => setQty((q) => Math.max(meta.min, q - 5))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--line-soft)]" aria-label="Fewer">−</button>
                <span className="w-10 text-center text-sm font-semibold text-[var(--ink)]">{qty}</span>
                <button onClick={() => setQty((q) => Math.min(meta.max, q + 5))} className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--line)] text-sm font-medium text-[var(--ink-soft)] hover:bg-[var(--line-soft)]" aria-label="More">+</button>
              </div>
            </div>
            <div className="flex-1">
              <p className="mb-1.5 text-[10px] font-semibold text-[var(--ink-soft)]">Speed</p>
              <select
                value={speed}
                onChange={(e) => setSpeed(e.target.value as "Slow" | "Normal" | "Fast")}
                className="w-full rounded-lg border border-[var(--line)] bg-[var(--line-soft)] px-2 py-1.5 text-xs text-[var(--ink)]/80 outline-none"
              >
                <option value="Slow">Slow (safer)</option>
                <option value="Normal">Normal</option>
                <option value="Fast">Fast</option>
              </select>
            </div>
          </div>
        )}

        {meta.caveat && <p className="mb-3 rounded-lg bg-[var(--rust-wash)] px-3 py-2 text-[10px] leading-relaxed text-[var(--rust-deep)]">{meta.caveat}</p>}

        <div className="mb-3 flex items-center justify-between rounded-lg bg-[var(--line-soft)] px-3 py-2 text-[10px] text-[var(--ink-faint)]">
          <span>{service === "custom_comments" ? "1 comment" : `${qty} ${meta.label.toLowerCase()} × ${meta.creditsPerUnit} credits`}</span>
          <span className="font-semibold text-[var(--ink)]/80">{credits} credits</span>
        </div>

        <button
          onClick={submit}
          disabled={!url.trim() || (service === "custom_comments" && !comment.trim())}
          className="w-full rounded-lg bg-[#FF4500] py-2.5 text-xs font-semibold text-white transition-colors hover:bg-[#e03d00] disabled:opacity-40"
        >
          Submit order
        </button>
      </div>

      <div className="mb-3 flex w-fit gap-1 rounded-xl bg-[var(--line)] p-1">
        {(["pending", "completed", "failed"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition-all ${
              filter === f ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]/80"
            }`}
          >
            {f}
            {counts[f] > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  filter === f
                    ? f === "failed" ? "bg-red-500/15 text-red-700" : "bg-[var(--rust-wash)] text-[var(--rust-deep)]"
                    : "bg-[var(--surface)] text-[var(--ink-soft)]"
                }`}
              >
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-xs text-[var(--ink-faint)]">No {filter} tasks.</p>
      ) : (
        <div className="space-y-2.5">
          {visible.map((t) => {
            const m = TASK_SERVICE_META[t.service];
            const label = t.service === "custom_comments" ? m.label : `${m.target === "comment" ? "Comment" : "Post"} ${m.label}`;
            return (
              <div key={t.id} className={`${card} p-4`}>
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF4500]">
                    <RedditGlyph />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          t.status === "completed"
                            ? "border-[var(--rust)]/25 bg-[var(--rust)]/10 text-[var(--rust)]"
                            : t.status === "failed"
                            ? "border-red-500/25 bg-red-500/10 text-red-700"
                            : "border-[var(--rust)]/25 bg-[var(--rust-wash)] text-[var(--rust-deep)]"
                        }`}
                      >
                        {t.status === "failed" ? "Failed — refunded" : t.status === "completed" ? "Completed" : "Pending"}
                      </span>
                      <span className="text-[10px] text-[var(--ink-faint)]">{label}</span>
                      {t.engine && <span className="text-[10px] text-[var(--ink-faint)]">{t.engine}</span>}
                      <span className="ml-auto text-[10px] text-[var(--ink-faint)]">{t.time}</span>
                    </div>
                    <a href={`https://${t.url}`} target="_blank" rel="noopener noreferrer" className="mb-2 block truncate text-xs text-[var(--rust)] hover:underline">
                      {t.url}
                    </a>
                    {t.reply && <p className="mb-2 rounded-lg border border-[var(--line)] bg-[var(--line-soft)] px-3 py-2 text-xs text-[var(--ink-soft)]">{t.reply}</p>}
                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-[var(--ink-faint)]">
                      {t.service !== "custom_comments" && <span>{t.qty} {label.toLowerCase()} ordered</span>}
                      {t.service !== "custom_comments" && <span className="capitalize">{t.speed.toLowerCase()} delivery</span>}
                      <span className="font-medium text-[var(--ink-soft)]">{t.credits} credits</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── WEB ANALYTICS ─────────────────────────────────────────────────
function WebAnalyticsContent() {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const stats = [
    { label: "LIVE VISITORS", value: 7, sub: "last 5 min" },
    { label: "VISITORS", value: "2,481" },
    { label: "PAGEVIEWS", value: "6,904" },
    { label: "VISIT DURATION", value: "48s" },
    { label: "BOUNCE RATE", value: "38%" },
  ];
  const pages = [
    { label: "/docs/api/class-page", count: 3 },
    { label: "/", count: 2 },
    { label: "/docs/intro", count: 2 },
  ];
  const referrers = [
    { label: "google.com", count: 4 },
    { label: "github.com", count: 2 },
    { label: "Direct", count: 1 },
  ];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">Web Analytics</h2>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">Privacy first analytics for your website</p>

      <div className="mb-3 grid grid-cols-5 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className={`${card} p-3.5`}>
            <p className={kpiLabel}>{s.label}</p>
            <p className="font-signal-mono text-xl font-semibold text-[var(--ink)]">{s.value}</p>
            {s.sub && <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className={`${card} mb-3 overflow-hidden`}>
        <button onClick={() => setDetailsOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--line-soft)]" aria-expanded={detailsOpen}>
          <p className="text-xs font-medium text-[var(--ink)]/90">Live Visitor Details</p>
          <svg className={`h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform ${detailsOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {detailsOpen && (
          <div className="grid grid-cols-2 gap-6 border-t border-[var(--line)] px-4 py-3.5">
            <div>
              <p className="mb-2 text-[10px] font-semibold text-[var(--ink)]/90">Pages</p>
              <div className="space-y-1.5">
                {pages.map((p) => (
                  <div key={p.label} className="flex items-center justify-between gap-2">
                    <span className="truncate font-signal-mono text-[11px] text-[var(--ink)]/80">{p.label}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--ink)]">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold text-[var(--ink)]/90">Referrers</p>
              <div className="space-y-1.5">
                {referrers.map((r) => (
                  <div key={r.label} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-[var(--ink)]/80">{r.label}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--ink)]">{r.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`${card} p-4`}>
        <p className="mb-2 text-xs font-medium text-[var(--ink)]/90">Add this script to the &lt;head&gt; of your website:</p>
        <div className="overflow-x-auto rounded-lg border border-[var(--line)] bg-[var(--line-soft)] px-3 py-2.5 font-signal-mono text-[10px] text-[var(--ink)]/90">
          {`<script src="https://www.rankongeo.com/track.js" data-site="pw_9f2a1c" defer></script>`}
        </div>
      </div>
    </div>
  );
}

// ── LLM ANALYTICS ─────────────────────────────────────────────────
function LLMAnalyticsContent() {
  const [detailsOpen, setDetailsOpen] = useState(true);
  const stats = [
    { label: "LIVE BOTS", value: 2, sub: "last 5 min" },
    { label: "BOT PAGEVIEWS", value: "612" },
  ];
  const pages = [
    { label: "/docs/api/class-page", count: 2 },
    { label: "/pricing", count: 1 },
  ];
  const bots = [
    { label: "GPTBot", count: 1 },
    { label: "PerplexityBot", count: 1 },
  ];
  const breakdown = [
    { name: "GPTBot", count: 268 },
    { name: "ClaudeBot", count: 154 },
    { name: "PerplexityBot", count: 98 },
    { name: "Google-Extended", count: 61 },
    { name: "GeminiBot", count: 31 },
  ];
  const total = breakdown.reduce((s, b) => s + b.count, 0);
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">LLM Analytics</h2>
      <p className="mb-4 text-xs text-[var(--ink-faint)]">AI and bot traffic analytics</p>

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        {stats.map((s) => (
          <div key={s.label} className={`${card} p-3.5`}>
            <p className={kpiLabel}>{s.label}</p>
            <p className="font-signal-mono text-2xl font-semibold text-[var(--ink)]">{s.value}</p>
            {s.sub && <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className={`${card} mb-3 overflow-hidden`}>
        <button onClick={() => setDetailsOpen((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--line-soft)]" aria-expanded={detailsOpen}>
          <p className="text-xs font-medium text-[var(--ink)]/90">Live Bot Details</p>
          <svg className={`h-3.5 w-3.5 text-[var(--ink-faint)] transition-transform ${detailsOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {detailsOpen && (
          <div className="grid grid-cols-2 gap-6 border-t border-[var(--line)] px-4 py-3.5">
            <div>
              <p className="mb-2 text-[10px] font-semibold text-[var(--ink)]/90">Pages</p>
              <div className="space-y-1.5">
                {pages.map((p) => (
                  <div key={p.label} className="flex items-center justify-between gap-2">
                    <span className="truncate font-signal-mono text-[11px] text-[var(--ink)]/80">{p.label}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--ink)]">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-[10px] font-semibold text-[var(--ink)]/90">Bots</p>
              <div className="space-y-1.5">
                {bots.map((b) => (
                  <div key={b.label} className="flex items-center justify-between gap-2">
                    <span className="truncate text-[11px] text-[var(--ink)]/80">{b.label}</span>
                    <span className="shrink-0 text-[11px] font-semibold text-[var(--ink)]">{b.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`${card} p-4`}>
        <p className="mb-3 text-xs font-medium text-[var(--ink)]/90">Breakdown by bot</p>
        <div className="space-y-2">
          {breakdown.map((b) => (
            <div key={b.name} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-[var(--ink)]/80">{b.name}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                <div className="h-full rounded-full bg-[var(--rust)]" style={{ width: `${Math.round((b.count / total) * 100)}%` }} />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-semibold text-[var(--ink)]">{b.count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── ARTICLES ──────────────────────────────────────────────────────
function ArticlesContent() {
  const [filter, setFilter] = useState("All");
  const articles = [
    { title: "What Tool Do I Use for Testing Across Multiple Browsers Effortlessly?", prompt: "what tool do I use for testing across multiple browsers effortlessly?", status: "Published", seo: "—", updated: "Jun 24" },
    { title: "Playwright vs Cypress: Complete 2025 Comparison Guide", prompt: "playwright vs cypress 2025", status: "Draft", seo: "72", updated: "Jun 23" },
    { title: "Setting up Playwright in Docker for CI/CD Pipelines", prompt: "playwright docker ci setup", status: "Draft", seo: "—", updated: "Jun 22" },
  ];
  const filtered = filter === "All" ? articles : articles.filter((a) => a.status === filter);
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.3s ease forwards" }}>
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h2 className="mb-0.5 text-lg font-semibold text-[var(--ink)]">Articles</h2>
          <p className="text-xs text-[var(--ink-faint)]">{articles.length} pieces · 1 published</p>
        </div>
        <button className="rounded-lg bg-[var(--rust-wash)] px-3 py-1.5 text-xs font-semibold text-[var(--rust-deep)] transition-colors hover:bg-[var(--rust)]/20">
          + New article
        </button>
      </div>
      <div className="mb-3 grid grid-cols-4 gap-2.5">
        {[
          { label: "PUBLISHED", val: "1", sub: "+0 this month" },
          { label: "IN DRAFT", val: "2", sub: "awaiting review" },
          { label: "AVG SEO SCORE", val: "72", sub: "1 scored" },
          { label: "LAST PUBLISHED", val: "Jun 24", sub: "" },
        ].map((s) => (
          <div key={s.label} className={`${card} p-3.5`}>
            <p className={kpiLabel}>{s.label}</p>
            <p className="font-signal-mono text-xl font-semibold leading-tight text-[var(--ink)]">{s.val}</p>
            {s.sub && <p className="mt-0.5 text-[10px] text-[var(--ink-faint)]">{s.sub}</p>}
          </div>
        ))}
      </div>
      <div className={`${card}`}>
        <div className="flex gap-1.5 border-b border-[var(--line)] p-3">
          {["All", "Draft", "Review", "Scheduled", "Published"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                filter === f ? "bg-[var(--rust-wash)] text-[var(--rust-deep)]" : "text-[var(--ink-faint)] hover:bg-[var(--line-soft)] hover:text-[var(--ink-soft)]"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex gap-3 border-b border-[var(--line)] px-4 py-2">
          <span className={kpiLabel + " mb-0 flex-1"}>Title</span>
          <span className={kpiLabel + " mb-0 w-20 text-center"}>Status</span>
          <span className={kpiLabel + " mb-0 w-10 text-center"}>SEO</span>
          <span className={kpiLabel + " mb-0 w-14 text-right"}>Updated</span>
        </div>
        {filtered.map((a, i) => (
          <div key={i} className="flex items-start gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium leading-snug text-[var(--ink)]/90">{a.title}</p>
              <p className="mt-0.5 truncate text-[10px] text-[var(--ink-faint)]">{a.prompt}</p>
            </div>
            <span className={`mt-0.5 w-20 text-center text-xs font-semibold ${a.status === "Published" ? "text-[var(--olive)]" : "text-[var(--ink-soft)]"}`}>{a.status}</span>
            <span className="mt-0.5 w-10 text-center text-xs text-[var(--ink-soft)]">{a.seo}</span>
            <span className="mt-0.5 w-14 text-right text-xs text-[var(--ink-faint)]">{a.updated}</span>
          </div>
        ))}
        {filtered.length === 0 && <p className="px-4 py-6 text-center text-xs text-[var(--ink-faint)]">Nothing with status “{filter}” yet.</p>}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export function InteractiveDemoMockup() {
  const [activeTab, setActiveTab] = useState("Overview");

  const navItem = (name: string, badge?: number) => {
    const active = activeTab === name;
    return (
      <button
        key={name}
        onClick={() => setActiveTab(name)}
        className={`flex w-full items-center rounded-lg px-2.5 py-1 text-left text-xs transition-all duration-200 ${
          active
            ? "bg-[var(--rust-wash)] font-semibold text-[var(--rust-deep)]"
            : "text-[var(--ink-soft)] hover:bg-[var(--line-soft)] hover:text-[var(--ink)]"
        }`}
      >
        <span
          className={`mr-1.5 h-1.5 w-1.5 rounded-full transition-all ${active ? "bg-[var(--rust)]" : "bg-transparent"}`}
          aria-hidden="true"
        />
        <span className="flex-1">{name}</span>
        {badge != null && <span className="text-[10px] font-bold text-[var(--surface)] bg-[var(--rust)] rounded-full px-1.5">{badge}</span>}
      </button>
    );
  };

  const sectionLabel = (text: string) => (
    <p className="mb-1 mt-2 px-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-faint)] first:mt-0">{text}</p>
  );

  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="min-w-[760px]">
        {/* window bar */}
        <div className="flex items-center gap-3 rounded-t-2xl border border-b-0 border-[var(--line)] bg-[var(--surface)] px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="h-2.5 w-2.5 rounded-full bg-red-400/60" />
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--line)]" />
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--line)]" />
          </div>
          <div className="flex-1 rounded-md bg-[var(--line-soft)] px-3 py-1 text-center text-xs tracking-wide text-[var(--ink-faint)]">
            app.rankongeo.com/dashboard — playwright.dev
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--rust-wash)] px-2.5 py-1 text-[11px] font-medium text-[var(--rust-deep)]">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--rust)]" aria-hidden="true" />
            Live demo · click around
          </div>
        </div>

        {/* app shell */}
        <div
          className="flex overflow-hidden rounded-b-2xl border border-t-0 border-[var(--line)] shadow-[0_20px_60px_-20px_oklch(0.19_0.014_55_/_25%)]"
          style={{ height: 620, background: "var(--cream)" }}
        >
          {/* sidebar */}
          <div className="flex w-52 shrink-0 flex-col border-r border-[var(--line)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                  <circle cx="16" cy="16" r="6" stroke="var(--rust)" strokeWidth="2.5" />
                  <circle cx="16" cy="16" r="12.5" stroke="var(--rust)" strokeWidth="1.8" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
                  <circle cx="26.5" cy="9" r="2.5" fill="var(--olive)" />
                </svg>
                <span className="text-sm font-semibold text-[var(--ink)]">RankOnGeo</span>
              </div>
              <span className="text-[10px] font-medium text-[var(--ink-faint)]">v2.0</span>
            </div>
            <div className="border-b border-[var(--line)] px-2.5 py-2">
              <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--rust-wash)] text-xs font-bold text-[var(--rust-deep)]">P</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[var(--ink)]">Playwright</p>
                  <p className="text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">Owner</p>
                </div>
                <span className="text-xs text-[var(--ink-faint)]" aria-hidden="true">▾</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-0.5 overflow-hidden px-2 py-2">
              {navItem("Agent")}
              {sectionLabel("Measure")}
              {["Overview", "Engines", "Prompts", "Citations", "Competitors", "Web Analytics", "LLM Analytics"].map((t) => navItem(t))}
              {sectionLabel("Create")}
              {navItem("Research", 20)}
              {navItem("Articles")}
              {navItem("Tasks")}
              {sectionLabel("Distribute")}
              {navItem("Publishing")}
              {sectionLabel("On page")}
              {navItem("Alerts")}
            </div>
            <div className="flex items-center gap-2 border-t border-[var(--line)] px-3 py-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--rust-wash)] text-xs font-bold text-[var(--rust-deep)]">U</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-[var(--ink)]/90">playwright.dev</p>
                <p className="text-[9px] text-[var(--ink-faint)]">Workspace</p>
              </div>
            </div>
          </div>

          {/* main panel */}
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center gap-2 border-b border-[var(--line)] bg-[var(--surface)]/70 px-5 py-2.5">
              <div className="flex items-center gap-1.5">
                <div className="flex h-5 w-5 items-center justify-center rounded bg-[var(--rust-wash)] text-[9px] font-bold text-[var(--rust-deep)]">P</div>
                <span className="text-xs text-[var(--ink-faint)]">playwright.dev</span>
                <span className="text-xs text-[var(--ink-faint)]/50" aria-hidden="true">/</span>
                <span className="text-xs font-medium text-[var(--ink)]">{activeTab}</span>
              </div>
              <div className="flex-1" />
              <div className="hidden items-center gap-1 lg:flex">
                {ENGINES.map((e) => (
                  <span key={e} className="cursor-default rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] font-medium text-[var(--ink-soft)]">
                    {e}
                  </span>
                ))}
              </div>
              <button className="ml-1 rounded-full bg-[var(--rust)] px-3 py-1.5 text-xs font-semibold text-[var(--surface)] transition-all hover:bg-[var(--rust-deep)]">
                + Re-scan
              </button>
            </div>

            <div key={activeTab} className="flex-1 overflow-y-auto">
              {activeTab === "Overview" && <OverviewContent />}
              {activeTab === "Engines" && <EnginesContent />}
              {activeTab === "Prompts" && <PromptsContent />}
              {activeTab === "Citations" && <CitationsContent />}
              {activeTab === "Competitors" && <CompetitorsContent />}
              {activeTab === "Research" && <ResearchContent />}
              {activeTab === "Articles" && <ArticlesContent />}
              {activeTab === "Tasks" && <TasksContent />}
              {activeTab === "Web Analytics" && <WebAnalyticsContent />}
              {activeTab === "LLM Analytics" && <LLMAnalyticsContent />}
              {["Publishing", "Agent", "Alerts"].includes(activeTab) && (
                <div className="flex h-full items-center justify-center p-5">
                  <div className="text-center">
                    <p className="mb-2 font-signal-serif text-xl italic text-[var(--ink-soft)]">This one&apos;s for the real thing.</p>
                    <a href="/dashboard" className="text-sm font-medium text-[var(--rust)] hover:underline">
                      Open the full dashboard →
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
