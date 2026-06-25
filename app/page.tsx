import type { Metadata } from "next";
import { DomainForm } from "./_components/DomainForm";
import { PricingSection } from "./_components/PricingSection";
import { FAQSection } from "./_components/FAQSection";
import { MobileNav } from "./_components/MobileNav";
import { ScrollReveal } from "./_components/ScrollReveal";
import { InteractiveDemoMockup } from "./_components/InteractiveDemoMockup";

export const metadata: Metadata = {
  title: "RankOnGeo — Track Your Brand in AI Search",
  description:
    "See how ChatGPT, Claude, Gemini, Perplexity, Grok and AI Overviews respond about your brand. Close the gap with research, articles, and publishing.",
};

function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="#c8372d" />
      <path
        d="M14 5C10.96 5 8.5 7.46 8.5 10.5c0 4.63 5.5 12.5 5.5 12.5s5.5-7.87 5.5-12.5C19.5 7.46 17.04 5 14 5z"
        fill="white"
      />
      <circle cx="14" cy="10.5" r="2.2" fill="#c8372d" />
    </svg>
  );
}

function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-5xl overflow-x-auto" aria-hidden="true">
      <div className="min-w-190">
      {/* Browser chrome */}
      <div className="bg-[#1a1a1a] rounded-t-xl px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1.5" aria-hidden="true">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
          <div className="w-3 h-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex-1 bg-[#2a2a2a] rounded-md px-3 py-1 text-xs text-center text-[#888] font-mono">
          app.rankongeo.com/overview
        </div>
        <div className="bg-brand text-white text-xs px-3 py-1 rounded-md font-medium">
          Live demo · click around
        </div>
      </div>

      {/* App shell */}
      <div
        className="bg-white border border-[#e5e0da] rounded-b-xl overflow-hidden flex shadow-2xl"
        style={{ height: 560 }}
        role="img"
        aria-label="RankOnGeo dashboard preview"
      >
        {/* Sidebar */}
        <div className="w-56 bg-[#f8f9fb] border-r border-[#eaecf0] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[#eaecf0] flex items-center gap-2">
            <LogoIcon size={22} />
            <span className="font-bold text-sm tracking-tight">
              RankOn<span className="text-brand">Geo</span>
            </span>
            <span className="ml-auto text-[10px] bg-[#eaecf0] text-[#888] px-1.5 py-0.5 rounded">v2.0</span>
          </div>
          <div className="px-3 py-2 border-b border-[#eaecf0]">
            <div className="flex items-center gap-2 bg-white border border-[#e5e7eb] rounded-lg px-2.5 py-2">
              <div className="w-6 h-6 bg-brand rounded flex items-center justify-center text-white text-[10px] font-bold">
                A
              </div>
              <div>
                <div className="text-xs font-semibold text-[#111]">Acme Corp</div>
                <div className="text-[10px] text-[#888] uppercase tracking-wide">Owner</div>
              </div>
              <svg className="ml-auto w-3 h-3 text-[#aaa]" fill="none" viewBox="0 0 12 12">
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 text-xs">
            <div>
              <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-[#bbb] font-medium">Measure</div>
              {(
                [["Overview", true], ["Engines", false], ["Prompts", false], ["Citations", false], ["Competitors", false]] as [string, boolean][]
              ).map(([label, active]) => (
                <div
                  key={label}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md ${
                    active ? "bg-white border border-[#e5e7eb] text-[#111] font-medium shadow-sm" : "text-[#666]"
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-brand" : "bg-transparent"}`} />
                  {label}
                </div>
              ))}
            </div>
            <div>
              <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-[#bbb] font-medium">Create</div>
              {["Research", "Keywords", "Articles"].map((label) => (
                <div key={label} className="flex items-center gap-2 px-2 py-1.5 rounded-md text-[#666]">
                  <div className="w-1.5 h-1.5 rounded-full bg-transparent" />
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-[#eaecf0] px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-brand rounded-full flex items-center justify-center text-white text-[10px] font-bold">
                AC
              </div>
              <div>
                <div className="text-[10px] font-medium text-[#111]">john@acmecorp.com</div>
                <div className="text-[10px] text-[#888]">Workspace</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          <div className="border-b border-[#eaecf0] px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 bg-brand rounded flex items-center justify-center text-white text-[9px] font-bold">A</div>
              <span className="text-[#888]">acmecorp.com</span>
              <span className="text-[#ccc]">/</span>
              <span className="font-semibold text-[#111]">Overview</span>
            </div>
            <button className="bg-[#111] text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
              <span>+</span> New prompt
            </button>
          </div>

          <div className="px-5 py-4">
            <h2 className="text-lg font-bold text-[#111] mb-0.5">Overview</h2>
            <p className="text-xs text-[#888] mb-4">Visibility up 12.4 pts this window</p>

            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "COMPOSITE VISIBILITY", value: "60.6%", sub: "+12.4 vs start" },
                { label: "MENTIONS", value: "2,841", sub: "+78.0% mention rate" },
                { label: "AVG POSITION", value: "2.1", sub: "lower is better" },
                { label: "SENTIMENT SCORE", value: "84", sub: "positive" },
              ].map((s) => (
                <div key={s.label} className="border border-[#eaecf0] rounded-xl p-3 bg-white">
                  <div className="text-[9px] uppercase tracking-widest text-[#aaa] font-medium mb-1">{s.label}</div>
                  <div className="text-2xl font-bold text-[#111] mb-0.5">{s.value}</div>
                  <div className="text-[10px] text-brand font-medium">{s.sub}</div>
                  <div className="mt-2 h-6 flex items-end gap-0.5">
                    {[20, 22, 24, 22, 25, 28, 26, 30, 32, 35, 38, 40].map((h, i) => (
                      <div key={i} className="flex-1 bg-red-100 rounded-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="border border-[#eaecf0] rounded-xl p-3 bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-[#111]">Composite visibility</span>
                  <span className="text-[10px] text-[#aaa]">· last 30 days</span>
                  <div className="ml-auto flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-brand" />You: 60.6%</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-[#888]" />Obsidian</span>
                  </div>
                </div>
                <svg viewBox="0 0 300 80" className="w-full" style={{ height: 80 }}>
                  <polyline points="0,65 25,60 50,55 75,52 100,50 125,45 150,42 175,38 200,35 225,30 250,28 275,25 300,22" fill="none" stroke="#c8372d" strokeWidth="2" />
                  <polyline points="0,70 25,68 50,65 75,62 100,60 125,58 150,57 175,55 200,54 225,53 250,52 275,52 300,52" fill="none" stroke="#888" strokeWidth="1.5" strokeDasharray="4,3" />
                </svg>
              </div>

              <div className="border border-[#eaecf0] rounded-xl p-3 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-[#111]">Rankings</span>
                  <span className="text-[10px] text-[#aaa]">· brands by visibility</span>
                </div>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-[#aaa] uppercase tracking-wide">
                      <th className="text-left py-0.5 font-medium w-5">#</th>
                      <th className="text-left py-0.5 font-medium">Brand</th>
                      <th className="text-right py-0.5 font-medium">Vis.</th>
                      <th className="text-right py-0.5 font-medium">SOV</th>
                      <th className="text-right py-0.5 font-medium">Sent.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { rank: "01", name: "Acme Corp", you: true, vis: "60.6", sov: "31.0%", sent: 84, color: "#111" },
                      { rank: "02", name: "Obsidian", you: false, vis: "54.2", sov: "21.0%", sent: 70, color: "#555" },
                      { rank: "03", name: "Coda", you: false, vis: "47.5", sov: "16.0%", sent: 61, color: "#e85d04" },
                      { rank: "04", name: "ClickUp", you: false, vis: "41.0", sov: "14.0%", sent: 56, color: "#c8372d" },
                      { rank: "05", name: "Confluence", you: false, vis: "33.8", sov: "10.0%", sent: 48, color: "#2684ff" },
                    ].map((r) => (
                      <tr key={r.rank} className={r.you ? "bg-red-50" : ""}>
                        <td className="py-0.5 text-[#aaa]">{r.rank}</td>
                        <td className="py-0.5">
                          <div className="flex items-center gap-1">
                            <div className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: r.color }}>
                              {r.name[0]}
                            </div>
                            <span className={r.you ? "font-semibold text-[#111]" : "text-[#555]"}>{r.name}</span>
                            {r.you && <span className="bg-brand text-white text-[8px] px-1 rounded font-bold">YOU</span>}
                          </div>
                        </td>
                        <td className="py-0.5 text-right font-medium text-[#111]">{r.vis}</td>
                        <td className="py-0.5 text-right text-[#888]">{r.sov}</td>
                        <td className="py-0.5 text-right">
                          <span className={`font-bold ${r.sent >= 80 ? "text-green-600" : r.sent >= 60 ? "text-yellow-600" : "text-red-500"}`}>
                            {r.sent}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function BentoGrid() {
  const ranks = [
    { rank: 1, domain: "acmecorp.com", you: true, pct: 74, delta: "+4.2" },
    { rank: 2, domain: "evernote.com", pct: 52, delta: "-1.1" },
    { rank: 3, domain: "obsidian.md", pct: 48, delta: "+0.3" },
    { rank: 4, domain: "roamresearch.com", pct: 31, delta: "-2.4" },
  ] as { rank: number; domain: string; you?: boolean; pct: number; delta: string }[];

  const engines = [
    { label: "GPT", color: "#10a37f" },
    { label: "Claude", color: "#d4673a" },
    { label: "Gemini", color: "#4285f4" },
    { label: "Perp.", color: "#20b2aa" },
    { label: "Grok", color: "#444" },
    { label: "AIO", color: "#4285f4" },
    { label: "AIM", color: "#8b5cf6" },
  ];

  const gaps = [
    { q: "best note app for ADHD", score: 84 },
    { q: "notion vs obsidian for engineers", score: 91 },
    { q: "how to write second brain", score: 76 },
    { q: "is notion losing to obsidian", score: 88 },
  ];

  const outline = ["TL;DR", "The five engines", "Why GEO ≠ SEO", "Citation hierarchy"];

  const destinations = [
    { dest: "WordPress", detail: "/blog/why-geo-is-not-seo", status: "published" },
    { dest: "Shopify", detail: "/blogs/news/why-geo", status: "published" },
    { dest: "Framer", detail: "Scheduled · 15:00 UTC", status: "scheduled" },
    { dest: "Webhook", detail: "REST · custom endpoint", status: "published" },
  ];

  return (
    <section id="platform" className="bg-[#0a0a0a] px-6 pb-24">
      <div className="max-w-6xl mx-auto">
        <ScrollReveal>
          <div className="text-center pt-20 pb-12">
            <h2
              className="text-4xl font-black tracking-tight mb-4 text-white"
              style={{ textWrap: "balance", letterSpacing: "-0.02em" } as React.CSSProperties}
            >
              One pipeline. Four instruments.
            </h2>
            <p className="text-[#555] max-w-lg mx-auto text-sm leading-relaxed">
              Measure → Research → Write → Publish → Re-measure. Fully automatic.
            </p>
          </div>
        </ScrollReveal>

        <div className="space-y-4">
          {/* Row 1: Visibility (2/3) + Engines (1/3) */}
          <ScrollReveal>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 bg-[#111] border border-white/[0.06] rounded-2xl p-6">
              <div className="mb-4">
                <span className="text-[10px] text-white/30 uppercase tracking-widest tracking-[0.12em]">Visibility</span>
              </div>
              <h3 className="text-xl font-black text-white mb-5 leading-tight">
                See exactly where AI ranks your brand.
              </h3>
              <div className="space-y-2">
                {ranks.map((r) => (
                  <div key={r.domain} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${r.you ? "bg-brand/10 border border-brand/25" : "bg-white/[0.03]"}`}>
                    <span className="text-[10px] text-white/25 w-3 shrink-0">{r.rank}</span>
                    <span className={`text-xs flex-1 min-w-0 truncate ${r.you ? "font-semibold text-white" : "text-white/40"}`}>
                      {r.domain}
                      {r.you && <span className="ml-2 bg-brand text-white text-[8px] px-1.5 py-0.5 rounded font-bold">YOU</span>}
                    </span>
                    <div className="w-16 h-1 bg-white/8 rounded-full overflow-hidden shrink-0">
                      <div className={`h-full rounded-full ${r.you ? "bg-brand" : "bg-white/20"}`} style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className="text-[11px] font-medium text-white/60 w-8 text-right shrink-0">{r.pct}%</span>
                    <span className={`text-[10px] w-8 text-right shrink-0 font-mono ${r.delta.startsWith("+") ? "text-emerald-400" : "text-red-400"}`}>{r.delta}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-4 flex-wrap">
                {["ChatGPT", "Claude", "Gemini", "Perplexity", "Grok", "AI Overviews"].map((e) => (
                  <span key={e} className="text-[9px] bg-white/5 text-white/30 px-2 py-0.5 rounded-full">{e}</span>
                ))}
              </div>
            </div>

            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6 flex flex-col">
              <span className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Coverage</span>
              <div className="text-6xl font-black text-white leading-none">7</div>
              <div className="text-sm text-white/40 mt-1 mb-6">AI engines tracked</div>
              <div className="grid grid-cols-4 gap-3 mt-auto">
                {engines.map((e) => (
                  <div key={e.label} className="flex flex-col items-center gap-1.5">
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ background: e.color }}
                      aria-hidden="true"
                    >
                      {e.label[0]}
                    </div>
                    <span className="text-[9px] text-white/25 text-center">{e.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          </ScrollReveal>
          {/* Row 2: Stat + Research + Generate */}
          <ScrollReveal delay={100}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div
              className="bg-brand rounded-2xl p-6 flex flex-col justify-between min-h-[220px]"
              style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.12) 1px, transparent 1px)", backgroundSize: "20px 20px" }}
            >
              <span className="text-white/70 text-[10px] uppercase tracking-widest font-medium">Time to first data</span>
              <div>
                <div className="text-5xl font-black text-white leading-none mt-3">~60s</div>
                <div className="text-sm text-white/65 mt-2 leading-snug">domain entry to first visibility score</div>
              </div>
              <div className="text-[10px] text-white/45 mt-2">Free · no card required</div>
            </div>

            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
              <div className="mb-4">
                <span className="text-[10px] text-white/30 uppercase tracking-widest tracking-[0.12em]">Research</span>
              </div>
              <h3 className="text-lg font-black text-white mb-4 leading-tight">Mine the gaps AI is about to fill.</h3>
              <div className="space-y-2">
                {gaps.map((r) => (
                  <div key={r.q} className="flex items-center gap-2 py-1 border-b border-white/[0.04]">
                    <span className="flex-1 text-[11px] text-white/50 truncate">{r.q}</span>
                    <span className="text-brand text-[11px] font-semibold shrink-0">{r.score}%</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[9px] text-white/20">AI overlap score · 247 gaps found</div>
            </div>

            <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
              <div className="mb-4">
                <span className="text-[10px] text-white/30 uppercase tracking-widest tracking-[0.12em]">Generate</span>
              </div>
              <h3 className="text-lg font-black text-white mb-4 leading-tight">Write what citation engines quote.</h3>
              <div className="bg-black/50 rounded-xl p-3.5 border border-white/[0.04] font-mono text-[10px]">
                <div className="text-white/30 mb-2 font-sans text-[9px] uppercase tracking-widest">Outline · 1,840 / 2,400 words</div>
                {outline.map((s, i) => (
                  <div key={s} className="flex gap-2 py-0.5">
                    <span className="text-white/20">{i + 1}.</span>
                    <span className="text-white/45">{s}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-white/[0.05]">
                  <span className="text-brand animate-pulse motion-reduce:animate-none" aria-hidden="true">▋</span>
                  <span className="text-white/25 font-sans">Writing claim-dense passage…</span>
                </div>
              </div>
            </div>
          </div>

          </ScrollReveal>
          {/* Row 3: Publish — full width */}
          <ScrollReveal delay={200}>
          <div className="bg-[#111] border border-white/[0.06] rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-8">
              <div className="shrink-0 sm:w-52">
                <div className="mb-2">
                  <span className="text-[10px] text-white/30 uppercase tracking-widest tracking-[0.12em]">Publish</span>
                </div>
                <h3 className="text-xl font-black text-white leading-snug">
                  Publish once.<br />Structured for citation.
                </h3>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {destinations.map((r) => (
                  <div key={r.dest} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                    <div className="text-xs font-semibold text-white/70 mb-0.5">{r.dest}</div>
                    <div className="text-[9px] text-white/30 truncate mb-2">{r.detail}</div>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      r.status === "published" ? "bg-emerald-400/15 text-emerald-400" : "bg-yellow-400/15 text-yellow-400"
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#080808] text-[#c8c8c8]" style={{ fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}>

      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-brand focus:text-white focus:px-4 focus:py-2 focus:rounded-lg focus:text-sm focus:font-medium"
      >
        Skip to content
      </a>

      {/* NAV */}
      <nav className="relative sticky top-0 z-50 bg-[#0d0d0d]/90 backdrop-blur-md border-b border-white/[0.06]" aria-label="Main navigation">
        <div className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <LogoIcon />
            <span className="text-xl font-bold tracking-tight text-white">RankOn<span className="text-brand">Geo</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/55">
            <a href="#platform" className="py-2 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">Platform</a>
            <a href="#" className="py-2 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">Tools</a>
            <a href="#" className="py-2 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">Guides</a>
            <a href="#" className="py-2 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">Blog</a>
            <a href="#pricing" className="py-2 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">Pricing</a>
          </div>
          <div className="flex items-center gap-2">
            <MobileNav />
            <a
              href="/dashboard"
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d0d0d]"
            >
              Dashboard <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </nav>

      <main id="main-content">
        {/* HERO */}
        <section
          className="relative overflow-hidden"
          style={{
            background: "#080808",
            backgroundImage: [
              "radial-gradient(ellipse at 50% -5%, rgba(200,55,45,0.13) 0%, transparent 52%)",
              "radial-gradient(circle, rgba(255,255,255,0.045) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "100% 100%, 24px 24px",
          }}
        >
          <div className="relative max-w-4xl mx-auto px-8 pt-20 pb-24 text-center">
            <ScrollReveal>
              <h1
                className="leading-[1.06] font-black tracking-tight mb-6 text-white"
                style={{ fontSize: "clamp(2.4rem, 9vw, 4.8rem)", letterSpacing: "-0.03em", textWrap: "balance" } as React.CSSProperties}
              >
                Track where AI ranks<br />
                your brand.
              </h1>
              <p className="text-base text-white/45 mb-10 max-w-lg mx-auto leading-relaxed">
                See exactly what ChatGPT, Claude, Gemini, Perplexity, and Grok say about your brand — then close the gaps with research, articles, and one-click publishing.
              </p>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="max-w-xl mx-auto mb-6">
                <DomainForm variant="hero" />
              </div>

              <div className="flex items-center justify-center gap-6 text-sm">
                {[
                  { stat: "7", label: "AI engines" },
                  { stat: "~60s", label: "first scan" },
                  { stat: "Free", label: "to start" },
                ].map((s, i) => (
                  <div key={i} className="flex items-center gap-2">
                    {i > 0 && <span className="text-white/15" aria-hidden="true">·</span>}
                    <span className="font-bold text-white">{s.stat}</span>
                    <span className="text-white/35">{s.label}</span>
                  </div>
                ))}
              </div>
            </ScrollReveal>
          </div>
        </section>

        {/* INTERACTIVE DEMO */}
        <section className="px-8 pb-20 bg-[#080808] pt-4 overflow-x-auto">
          <div style={{ filter: "drop-shadow(0 32px 80px rgba(200,55,45,0.07))" }}>
            <InteractiveDemoMockup />
          </div>
        </section>

        {/* ENGINE STRIP */}
        <section className="border-y border-white/[0.06] bg-[#080808] py-5 px-8">
          <p className="text-center text-[11px] tracking-widest text-[#3a3a3a] font-medium mb-4 uppercase">
            Tracking visibility across every major AI engine
          </p>
          <div className="flex items-center justify-center gap-8 flex-wrap">
            {[
              { name: "ChatGPT", color: "#10a37f" },
              { name: "Claude", color: "#d4673a" },
              { name: "Perplexity", color: "#888" },
              { name: "Gemini", color: "#4285f4" },
              { name: "Grok", color: "#666" },
              { name: "AI Overviews", color: "#4285f4" },
              { name: "AI Mode", color: "#8b5cf6" },
            ].map((e) => (
              <div key={e.name} className="flex items-center gap-2 text-sm text-[#555] font-medium">
                <span style={{ color: e.color, fontSize: 8 }} aria-hidden="true">●</span>
                {e.name}
              </div>
            ))}
          </div>
        </section>

        <BentoGrid />

        {/* HOW IT WORKS */}
        <section className="bg-[#0d0d0d] border-y border-white/[0.06] py-24 px-8">
          <div className="max-w-5xl mx-auto">
            <ScrollReveal>
              <div className="text-center mb-14">
                <h2 className="text-4xl font-black tracking-tight mb-3 text-white" style={{ textWrap: "balance" } as React.CSSProperties}>
                  Diagnose. Treat. Repeat.
                </h2>
                <p className="text-[#555]">Every morning, you wake up to fresh visibility signals. Here&apos;s the loop.</p>
              </div>
            </ScrollReveal>
            <ScrollReveal delay={80}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                {[
                  { label: "Diagnose", desc: "Plug in your domain. Daily visibility updates begin across your plan engines. Your first composite visibility index arrives in minutes." },
                  { label: "Research", desc: "Generative query mining, topic clusters, AI overlap & intent scoring. Outlines you approve." },
                  { label: "Write", desc: "Source-grounded article generation tuned to citation patterns. Schema and FAQ included." },
                  { label: "Publish", desc: "One-click to your CMS, structured for citation. Schema, canonical, and internal links, handled." },
                ].map((s) => (
                  <div key={s.label} className="border-t-2 border-brand/25 pt-5">
                    <h3 className="font-black text-lg mb-2 text-white">{s.label}</h3>
                    <p className="text-sm text-[#555] leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </ScrollReveal>
            <p className="text-center text-xs text-[#3a3a3a] mt-10 uppercase tracking-widest">
              The loop runs daily: update visibility, treat gaps, re-measure.
            </p>
          </div>
        </section>

        {/* PRICING */}
        <PricingSection />

        {/* FAQ */}
        <FAQSection />

        {/* BOTTOM CTA */}
        <section
          className="text-white py-24 px-8 text-center"
          style={{
            background: "#0a0a0a",
            backgroundImage: [
              "radial-gradient(ellipse at 50% 100%, rgba(200,55,45,0.1) 0%, transparent 60%)",
              "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
            ].join(", "),
            backgroundSize: "100% 100%, 24px 24px",
          }}
        >
          <ScrollReveal>
            <h2 className="text-4xl font-black tracking-tight mb-4 text-white" style={{ textWrap: "balance" } as React.CSSProperties}>
              Be in the answer,<br />not just on the page.
            </h2>
            <p className="text-[#555] mb-8 max-w-md mx-auto">
              Run a free diagnosis in minutes. See exactly where you stand across the engines that now answer your customers&apos; questions.
            </p>
            <div className="max-w-md mx-auto mb-5">
              <DomainForm variant="cta" />
            </div>
            <p className="text-xs text-white/30 tracking-wide uppercase">
              Free analysis · Paid plans track up to 7 engines · Results in ~60s
            </p>
          </ScrollReveal>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="bg-[#0a0a0a] text-white px-8 py-16">
        <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <LogoIcon />
              <span className="text-lg font-bold">RankOn<span className="text-brand">Geo</span></span>
            </div>
            <p className="text-sm text-[#888] mb-4">The visibility layer for AI search. Track. Treat. Repeat.</p>
            <div className="flex gap-3">
              {["Twitter", "LinkedIn", "GitHub"].map((s) => (
                <a key={s} href="#" className="text-xs text-[#555] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">{s}</a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#555] font-medium mb-3">Product</div>
            <div className="space-y-2">
              {["Visibility", "Research", "Generation", "Publishing", "Pricing", "Blog"].map((l) => (
                <a key={l} href="#" className="block text-sm text-[#888] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">{l}</a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#555] font-medium mb-3">Integrations</div>
            <div className="space-y-2">
              {["WordPress", "Shopify", "Framer", "Webhooks", "REST API"].map((l) => (
                <a key={l} href="#" className="block text-sm text-[#888] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">{l}</a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#555] font-medium mb-3">Resources</div>
            <div className="space-y-2">
              {([["Free visibility audit", true], ["Methodology", false], ["GEO playbook", false]] as [string, boolean][]).map(([l, free]) => (
                <a key={l} href="#" className="flex items-center gap-1.5 text-sm text-[#888] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">
                  {l}
                  {free && <span className="text-[9px] bg-brand text-white px-1 rounded font-bold">free</span>}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[#1a1a1a] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#555]">
          <span>© 2026 RankOnGeo</span>
          <div className="flex gap-4">
            {["Privacy", "Terms", "DPA", "Security"].map((l) => (
              <a key={l} href="#" className="hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white rounded">{l}</a>
            ))}
          </div>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden="true" />
            All systems operational
          </span>
        </div>
      </footer>
    </div>
  );
}
