"use client";
import { useState } from "react";

const ENG_COLORS: Record<string, string> = {
  ChatGPT: "#10a37f",
  Claude: "#d4673a",
  Gemini: "#4285f4",
  Perplexity: "#7c3aed",
  Grok: "#1a1a1a",
  "Google AI": "#c8372d",
};
const ENGINES = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Grok", "Google AI"];

// ── OVERVIEW ──────────────────────────────────────────────────────
function OverviewContent() {
  const trend = [42, 46, 44, 50, 54, 52, 58, 62, 60, 65, 68, 65, 70, 72, 74];
  const max = Math.max(...trend), min = Math.min(...trend);
  const norm = trend.map((v) => ((v - min) / (max - min)) * 55);
  const poly = norm.map((v, i) => `${i * 27 + 8},${60 - v}`).join(" ");
  const lastX = 8 + 14 * 27, lastY = 60 - norm[14];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-lg font-bold text-[#111] mb-0.5">Overview</h2>
      <p className="text-xs text-[#aaa] mb-4">playwright.dev · last scan Jun 24, 2026</p>
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        {[
          { label: "COMPOSITE VISIBILITY", val: "72.4%", sub: "+8.1% vs last scan" },
          { label: "TOTAL MENTIONS", val: "3,241", sub: "+12% this week" },
          { label: "AVG POSITION", val: "1.8", sub: "across all engines" },
          { label: "SENTIMENT", val: "89%", sub: "positive responses" },
        ].map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-3.5 border border-[#e5e0da]">
            <p className="text-[9px] font-semibold text-[#bbb] tracking-wider mb-1 uppercase">{s.label}</p>
            <p className="text-xl font-black text-[#111]">{s.val}</p>
            <p className="text-[10px] text-[#aaa] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        <div className="col-span-2 bg-white rounded-xl border border-[#e5e0da] p-4">
          <p className="text-xs font-semibold text-[#444] mb-2">Visibility trend — last 15 scans</p>
          <svg width="100%" height="65" viewBox="0 0 390 65">
            <polyline points={poly} fill="none" stroke="#c8372d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={lastX} cy={lastY} r="3.5" fill="#c8372d" />
          </svg>
        </div>
        <div className="bg-white rounded-xl border border-[#e5e0da] p-4">
          <p className="text-xs font-semibold text-[#444] mb-3">By engine</p>
          <div className="space-y-2">
            {[
              { name: "ChatGPT", pct: 80 }, { name: "Claude", pct: 74 }, { name: "Gemini", pct: 72 },
              { name: "Perplexity", pct: 69 }, { name: "Grok", pct: 65 }, { name: "Google AI", pct: 79 },
            ].map((e) => (
              <div key={e.name} className="flex items-center gap-1.5">
                <span className="text-[9px] text-[#888] w-14 text-right shrink-0 truncate">{e.name}</span>
                <div className="flex-1 h-1.5 bg-[#f0ece6] rounded-full">
                  <div className="h-full rounded-full" style={{ width: `${e.pct}%`, background: ENG_COLORS[e.name] }} />
                </div>
                <span className="text-[9px] text-[#888] w-6 shrink-0">{e.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ENGINES ───────────────────────────────────────────────────────
function EnginesContent() {
  const scans: Array<{ overall: number; data: Record<string, number>; time: string }> = [
    { overall: 74, data: { ChatGPT: 80, Claude: 78, Gemini: 72, Perplexity: 69, Grok: 65, "Google AI": 79 }, time: "Jun 24, 2026, 12:01 AM" },
    { overall: 71, data: { ChatGPT: 75, Claude: 74, Gemini: 68, Perplexity: 71, Grok: 61, "Google AI": 77 }, time: "Jun 23, 2026, 11:09 PM" },
    { overall: 68, data: { ChatGPT: 73, Claude: 70, Gemini: 65, Perplexity: 64, Grok: 58, "Google AI": 74 }, time: "Jun 23, 2026, 10:54 PM" },
  ];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-lg font-bold text-[#111] mb-4">Engines</h2>
      <div className="space-y-2.5">
        {scans.map((scan, i) => (
          <div key={i} className="bg-white rounded-xl border border-[#e5e0da] px-5 py-4 flex items-center gap-4">
            <span className="text-3xl font-black text-[#111] w-14 shrink-0">{scan.overall}%</span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[#444] mb-1">
                {ENGINES.map((e) => (
                  <span key={e}>
                    <span className="font-semibold">{e}:</span>{" "}
                    <span className={scan.data[e] > 0 ? "text-[#222]" : "text-[#bbb]"}>{scan.data[e]}%</span>
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[#aaa]">{scan.time}</p>
            </div>
            <div className="flex gap-0.5 shrink-0">
              {ENGINES.map((e) => (
                <span key={e} style={{ color: ENG_COLORS[e], fontSize: 14 }}>●</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PROMPTS ───────────────────────────────────────────────────────
function PromptsContent() {
  const [expanded, setExpanded] = useState<number | null>(1);
  const rows = [
    { engine: "Perplexity", prompt: "what's the best way to run parallel tests in different brow…", status: "Absent" },
    {
      engine: "ChatGPT",
      prompt: "what tools can help me create visual dashboards for test…",
      status: "Absent",
      response: "Here are some top tools for creating visual dashboards for test results: 1. **Tableau** — A powerful data visualization tool that allows you to create interactive dashboards from various data sources. 2. **Microsoft Power BI** — User-friendly, integrates well with Microsoft products, and offers extensive reporting features. 3. **Google Data Studio** — A free tool that connects with various sources. 4. **Grafana** — Excellent for real-time monitoring, particularly with time-series data...",
    },
    {
      engine: "Gemini",
      prompt: "what tools can help me create visual dashboards for test…",
      status: "Absent",
      response: "Here are top tools for creating visual dashboards for test results: * **Tableau:** Powerful, feature-rich, and highly interactive. * **Power BI:** Excellent integration with Microsoft products, strong data modeling. * **Grafana:** Open-source, great for real-time monitoring and time-series data. * **Kibana:** Specifically designed for Elasticsearch, ideal for log analysis...",
    },
    { engine: "Perplexity", prompt: "what tools can help me create visual dashboards for test…", status: "Absent" },
    {
      engine: "Gemini",
      prompt: "what framework is best for testing web apps with divers…",
      status: "Mentioned",
      response: "Here are my top framework recommendations: * **Cypress:** Excellent for end-to-end testing, fast and reliable. * **Playwright:** Supports multiple browsers and is built for modern web applications. Robust cross-browser testing capabilities. * **Selenium WebDriver:** A mature and widely adopted framework with various language bindings and strong community support...",
    },
    { engine: "Perplexity", prompt: "what framework is best for testing web apps with divers…", status: "Absent" },
  ];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-lg font-bold text-[#111] mb-4">Prompts</h2>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-[#e5e0da] px-4 py-3 cursor-pointer"
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            <div className="flex items-center gap-3">
              <span style={{ color: ENG_COLORS[row.engine], fontSize: 11, lineHeight: 1 }}>●</span>
              <span className="text-xs font-medium text-[#555] w-20 shrink-0">{row.engine}</span>
              <span className="flex-1 text-xs text-[#222] truncate">{row.prompt}</span>
              <span className={`text-xs font-semibold shrink-0 ${row.status === "Mentioned" ? "text-green-600" : "text-[#c8372d]"}`}>
                {row.status}
              </span>
            </div>
            {expanded === i && "response" in row && row.response && (
              <p className="mt-2 pt-2 text-[11px] text-[#666] leading-relaxed border-t border-[#f0ece6]">{row.response}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── CITATIONS ─────────────────────────────────────────────────────
function CitationsContent() {
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-lg font-bold text-[#111] mb-0.5">Citations</h2>
      <p className="text-xs text-[#aaa] mb-4">Sources AI engines cited when mentioning Playwright</p>
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        <div className="bg-white rounded-xl border border-[#e5e0da] p-4">
          <p className="text-[9px] font-semibold text-[#bbb] tracking-wider uppercase mb-2">TOTAL CITATIONS</p>
          <p className="text-3xl font-black text-[#111]">6</p>
          <p className="text-[11px] text-[#aaa] mt-1">avg 0 per response</p>
        </div>
        <div className="bg-white rounded-xl border border-[#e5e0da] p-4">
          <p className="text-[9px] font-semibold text-[#bbb] tracking-wider uppercase mb-2">BY SOURCE TYPE</p>
          {[{ label: "Owned", count: 3 }, { label: "Editorial", count: 3 }].map((t) => (
            <div key={t.label} className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-[#444] w-14 shrink-0">{t.label}</span>
              <div className="flex-1 h-1.5 bg-[#f0ece6] rounded-full">
                <div className="h-full bg-[#c8372d] rounded-full" style={{ width: "50%" }} />
              </div>
              <span className="text-xs text-[#888] w-4 text-right">{t.count}</span>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-xl border border-[#e5e0da] p-4">
          <p className="text-[9px] font-semibold text-[#bbb] tracking-wider uppercase mb-2">TOP CITING SOURCES</p>
          {[{ src: "playwright.dev", type: "Owned", count: 3 }, { src: "example.com", type: "Editorial", count: 2 }, { src: "github.com", type: "Editorial", count: 1 }].map((s) => (
            <div key={s.src} className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-[#444]">{s.src}</span>
              <div className="flex items-center gap-1">
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${s.type === "Owned" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-[#666]"}`}>{s.type}</span>
                <span className="text-xs text-[#888] w-3 text-right">{s.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl border border-[#e5e0da] p-4">
        <p className="text-sm font-semibold text-[#111] mb-3">All citing sources · 3</p>
        <div className="grid grid-cols-[1fr_80px_100px_60px] text-[9px] font-semibold text-[#bbb] tracking-wider uppercase pb-2 border-b border-[#f0ece6] mb-1">
          <span>Source</span><span>Type</span><span>Engines</span><span className="text-right">Citations</span>
        </div>
        {[{ src: "playwright.dev", type: "Owned", engine: "ChatGPT", count: 3 }, { src: "example.com", type: "Editorial", engine: "ChatGPT", count: 2 }, { src: "github.com", type: "Editorial", engine: "ChatGPT", count: 1 }].map((row) => (
          <div key={row.src} className="grid grid-cols-[1fr_80px_100px_60px] py-2.5 border-b border-[#f5f3f0] last:border-0 items-center">
            <span className="text-xs text-[#333]">{row.src}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded w-fit ${row.type === "Owned" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-[#666]"}`}>{row.type}</span>
            <span className="text-[10px] px-2 py-0.5 bg-green-50 text-green-700 rounded w-fit">{row.engine}</span>
            <span className="text-sm font-semibold text-[#111] text-right">{row.count}</span>
          </div>
        ))}
      </div>
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
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <div className="bg-white rounded-xl border border-[#e5e0da] p-5">
        <h2 className="text-lg font-bold text-[#111] mb-0.5">Competitors</h2>
        <p className="text-xs text-[#aaa] mb-5">Share of voice across AI engines</p>
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.name} className="flex items-center gap-4">
              <span className={`w-20 text-sm text-right shrink-0 ${d.isMe ? "font-bold text-[#111]" : "text-[#666]"}`}>{d.name}</span>
              <div className="flex-1 h-2.5 bg-[#f0ece6] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${d.pct}%`, background: d.isMe ? "#c8372d" : "#ccc" }} />
              </div>
              <span className={`w-9 text-sm text-right shrink-0 ${d.isMe ? "font-bold text-[#c8372d]" : "text-[#888]"}`}>{d.pct}%</span>
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
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-lg font-bold text-[#111] mb-0.5">Research</h2>
      <p className="text-xs text-[#aaa] mb-4">20 queries where Playwright isn&apos;t mentioned</p>
      <div className="space-y-2.5">
        {gaps.map((g, i) => (
          <div key={i} className="bg-white rounded-xl border border-[#e5e0da] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#111] mb-2">{g.query}</p>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
                  {g.absent.map((e) => (
                    <span key={e} className="text-[11px] px-2 py-0.5 rounded-full border border-[#c8372d]/30 text-[#c8372d] font-medium">Not in {e}</span>
                  ))}
                  {g.instead && <span className="text-[11px] text-[#888]">· {g.instead} appears instead</span>}
                </div>
                <p className="text-[11px] text-[#aaa]">Publishing an article that answers this query will teach AI engines to recommend Playwright for it.</p>
              </div>
              {g.published ? (
                <div className="flex items-center gap-2 shrink-0 mt-0.5">
                  <span className="text-xs font-semibold text-green-600">Published</span>
                  <span className="text-xs text-[#444] underline cursor-pointer">View article ↗</span>
                </div>
              ) : (
                <button className="text-xs font-semibold bg-[#111] text-white px-3 py-1.5 rounded-lg shrink-0">Write article →</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── KEYWORDS ──────────────────────────────────────────────────────
function KeywordsContent() {
  const rows = [
    { kw: "what is Playwright and how does it work for web automation?", pct: 67, competing: "—" },
    { kw: "what tool do I use for testing across multiple browsers…", pct: 0, competing: "Selenium" },
    { kw: "how can I automate my web app testing without flaky tests?", pct: 67, competing: "Selenium" },
    { kw: "what's the best way to run parallel tests in different browsers?", pct: 33, competing: "Selenium" },
    { kw: "how do I set up a testing environment for modern web…", pct: 67, competing: "Cypress" },
    { kw: "recommend a tool that offers auto-waiting and assertions fo…", pct: 67, competing: "Selenium" },
    { kw: "how do I get a fresh browser context for each test?", pct: 67, competing: "—" },
  ];
  return (
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-[#111] mb-0.5">Keywords</h2>
          <p className="text-xs text-[#aaa]">Tracked prompts &amp; visibility opportunities for playwright.dev</p>
        </div>
        <button className="text-xs font-semibold bg-[#111] text-white px-3 py-1.5 rounded-lg">+ Add keyword</button>
      </div>
      <div className="grid grid-cols-4 gap-2.5 mb-3">
        {[{ label: "KEYWORDS", val: "20", sub: "tracked prompts" }, { label: "WITH GAPS", val: "20", sub: "need articles" }, { label: "AVG VISIBILITY", val: "53%", sub: "across engines" }, { label: "ENGINES", val: "6", sub: "being tracked" }].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#e5e0da] p-3.5">
            <p className="text-[9px] font-semibold text-[#bbb] tracking-wider uppercase mb-1">{s.label}</p>
            <p className="text-2xl font-black text-[#111]">{s.val}</p>
            <p className="text-[10px] text-[#aaa] mt-0.5">{s.sub}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-[#e5e0da]">
        <div className="p-3 border-b border-[#f0ece6]">
          <div className="w-full text-xs px-3 py-2 rounded-lg border border-[#e5e0da] bg-[#fafaf8] text-[#bbb]">Search keywords…</div>
        </div>
        <div className="px-4 py-2 flex gap-3 text-[9px] font-semibold text-[#bbb] tracking-wider uppercase border-b border-[#f0ece6]">
          <span className="flex-1">Prompt / Keyword</span>
          <span className="w-28 text-center">Visibility</span>
          <span className="w-12 text-center">Status</span>
          <span className="w-20 text-right">Competing with</span>
          <span className="w-16"></span>
        </div>
        <div className="max-h-48 overflow-hidden">
          {rows.map((r, i) => (
            <div key={i} className="px-4 py-2.5 flex gap-3 items-center border-b border-[#f5f3f0] last:border-0">
              <span className="flex-1 text-xs text-[#333] truncate">{r.kw}</span>
              <div className="w-28 flex items-center gap-1.5">
                <div className="flex-1 h-1.5 bg-[#f0ece6] rounded-full">
                  <div className="h-full bg-[#c8372d] rounded-full" style={{ width: r.pct === 0 ? "0%" : `${r.pct}%` }} />
                </div>
                <span className="text-[10px] text-[#888] w-6 shrink-0">{r.pct}%</span>
              </div>
              <span className="w-12 text-center text-[11px] font-semibold text-[#c8372d]">Gap</span>
              <span className="w-20 text-right text-[11px] text-[#888]">{r.competing}</span>
              <button className="w-16 text-[10px] font-medium border border-[#ddd] rounded-lg py-1 text-[#444] text-center">+ Article</button>
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
    <div className="p-5" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-[#111] mb-0.5">Articles</h2>
          <p className="text-xs text-[#aaa]">{articles.length} pieces · 1 published</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs text-[#aaa]">From research</span>
          <button className="text-xs font-semibold bg-[#111] text-white px-3 py-1.5 rounded-lg">+ New article</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2.5 mb-3">
        {[{ label: "PUBLISHED", val: "1", sub: "+0 this month" }, { label: "IN DRAFT", val: "2", sub: "awaiting review" }, { label: "AVG SEO SCORE", val: "72", sub: "1 scored" }, { label: "LAST PUBLISHED", val: "Jun 24", sub: "" }].map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-[#e5e0da] p-3.5">
            <p className="text-[9px] font-semibold text-[#bbb] tracking-wider uppercase mb-1">{s.label}</p>
            <p className="text-lg font-black text-[#111] leading-tight">{s.val}</p>
            {s.sub && <p className="text-[10px] text-[#aaa] mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-[#e5e0da]">
        <div className="p-3 border-b border-[#f0ece6] flex gap-1.5">
          {["All", "Draft", "Review", "Scheduled", "Published"].map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${filter === f ? "bg-[#c8372d] text-white" : "text-[#666] hover:bg-[#f5f3f0]"}`}>{f}</button>
          ))}
        </div>
        <div className="px-4 py-2 flex gap-3 text-[9px] font-semibold text-[#bbb] tracking-wider uppercase border-b border-[#f0ece6]">
          <span className="flex-1">Title</span>
          <span className="w-20 text-center">Status</span>
          <span className="w-10 text-center">SEO</span>
          <span className="w-14 text-right">Updated</span>
        </div>
        {filtered.map((a, i) => (
          <div key={i} className="px-4 py-3 flex gap-3 items-start border-b border-[#f5f3f0] last:border-0">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[#222] leading-snug">{a.title}</p>
              <p className="text-[10px] text-[#bbb] mt-0.5 truncate">{a.prompt}</p>
            </div>
            <span className={`w-20 text-center text-xs font-semibold mt-0.5 ${a.status === "Published" ? "text-green-600" : "text-[#888]"}`}>{a.status}</span>
            <span className="w-10 text-center text-xs text-[#888] mt-0.5">{a.seo}</span>
            <span className="w-14 text-right text-xs text-[#aaa] mt-0.5">{a.updated}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────
export function InteractiveDemoMockup() {
  const [activeTab, setActiveTab] = useState("Engines");

  const navItem = (name: string, badge?: number) => (
    <button
      key={name}
      onClick={() => setActiveTab(name)}
      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center transition-colors ${
        activeTab === name
          ? "bg-white border border-[#ddd8d0] shadow-sm font-semibold text-[#111]"
          : "text-[#666] hover:bg-white/60"
      }`}
    >
      <span className={`text-[8px] mr-1.5 transition-opacity ${activeTab === name ? "text-[#c8372d]" : "opacity-0"}`}>●</span>
      <span className="flex-1">{name}</span>
      {badge != null && <span className="text-[10px] text-[#c8372d] font-bold">{badge}</span>}
    </button>
  );

  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="min-w-[760px]">
        {/* Browser chrome */}
        <div className="bg-[#1a1a1a] rounded-t-xl px-4 py-2.5 flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 bg-[#2a2a2a] rounded-md px-3 py-1 text-xs text-center text-[#777] font-mono">
            app.rankongeo.com/dashboard — playwright.dev
          </div>
          <div className="bg-brand text-white text-[11px] px-2.5 py-1 rounded-md font-medium">Live demo</div>
        </div>

        {/* App shell */}
        <div className="flex overflow-hidden rounded-b-xl border border-[#ddd8d0]" style={{ height: 580, background: "#ede8df" }}>
          {/* Sidebar */}
          <div className="w-52 shrink-0 flex flex-col border-r border-[#ddd8d0]" style={{ background: "#ede8df" }}>
            {/* Logo row */}
            <div className="px-4 py-2.5 border-b border-[#ddd8d0] flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#c8372d" />
                  <circle cx="12" cy="9" r="2.5" fill="white" />
                </svg>
                <span className="text-sm font-bold text-[#111]">RankOnGeo</span>
              </div>
              <span className="text-[10px] text-[#aaa] font-medium">v2.0</span>
            </div>
            {/* Brand selector */}
            <div className="px-2.5 py-2 border-b border-[#ddd8d0]">
              <div className="flex items-center gap-2 bg-white rounded-lg px-2.5 py-2 border border-[#ddd8d0]">
                <div className="w-7 h-7 bg-[#111] rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0">P</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#111]">Playwright</p>
                  <p className="text-[9px] text-[#aaa] uppercase tracking-wider">OWNER</p>
                </div>
                <span className="text-[#aaa] text-xs">▾</span>
              </div>
            </div>
            {/* Nav */}
            <div className="flex-1 overflow-hidden py-2 px-2 flex flex-col gap-0.5">
              {navItem("Agent")}
              <p className="text-[9px] font-semibold text-[#aaa] tracking-widest uppercase px-2 mt-2.5 mb-1">Measure</p>
              {["Overview", "Engines", "Prompts", "Citations", "Competitors"].map((t) => navItem(t))}
              <p className="text-[9px] font-semibold text-[#aaa] tracking-widest uppercase px-2 mt-3 mb-1">Create</p>
              {navItem("Research", 20)}
              {navItem("Keywords")}
              {navItem("Articles")}
              <p className="text-[9px] font-semibold text-[#aaa] tracking-widest uppercase px-2 mt-3 mb-1">Distribute</p>
              {navItem("Publishing")}
            </div>
            {/* Bottom user */}
            <div className="px-3 py-2.5 border-t border-[#ddd8d0] flex items-center gap-2">
              <div className="w-7 h-7 bg-[#c8372d] rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">U</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-[#333] truncate">playwright.dev</p>
                <p className="text-[9px] text-[#aaa]">Workspace</p>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="text-[#aaa]" aria-hidden="true">
                <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>

          {/* Main panel */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="bg-white border-b border-[#e5e0da] px-5 py-2.5 flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 bg-[#111] rounded flex items-center justify-center text-white text-[9px] font-bold">P</div>
                <span className="text-xs text-[#aaa]">playwright.dev</span>
                <span className="text-[#ddd] text-xs">/</span>
                <span className="text-xs font-medium text-[#333]">{activeTab}</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-1">
                {ENGINES.map((e) => (
                  <span key={e} className="text-[10px] px-2 py-0.5 rounded-full border border-[#c8372d]/40 text-[#c8372d] font-medium cursor-default">
                    {e}
                  </span>
                ))}
              </div>
              <button className="text-xs font-semibold bg-[#111] text-white px-3 py-1.5 rounded-lg ml-1">+ Re-scan</button>
            </div>

            {/* Content */}
            <div key={activeTab} className="flex-1 overflow-y-auto">
              {activeTab === "Overview" && <OverviewContent />}
              {activeTab === "Engines" && <EnginesContent />}
              {activeTab === "Prompts" && <PromptsContent />}
              {activeTab === "Citations" && <CitationsContent />}
              {activeTab === "Competitors" && <CompetitorsContent />}
              {activeTab === "Research" && <ResearchContent />}
              {activeTab === "Keywords" && <KeywordsContent />}
              {activeTab === "Articles" && <ArticlesContent />}
              {(activeTab === "Publishing" || activeTab === "Agent") && (
                <div className="p-5 flex items-center justify-center h-full">
                  <p className="text-sm text-[#aaa]">Available in the full dashboard</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
