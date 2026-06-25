"use client";
import { useState } from "react";

function LogoIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#c8372d" />
      <path d="M14 5C10.96 5 8.5 7.46 8.5 10.5c0 4.63 5.5 12.5 5.5 12.5s5.5-7.87 5.5-12.5C19.5 7.46 17.04 5 14 5z" fill="white" />
      <circle cx="14" cy="10.5" r="2.2" fill="#c8372d" />
    </svg>
  );
}

const SIDEBAR: Record<string, string[]> = {
  Measure: ["Overview", "Engines", "Prompts", "Competitors"],
  Create: ["Research", "Articles"],
};

function Sidebar({ active, onChange }: { active: string; onChange: (t: string) => void }) {
  return (
    <div className="w-52 bg-[#f8f9fb] border-r border-[#eaecf0] flex flex-col shrink-0">
      <div className="px-4 py-3 border-b border-[#eaecf0] flex items-center gap-2">
        <LogoIcon size={20} />
        <span className="font-bold text-sm tracking-tight text-[#111]">
          RankOn<span className="text-[#c8372d]">Geo</span>
        </span>
      </div>
      <div className="px-3 py-2 border-b border-[#eaecf0]">
        <div className="flex items-center gap-2 bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-2">
          <div className="w-6 h-6 bg-[#c8372d] rounded flex items-center justify-center text-white text-[10px] font-bold">P</div>
          <div>
            <div className="text-xs font-semibold text-[#111]">Playwright</div>
            <div className="text-[10px] text-[#888] uppercase tracking-wide">microsoft.com</div>
          </div>
        </div>
      </div>
      <div className="flex-1 px-2 py-2 space-y-4 text-xs overflow-y-auto">
        {Object.entries(SIDEBAR).map(([section, tabs]) => (
          <div key={section}>
            <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-[#bbb] font-medium">{section}</div>
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => onChange(tab)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                  active === tab
                    ? "bg-white border border-[#e5e7eb] text-[#111] font-medium shadow-sm"
                    : "text-[#666] hover:bg-white/60"
                }`}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${active === tab ? "bg-[#c8372d]" : "bg-transparent"}`} />
                {tab}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-[#eaecf0] px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#c8372d] rounded-full flex items-center justify-center text-white text-[10px] font-bold">MS</div>
          <div>
            <div className="text-[10px] font-medium text-[#111]">demo@playwright.dev</div>
            <div className="text-[10px] text-[#888]">Business plan</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverviewContent() {
  const stats = [
    { label: "Composite Visibility", value: "72.4%", sub: "+8.1 pts this month", up: true },
    { label: "Mentions", value: "3,241", sub: "+12% mention rate", up: true },
    { label: "Avg Position", value: "1.8", sub: "lower is better", up: true },
    { label: "Sentiment", value: "91", sub: "positive", up: true },
  ];
  const rankings = [
    { rank: "01", name: "Playwright", you: true, vis: "72.4", sov: "38%", sent: 91 },
    { rank: "02", name: "Cypress", vis: "54.1", sov: "28%", sent: 74 },
    { rank: "03", name: "Selenium", vis: "41.8", sov: "22%", sent: 58 },
    { rank: "04", name: "Puppeteer", vis: "28.3", sov: "12%", sent: 66 },
  ];
  return (
    <div className="px-5 py-4" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-base font-bold text-[#111] mb-0.5">Overview</h2>
      <p className="text-[11px] text-[#888] mb-4">Visibility up 8.1 pts this month · playwright.dev</p>
      <div className="grid grid-cols-4 gap-2.5 mb-4">
        {stats.map((s) => (
          <div key={s.label} className="border border-[#eaecf0] rounded-xl p-3 bg-white">
            <div className="text-[8px] uppercase tracking-widest text-[#aaa] font-medium mb-1">{s.label}</div>
            <div className="text-xl font-bold text-[#111] mb-0.5">{s.value}</div>
            <div className="text-[9px] text-[#c8372d] font-medium">{s.sub}</div>
            <div className="mt-2 h-5 flex items-end gap-0.5">
              {[40, 44, 48, 46, 52, 56, 54, 60, 63, 68, 72, 76].map((h, i) => (
                <div key={i} className="flex-1 bg-red-100 rounded-sm" style={{ height: `${h}%` }} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="border border-[#eaecf0] rounded-xl p-3 bg-white">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold text-[#111]">Visibility trend</span>
            <span className="text-[10px] text-[#aaa]">· last 30 days</span>
            <div className="ml-auto flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-[#c8372d]" />Playwright</span>
              <span className="flex items-center gap-1"><span className="inline-block w-4 h-0.5 bg-[#888]" />Cypress</span>
            </div>
          </div>
          <svg viewBox="0 0 280 70" className="w-full" style={{ height: 70 }}>
            <polyline points="0,62 23,58 47,53 70,50 93,46 117,42 140,38 163,34 187,30 210,26 233,22 257,18 280,15" fill="none" stroke="#c8372d" strokeWidth="2" />
            <polyline points="0,68 23,66 47,63 70,61 93,59 117,58 140,57 163,56 187,55 210,54 233,54 257,53 280,53" fill="none" stroke="#888" strokeWidth="1.5" strokeDasharray="4,3" />
          </svg>
        </div>
        <div className="border border-[#eaecf0] rounded-xl p-3 bg-white">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-semibold text-[#111]">Brand rankings</span>
            <span className="text-[10px] text-[#aaa]">· by AI visibility</span>
          </div>
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-[#aaa] uppercase">
                <th className="text-left py-0.5 font-medium w-5">#</th>
                <th className="text-left py-0.5 font-medium">Brand</th>
                <th className="text-right py-0.5 font-medium">Vis.</th>
                <th className="text-right py-0.5 font-medium">SOV</th>
                <th className="text-right py-0.5 font-medium">Sent.</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((r) => (
                <tr key={r.rank} className={r.you ? "bg-red-50" : ""}>
                  <td className="py-0.5 text-[#aaa]">{r.rank}</td>
                  <td className="py-0.5">
                    <div className="flex items-center gap-1">
                      <div className="w-3.5 h-3.5 rounded flex items-center justify-center text-white text-[7px] font-bold shrink-0 bg-[#111]">{r.name[0]}</div>
                      <span className={r.you ? "font-semibold text-[#111]" : "text-[#555]"}>{r.name}</span>
                      {r.you && <span className="bg-[#c8372d] text-white text-[7px] px-1 rounded font-bold">YOU</span>}
                    </div>
                  </td>
                  <td className="py-0.5 text-right font-medium text-[#111]">{r.vis}</td>
                  <td className="py-0.5 text-right text-[#888]">{r.sov}</td>
                  <td className="py-0.5 text-right">
                    <span className={`font-bold text-[10px] ${r.sent >= 80 ? "text-green-600" : r.sent >= 60 ? "text-yellow-600" : "text-red-500"}`}>{r.sent}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EnginesContent() {
  const engines = [
    { name: "ChatGPT", color: "#10a37f", pct: 81 },
    { name: "AI Overviews", color: "#4285f4", pct: 79 },
    { name: "Perplexity", color: "#20b2aa", pct: 77 },
    { name: "Claude", color: "#d4673a", pct: 74 },
    { name: "Gemini", color: "#4285f4", pct: 68 },
    { name: "AI Mode", color: "#8b5cf6", pct: 65 },
    { name: "Grok", color: "#555", pct: 61 },
  ];
  return (
    <div className="px-5 py-4" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-base font-bold text-[#111] mb-0.5">Engines</h2>
      <p className="text-[11px] text-[#888] mb-5">Playwright visibility per AI engine · last 30 days</p>
      <div className="space-y-3">
        {engines.map((e) => (
          <div key={e.name} className="flex items-center gap-3">
            <div className="w-24 text-xs text-[#444] shrink-0 text-right">{e.name}</div>
            <div className="flex-1 h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${e.pct}%`, background: e.color }}
              />
            </div>
            <div className="w-9 text-xs font-semibold text-[#111] text-right shrink-0">{e.pct}%</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2.5">
        {[
          { label: "Avg visibility", value: "72.1%", sub: "across 7 engines" },
          { label: "Top engine", value: "ChatGPT", sub: "81% visibility" },
          { label: "Weakest", value: "Grok", sub: "61% — gap to close" },
        ].map((s) => (
          <div key={s.label} className="border border-[#eaecf0] rounded-xl p-3 bg-white">
            <div className="text-[9px] uppercase tracking-widest text-[#aaa] font-medium mb-1">{s.label}</div>
            <div className="text-sm font-bold text-[#111]">{s.value}</div>
            <div className="text-[9px] text-[#888] mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PromptsContent() {
  const prompts = [
    { q: "best e2e testing framework 2025", mentioned: true, rank: 1, engine: "ChatGPT" },
    { q: "playwright vs cypress comparison", mentioned: true, rank: 2, engine: "Claude" },
    { q: "browser automation for CI/CD pipelines", mentioned: true, rank: 1, engine: "Perplexity" },
    { q: "how to test react apps end-to-end", mentioned: false, rank: null, engine: "Gemini" },
  ];
  return (
    <div className="px-5 py-4" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#111] mb-0.5">Prompts</h2>
          <p className="text-[11px] text-[#888]">4 tracked · 3 mentions · 1 gap</p>
        </div>
        <button className="bg-[#111] text-white text-[11px] px-3 py-1.5 rounded-lg">+ Add prompt</button>
      </div>
      <div className="space-y-2">
        {prompts.map((p, i) => (
          <div key={i} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border ${p.mentioned ? "bg-white border-[#eaecf0]" : "bg-red-50/50 border-red-100"}`}>
            <span className={`text-xs shrink-0 font-bold ${p.mentioned ? "text-green-600" : "text-red-400"}`}>
              {p.mentioned ? "✓" : "✗"}
            </span>
            <span className="flex-1 text-xs text-[#333] truncate">{p.q}</span>
            <span className="text-[10px] bg-[#f3f4f6] text-[#666] px-2 py-0.5 rounded font-medium shrink-0">{p.engine}</span>
            <span className="text-[10px] text-[#888] w-10 text-right shrink-0">
              {p.rank ? `#${p.rank}` : "—"}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          { label: "Mention rate", value: "75%", sub: "3 of 4 prompts" },
          { label: "Avg rank", value: "#1.3", sub: "when mentioned" },
          { label: "Coverage gap", value: "1 prompt", sub: "react e2e testing" },
        ].map((s) => (
          <div key={s.label} className="border border-[#eaecf0] rounded-xl p-3 bg-white">
            <div className="text-[9px] uppercase tracking-widest text-[#aaa] font-medium mb-1">{s.label}</div>
            <div className="text-sm font-bold text-[#111]">{s.value}</div>
            <div className="text-[9px] text-[#888] mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CompetitorsContent() {
  const brands = [
    { name: "Playwright", you: true, sov: 38, vis: 72.4, sent: 91, color: "#c8372d" },
    { name: "Cypress", sov: 28, vis: 54.1, sent: 74, color: "#3b82f6" },
    { name: "Selenium", sov: 22, vis: 41.8, sent: 58, color: "#f59e0b" },
    { name: "Puppeteer", sov: 12, vis: 28.3, sent: 66, color: "#8b5cf6" },
  ];
  return (
    <div className="px-5 py-4" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <h2 className="text-base font-bold text-[#111] mb-0.5">Competitors</h2>
      <p className="text-[11px] text-[#888] mb-4">Share of voice · AI search · last 30 days</p>
      <div className="space-y-3 mb-5">
        {brands.map((b) => (
          <div key={b.name} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${b.you ? "bg-red-50 border border-red-100" : "bg-white border border-[#eaecf0]"}`}>
            <div className="w-28 flex items-center gap-2 shrink-0">
              <div className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: b.color }}>{b.name[0]}</div>
              <span className={`text-xs ${b.you ? "font-semibold text-[#111]" : "text-[#555]"}`}>{b.name}</span>
              {b.you && <span className="bg-[#c8372d] text-white text-[7px] px-1 rounded font-bold ml-0.5">YOU</span>}
            </div>
            <div className="flex-1 h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${b.sov * 2}%`, background: b.color }} />
            </div>
            <span className="text-xs font-semibold text-[#111] w-8 text-right shrink-0">{b.sov}%</span>
            <span className="text-[10px] text-[#888] w-8 text-right shrink-0">{b.vis}</span>
            <span className={`text-[10px] font-bold w-6 text-right shrink-0 ${b.sent >= 80 ? "text-green-600" : b.sent >= 60 ? "text-yellow-600" : "text-red-500"}`}>{b.sent}</span>
          </div>
        ))}
      </div>
      <div className="text-[10px] text-[#aaa] flex gap-4">
        <span>SOV = Share of Voice in AI answers</span>
        <span>Vis. = Composite Visibility score</span>
        <span>Sent. = Sentiment (0–100)</span>
      </div>
    </div>
  );
}

function ResearchContent() {
  const gaps = [
    { kw: "playwright mobile testing guide", score: 91, priority: "high" },
    { kw: "playwright docker setup tutorial", score: 88, priority: "high" },
    { kw: "playwright vs webdriverio 2025", score: 84, priority: "high" },
    { kw: "playwright typescript config best practices", score: 79, priority: "medium" },
  ];
  return (
    <div className="px-5 py-4" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#111] mb-0.5">Research</h2>
          <p className="text-[11px] text-[#888]">4 high-priority gaps · AI overlap scored</p>
        </div>
        <button className="text-[11px] border border-[#e5e7eb] px-3 py-1.5 rounded-lg text-[#555] hover:bg-gray-50">Refresh</button>
      </div>
      <div className="space-y-2">
        {gaps.map((g, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-white border border-[#eaecf0]">
            <span className="flex-1 text-xs text-[#333] truncate">{g.kw}</span>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-12 h-1.5 bg-[#f3f4f6] rounded-full overflow-hidden">
                <div className="h-full bg-[#c8372d] rounded-full" style={{ width: `${g.score}%` }} />
              </div>
              <span className="text-[11px] font-semibold text-[#c8372d] w-7 text-right">{g.score}%</span>
            </div>
            <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0 ${g.priority === "high" ? "bg-red-50 text-red-500" : "bg-yellow-50 text-yellow-600"}`}>
              {g.priority}
            </span>
            <button className="text-[10px] bg-[#111] text-white px-2.5 py-1 rounded-lg font-medium shrink-0 hover:bg-[#333] transition-colors">
              + Article
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4 border border-dashed border-[#e5e7eb] rounded-xl p-3 text-center">
        <p className="text-[11px] text-[#888]">247 total gaps detected · showing top 4 by AI overlap score</p>
      </div>
    </div>
  );
}

function ArticlesContent() {
  const articles = [
    { title: "Playwright vs Cypress: Complete 2025 Guide", status: "published", words: 2840, updated: "2d ago" },
    { title: "Setting up Playwright in Docker", status: "draft", words: 1620, updated: "5h ago" },
    { title: "Playwright TypeScript Configuration", status: "generating", words: null, updated: "now" },
  ];
  const statusStyle: Record<string, string> = {
    published: "bg-emerald-50 text-emerald-600",
    draft: "bg-[#f3f4f6] text-[#666]",
    generating: "bg-yellow-50 text-yellow-600",
  };
  return (
    <div className="px-5 py-4" style={{ animation: "fadeUp 0.2s ease forwards" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-[#111] mb-0.5">Articles</h2>
          <p className="text-[11px] text-[#888]">3 pieces · 1 published · 1 draft · 1 generating</p>
        </div>
        <button className="bg-[#c8372d] text-white text-[11px] px-3 py-1.5 rounded-lg font-medium">+ Write article</button>
      </div>
      <div className="space-y-2">
        {articles.map((a, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-3 bg-white border border-[#eaecf0]">
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium text-[#111] truncate">{a.title}</div>
              <div className="text-[10px] text-[#aaa] mt-0.5">
                {a.words ? `${a.words.toLocaleString()} words` : "Generating…"} · {a.updated}
              </div>
            </div>
            <span className={`text-[9px] px-2 py-0.5 rounded-full font-medium shrink-0 ${statusStyle[a.status]}`}>
              {a.status === "generating" ? (
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
                  generating
                </span>
              ) : a.status}
            </span>
            {a.status !== "generating" && (
              <button className="text-[10px] border border-[#e5e7eb] px-2.5 py-1 rounded-lg text-[#555] shrink-0 hover:bg-gray-50 transition-colors">
                Open ↗
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5">
        {[
          { label: "Published", value: "1", sub: "1 this month" },
          { label: "In draft", value: "1", sub: "ready to review" },
          { label: "Avg length", value: "2,230", sub: "words per article" },
        ].map((s) => (
          <div key={s.label} className="border border-[#eaecf0] rounded-xl p-3 bg-white">
            <div className="text-[9px] uppercase tracking-widest text-[#aaa] font-medium mb-1">{s.label}</div>
            <div className="text-sm font-bold text-[#111]">{s.value}</div>
            <div className="text-[9px] text-[#888] mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InteractiveDemoMockup() {
  const [activeTab, setActiveTab] = useState("Overview");

  return (
    <div className="relative mx-auto max-w-5xl" aria-label="Interactive RankOnGeo demo — Playwright sample brand">
      <div className="min-w-[760px]">
        {/* Browser chrome */}
        <div className="bg-[#1a1a1a] rounded-t-xl px-4 py-3 flex items-center gap-2">
          <div className="flex gap-1.5" aria-hidden="true">
            <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
            <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
            <div className="w-3 h-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex-1 bg-[#2a2a2a] rounded-md px-3 py-1 text-xs text-center text-[#888] font-mono">
            app.rankongeo.com/dashboard — Playwright
          </div>
          <div className="bg-[#c8372d] text-white text-xs px-3 py-1 rounded-md font-medium">
            Interactive demo ↓ click tabs
          </div>
        </div>

        {/* App shell */}
        <div
          className="bg-white border border-[#e5e0da] rounded-b-xl overflow-hidden flex"
          style={{ height: 520 }}
        >
          <Sidebar active={activeTab} onChange={setActiveTab} />

          {/* Main content — key forces remount + fadeUp on tab switch */}
          <div key={activeTab} className="flex-1 overflow-y-auto">
            {activeTab === "Overview" && <OverviewContent />}
            {activeTab === "Engines" && <EnginesContent />}
            {activeTab === "Prompts" && <PromptsContent />}
            {activeTab === "Competitors" && <CompetitorsContent />}
            {activeTab === "Research" && <ResearchContent />}
            {activeTab === "Articles" && <ArticlesContent />}
          </div>
        </div>
      </div>
    </div>
  );
}
