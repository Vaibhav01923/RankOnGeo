"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const ROTATING_WORDS = ["every", "ChatGPT", "Perplexity", "Claude", "Gemini", "Grok"];

const PRICING = [
  {
    name: "Pro",
    desc: "For solopreneurs & small sites getting started with AI SEO.",
    price: 89,
    highlight: false,
    features: [
      "10 SEO articles per month",
      "50 tracked prompts",
      "4,000 AI search responses / mo",
      "1 website · 1 team seat",
      "3 AI engines",
      "Weekly full refresh",
      "Google Search Console + GA4",
      "Webhook CMS publishing",
      "Email support",
    ],
  },
  {
    name: "Business",
    desc: "For growing brands — multi-engine tracking, content automation, and gap detection.",
    price: 239,
    highlight: true,
    features: [
      "Everything in Pro, plus:",
      "50 SEO articles per month",
      "150 tracked prompts",
      "6,000 AI search responses / mo",
      "3 websites · 5 team seats",
      "6 AI engines",
      "Daily visibility updates",
      "7 competitor brands",
      "Gap detection & gap → article",
      "Auto-publish to WordPress, Shopify & Framer",
    ],
  },
  {
    name: "Scale",
    desc: "For teams — full autopilot, unlimited seats.",
    price: 739,
    highlight: false,
    features: [
      "Everything in Business, plus:",
      "150 SEO articles per month",
      "400 tracked prompts",
      "15,000 AI search responses / mo",
      "10 websites · Unlimited seats",
      "All 7 AI engines",
      "Expanded confidence checks",
      "25 competitor brands",
      "Full autopilot (gap → article → publish)",
      "Priority support",
    ],
  },
];

const FAQS = [
  {
    q: "What's the difference between SEO and what AppName does?",
    a: "Traditional SEO ranks pages in Google's blue links. AppName tracks and improves how generative engines — ChatGPT, Perplexity, AI Overviews, Claude, Gemini, AI Mode, and Grok — answer questions about your brand. They use different signals (claim density, source authority, schema, citation graph), and that's increasingly where your customers are searching.",
  },
  {
    q: "Which AI engines do you track?",
    a: "Pro tracks 3 engines (ChatGPT, Claude, Perplexity). Business adds Gemini, AI Overviews, and AI Mode. Scale adds Grok for all 7. Engine availability may vary by region.",
  },
  {
    q: "How is this different from Peec AI, Otterly, or CrowdReply?",
    a: "Most tools stop at measurement. AppName closes the loop: it diagnoses your gaps, generates citation-ready content, and publishes directly to your CMS — then re-measures automatically. It's a full pipeline, not just a dashboard.",
  },
  {
    q: "Will I get penalized for AI-generated content?",
    a: "No. Google's guidance targets low-quality, mass-produced content regardless of how it was made. AppName generates source-grounded, brand-voiced drafts you review before publishing. Quality is the signal, not the tool.",
  },
  {
    q: "How fast can I expect to see results?",
    a: "First visibility data arrives in ~60 seconds. Meaningful citation improvements typically show in 2–6 weeks depending on your domain authority and how quickly search engines crawl new content.",
  },
];

function LogoIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#c8372d" />
      <rect x="6" y="6" width="4" height="16" rx="1" fill="white" />
      <rect x="12" y="10" width="4" height="12" rx="1" fill="white" />
      <rect x="18" y="8" width="4" height="14" rx="1" fill="white" />
    </svg>
  );
}

function DashboardMockup() {
  return (
    <div className="relative mx-auto max-w-5xl">
      {/* Browser chrome */}
      <div className="bg-[#e8e0d8] rounded-t-xl px-4 py-3 flex items-center gap-2">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#c8c0b8]" />
          <div className="w-3 h-3 rounded-full bg-[#c8c0b8]" />
          <div className="w-3 h-3 rounded-full bg-[#c8c0b8]" />
        </div>
        <div className="flex-1 bg-[#d8d0c8] rounded-md px-3 py-1 text-xs text-center text-[#888] font-mono">
          app.yourapp.com/overview
        </div>
        <div className="bg-[#111] text-white text-xs px-3 py-1 rounded-md font-medium">
          Live demo · click around
        </div>
      </div>

      {/* App shell */}
      <div className="bg-white border border-[#e5e0da] rounded-b-xl overflow-hidden flex shadow-2xl" style={{ height: 560 }}>
        {/* Sidebar */}
        <div className="w-56 bg-[#faf8f5] border-r border-[#e8e3dc] flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-[#e8e3dc] flex items-center gap-2">
            <LogoIcon size={22} />
            <span className="font-bold text-sm tracking-tight">App<span className="text-[#c8372d]">Name</span></span>
            <span className="ml-auto text-[10px] bg-[#e8e3dc] text-[#888] px-1.5 py-0.5 rounded">v2.0</span>
          </div>
          {/* Brand selector */}
          <div className="px-3 py-2 border-b border-[#e8e3dc]">
            <div className="flex items-center gap-2 bg-white border border-[#e5e0da] rounded-lg px-2.5 py-2">
              <div className="w-6 h-6 bg-[#111] rounded flex items-center justify-center text-white text-[10px] font-bold">N</div>
              <div>
                <div className="text-xs font-semibold text-[#111]">Notion</div>
                <div className="text-[10px] text-[#888] uppercase tracking-wide">Owner</div>
              </div>
              <svg className="ml-auto w-3 h-3 text-[#aaa]" fill="none" viewBox="0 0 12 12"><path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </div>
          </div>
          {/* Nav groups */}
          <div className="flex-1 overflow-y-auto px-2 py-2 space-y-4 text-xs">
            <div>
              <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-[#bbb] font-medium">Measure</div>
              {[["Overview", true], ["Engines", false], ["Prompts", false], ["Citations", false], ["Competitors", false]].map(([label, active]) => (
                <div key={label as string} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer ${active ? "bg-white border border-[#e5e0da] text-[#111] font-medium shadow-sm" : "text-[#666] hover:text-[#111]"}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${active ? "bg-[#c8372d]" : "bg-transparent"}`} />
                  {label}
                </div>
              ))}
            </div>
            <div>
              <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-[#bbb] font-medium">Create</div>
              {["Research", "Keywords", "Articles"].map((label) => (
                <div key={label} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[#666] hover:text-[#111]">
                  <div className="w-1.5 h-1.5 rounded-full bg-transparent" />
                  {label}
                </div>
              ))}
            </div>
            <div>
              <div className="px-2 py-1 text-[10px] uppercase tracking-widest text-[#bbb] font-medium">Distribute</div>
              {["Publishing", "Schedule"].map((label) => (
                <div key={label} className="flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[#666] hover:text-[#111]">
                  <div className="w-1.5 h-1.5 rounded-full bg-transparent" />
                  {label}
                </div>
              ))}
            </div>
          </div>
          <div className="border-t border-[#e8e3dc] px-3 py-2">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-[#c8372d] rounded-full flex items-center justify-center text-white text-[10px] font-bold">JE</div>
              <div>
                <div className="text-[10px] font-medium text-[#111]">jess@notion.com</div>
                <div className="text-[10px] text-[#888]">Workspace</div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {/* Topbar */}
          <div className="border-b border-[#e8e3dc] px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-5 h-5 bg-[#111] rounded flex items-center justify-center text-white text-[9px] font-bold">N</div>
              <span className="text-[#888]">notion.com</span>
              <span className="text-[#ccc]">/</span>
              <span className="font-semibold text-[#111]">Overview</span>
            </div>
            <div className="flex items-center gap-2">
              <button className="bg-[#111] text-white text-xs px-3 py-1.5 rounded-lg flex items-center gap-1">
                <span>+</span> New prompt
              </button>
            </div>
          </div>

          <div className="px-5 py-4">
            <h2 className="text-lg font-bold text-[#111] mb-0.5">Overview</h2>
            <p className="text-xs text-[#888] mb-4">Visibility up 12.4 pts this window</p>

            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                { label: "COMPOSITE VISIBILITY", value: "60.6%", sub: "+12.4 vs start" },
                { label: "MENTIONS", value: "2,841", sub: "+78.0% mention rate" },
                { label: "AVG POSITION", value: "2.1", sub: "lower is better" },
                { label: "SENTIMENT SCORE", value: "84", sub: "positive" },
              ].map((s) => (
                <div key={s.label} className="border border-[#e8e3dc] rounded-xl p-3 bg-white">
                  <div className="text-[9px] uppercase tracking-widest text-[#aaa] font-medium mb-1">{s.label}</div>
                  <div className="text-2xl font-bold text-[#111] mb-0.5">{s.value}</div>
                  <div className="text-[10px] text-[#c8372d] font-medium">{s.sub}</div>
                  <div className="mt-2 h-6 flex items-end gap-0.5">
                    {[20, 22, 24, 22, 25, 28, 26, 30, 32, 35, 38, 40].map((h, i) => (
                      <div key={i} className="flex-1 bg-red-100 rounded-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Chart + rankings */}
            <div className="grid grid-cols-2 gap-3">
              <div className="border border-[#e8e3dc] rounded-xl p-3 bg-white">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-[#111]">Composite visibility</span>
                  <span className="text-[10px] text-[#aaa]">· last 30 days</span>
                  <div className="ml-auto flex items-center gap-3 text-[10px]">
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-[#c8372d]" />You: 60.6%</span>
                    <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 bg-[#888] border-dashed border-t border-[#888]" />Obsidian</span>
                  </div>
                </div>
                <svg viewBox="0 0 300 80" className="w-full" style={{ height: 80 }}>
                  <polyline points="0,65 25,60 50,55 75,52 100,50 125,45 150,42 175,38 200,35 225,30 250,28 275,25 300,22" fill="none" stroke="#c8372d" strokeWidth="2" />
                  <polyline points="0,70 25,68 50,65 75,62 100,60 125,58 150,57 175,55 200,54 225,53 250,52 275,52 300,52" fill="none" stroke="#888" strokeWidth="1.5" strokeDasharray="4,3" />
                </svg>
              </div>

              <div className="border border-[#e8e3dc] rounded-xl p-3 bg-white">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-semibold text-[#111]">Rankings</span>
                  <span className="text-[10px] text-[#aaa]">· brands by visibility</span>
                </div>
                <table className="w-full text-[10px]">
                  <thead><tr className="text-[#aaa] uppercase tracking-wide"><th className="text-left py-0.5 font-medium w-5">#</th><th className="text-left py-0.5 font-medium">Brand</th><th className="text-right py-0.5 font-medium">Vis.</th><th className="text-right py-0.5 font-medium">SOV</th><th className="text-right py-0.5 font-medium">Sent.</th></tr></thead>
                  <tbody>
                    {[
                      { rank: "01", name: "Notion", you: true, vis: "60.6", sov: "31.0%", sent: 84, color: "#111" },
                      { rank: "02", name: "Obsidian", you: false, vis: "54.2", sov: "21.0%", sent: 70, color: "#555" },
                      { rank: "03", name: "Coda", you: false, vis: "47.5", sov: "16.0%", sent: 61, color: "#e85" },
                      { rank: "04", name: "ClickUp", you: false, vis: "41.0", sov: "14.0%", sent: 56, color: "#c8372d" },
                      { rank: "05", name: "Confluence", you: false, vis: "33.8", sov: "10.0%", sent: 48, color: "#2684ff" },
                    ].map((r) => (
                      <tr key={r.rank} className={r.you ? "bg-red-50 rounded" : ""}>
                        <td className="py-0.5 text-[#aaa]">{r.rank}</td>
                        <td className="py-0.5 flex items-center gap-1">
                          <div className="w-4 h-4 rounded flex items-center justify-center text-white text-[8px] font-bold shrink-0" style={{ background: r.color }}>{r.name[0]}</div>
                          <span className={r.you ? "font-semibold text-[#111]" : "text-[#555]"}>{r.name}</span>
                          {r.you && <span className="bg-[#c8372d] text-white text-[8px] px-1 rounded font-bold">YOU</span>}
                        </td>
                        <td className="py-0.5 text-right font-medium text-[#111]">{r.vis}</td>
                        <td className="py-0.5 text-right text-[#888]">{r.sov}</td>
                        <td className="py-0.5 text-right"><span className={`font-bold ${r.sent >= 80 ? "text-green-600" : r.sent >= 60 ? "text-yellow-600" : "text-red-500"}`}>{r.sent}</span></td>
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
  );
}

export default function LandingPage() {
  const router = useRouter();
  const [domain, setDomain] = useState("");
  const [wordIdx, setWordIdx] = useState(0);
  const [competitors, setCompetitors] = useState("");
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setWordIdx((i) => (i + 1) % ROTATING_WORDS.length), 2000);
    return () => clearInterval(t);
  }, []);

  function handleStart(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim();
    const c = competitors.trim();
    const params = new URLSearchParams();
    if (d) params.set("domain", d);
    if (c) params.set("competitors", c);
    router.push(`/audit${params.size ? `?${params}` : ""}`);
  }

  return (
    <div className="min-h-screen bg-[#f5ede3] text-[#111]" style={{ fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}>

      {/* NAV */}
      <nav className="flex items-center justify-between px-8 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-2.5">
          <LogoIcon />
          <span className="text-xl font-bold tracking-tight">App<span className="text-[#c8372d]">Name</span></span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm text-[#555]">
          <a href="#platform" className="hover:text-[#111] transition-colors">Platform</a>
          <a href="#" className="hover:text-[#111] transition-colors">Tools</a>
          <a href="#" className="hover:text-[#111] transition-colors">Guides</a>
          <a href="#" className="hover:text-[#111] transition-colors">Blog</a>
          <a href="#pricing" className="hover:text-[#111] transition-colors">Pricing</a>
        </div>
        <a href="/dashboard" className="bg-[#c8372d] hover:bg-[#b02f26] text-white text-sm font-medium px-5 py-2 rounded-lg transition-colors flex items-center gap-1.5">
          Dashboard <span>→</span>
        </a>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden">
        {/* Dot grid */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: "radial-gradient(circle, #c8b4a0 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          opacity: 0.35,
        }} />
        {/* Warm glow */}
        <div className="absolute inset-x-0 top-0 h-96 pointer-events-none" style={{
          background: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(200,55,45,0.08) 0%, transparent 70%)",
        }} />

        <div className="relative max-w-4xl mx-auto px-8 pt-16 pb-20 text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-3 border border-[#d8cfc5] bg-white/60 backdrop-blur-sm rounded-full px-4 py-1.5 text-xs font-medium tracking-wide mb-10">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#c8372d] animate-pulse" />
              <span className="uppercase tracking-widest text-[#c8372d] font-semibold">Up to 7 engines</span>
            </span>
            <span className="text-[#aaa]">·</span>
            <span className="uppercase tracking-widest text-[#888]">Daily updates</span>
            <span className="text-[#aaa] ml-1">→</span>
          </div>

          {/* Headline */}
          <h1 className="text-[80px] leading-[1.0] font-black tracking-tight mb-8" style={{ letterSpacing: "-0.03em" }}>
            Be the answer<br />
            in{" "}
            <span className="inline-grid text-[#c8372d]">
              {ROTATING_WORDS.map((word, i) => (
                <span
                  key={word}
                  className="col-start-1 row-start-1 transition-opacity duration-300"
                  style={{
                    opacity: i === wordIdx ? 1 : 0,
                    animation: i === wordIdx ? "fadeSlideIn 0.4s ease forwards" : "none",
                  }}
                >
                  {word}
                </span>
              ))}
            </span>{" "}
            AI&nbsp;search.
          </h1>

          {/* Subtext */}
          <p className="text-lg text-[#666] mb-10 max-w-2xl mx-auto leading-relaxed">
            Track how <strong className="text-[#111]">ChatGPT, Perplexity, AI Overviews, Claude, Gemini, AI Mode, and Grok</strong>{" "}
            <span className="text-[#aaa]">depending on plan</span> answer about your brand — then close the gap with research, articles, and publishing.{" "}
            <strong className="text-[#111]">One pipeline.</strong>
          </p>

          {/* Input */}
          <form onSubmit={handleStart} className="max-w-xl mx-auto mb-5 space-y-2">
            <div className="flex gap-2">
              <div className="flex-1 flex items-center gap-2 bg-white border border-[#d8cfc5] rounded-xl px-4 shadow-sm">
                <svg className="w-4 h-4 text-[#bbb] shrink-0" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" /><path d="M8 5v3l2 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="yoursite.com"
                  className="flex-1 py-3.5 text-sm text-gray-900 bg-transparent outline-none placeholder-[#bbb]"
                />
              </div>
              <button
                type="submit"
                className="bg-[#c8372d] hover:bg-[#b02f26] text-white font-semibold px-6 py-3.5 rounded-xl text-sm transition-colors whitespace-nowrap flex items-center gap-2"
              >
                Free analysis <span>→</span>
              </button>
            </div>
            <div className="flex items-center gap-2 bg-white/70 border border-[#d8cfc5] rounded-xl px-4 shadow-sm">
              <svg className="w-4 h-4 text-[#bbb] shrink-0" fill="none" viewBox="0 0 16 16"><path d="M2 8h12M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              <input
                type="text"
                value={competitors}
                onChange={(e) => setCompetitors(e.target.value)}
                placeholder="Competitors (optional) — e.g. competitor1.com, competitor2.com"
                className="flex-1 py-3 text-sm text-gray-900 bg-transparent outline-none placeholder-[#bbb]"
              />
            </div>
          </form>

          <p className="text-xs text-[#aaa] tracking-wide">
            <span className="uppercase font-semibold text-[#888]">Free analysis</span>
            {" · "}Paid plans track up to 7 engines{" · "}Results in ~60s
          </p>
        </div>
      </section>

      {/* DASHBOARD MOCKUP */}
      <section className="px-8 pb-20">
        <DashboardMockup />
      </section>

      {/* ENGINE STRIP */}
      <section className="border-y border-[#e0d8cf] bg-[#f0e8de] py-6 px-8">
        <p className="text-center text-xs uppercase tracking-widest text-[#aaa] font-medium mb-5">
          Tracking visibility across every major AI engine
        </p>
        <div className="flex items-center justify-center gap-6 flex-wrap">
          {[
            { name: "ChatGPT", bg: "#10a37f" },
            { name: "Claude", bg: "#d4673a" },
            { name: "Perplexity", bg: "#1c1c1c" },
            { name: "Gemini", bg: "#4285f4" },
            { name: "Grok", bg: "#111" },
            { name: "AI Overviews", bg: "#4285f4" },
            { name: "AI Mode", bg: "#8b5cf6" },
          ].map((e) => (
            <div key={e.name} className="flex items-center gap-2 text-sm text-[#444] font-medium">
              <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-bold" style={{ background: e.bg }}>
                {e.name[0]}
              </div>
              {e.name}
            </div>
          ))}
        </div>
      </section>

      {/* PLATFORM */}
      <section id="platform" className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-16">
          <p className="text-xs uppercase tracking-widest text-[#888] font-semibold mb-4">Platform</p>
          <h2 className="text-4xl font-black tracking-tight mb-4">One pipeline. Four instruments.</h2>
          <p className="text-[#666] max-w-xl mx-auto">
            Most tools tell you that you&apos;re not visible. AppName closes the loop: measure, research, write, publish, re-measure. Automatically.
          </p>
        </div>

        <div className="flex gap-2 justify-center mb-16">
          {[["01", "Visibility"], ["02", "Research"], ["03", "Generation"], ["04", "Publishing"]].map(([num, label]) => (
            <div key={num} className="flex items-center gap-2 border border-[#d8cfc5] bg-white rounded-full px-4 py-1.5 text-sm">
              <span className="text-[#aaa] text-xs font-mono">{num}</span>
              <span className="font-medium text-[#111]">{label}</span>
            </div>
          ))}
        </div>

        <div className="space-y-24">
          {/* 01 Visibility */}
          <div className="grid grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-[#aaa]">01</span>
                <span className="text-xs uppercase tracking-widest text-[#888] font-semibold">Visibility</span>
              </div>
              <h3 className="text-3xl font-black tracking-tight mb-4">See your brand the way the model sees it.</h3>
              <p className="text-[#666] mb-6 leading-relaxed">
                Daily visibility updates across ChatGPT, Perplexity, AI Overviews, Claude, Gemini, AI Mode, and Grok depending on plan.
                Rotating coverage keeps your composite score, triggering prompts, and competitor movement fresh.
              </p>
              <ul className="space-y-2">
                {[
                  "Up to 7 engines with daily visibility updates — incl. browse + search modes",
                  "Composite visibility, sentiment, mention density, position",
                  "Side-by-side competitor differential",
                  "Source-of-citation breakdown (UGC, Editorial, Forum, Corporate)",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#555]">
                    <span className="text-[#c8372d] mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white border border-[#e0d8cf] rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] uppercase tracking-widest text-[#aaa] font-medium mb-3">Industry ranking · note-taking</div>
              <div className="text-[10px] text-[#aaa] mb-3">5 brands · ChatGPT · last 30 days</div>
              <div className="space-y-2">
                {[
                  { rank: 1, domain: "notion.com", you: true, pct: 74, delta: "+4.2" },
                  { rank: 2, domain: "evernote.com", pct: 52, delta: "-1.1" },
                  { rank: 3, domain: "obsidian.md", pct: 48, delta: "+0.3" },
                  { rank: 4, domain: "roamresearch.com", pct: 31, delta: "-2.4" },
                  { rank: 5, domain: "logseq.com", pct: 24, delta: "+0.8" },
                ].map((r) => (
                  <div key={r.domain} className={`flex items-center gap-3 rounded-lg px-2 py-1.5 ${r.you ? "bg-red-50" : ""}`}>
                    <span className="text-[10px] text-[#aaa] w-4">{r.rank}</span>
                    <span className={`text-xs flex-1 ${r.you ? "font-semibold" : "text-[#555]"}`}>
                      {r.domain}
                      {r.you && <span className="ml-1.5 bg-[#c8372d] text-white text-[9px] px-1 rounded font-bold">YOU</span>}
                    </span>
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${r.you ? "bg-[#c8372d]" : "bg-gray-300"}`} style={{ width: `${r.pct}%` }} />
                    </div>
                    <span className="text-xs font-medium text-[#111] w-6 text-right">{r.pct}%</span>
                    <span className={`text-[10px] w-8 text-right ${r.delta.startsWith("+") ? "text-green-600" : "text-red-500"}`}>{r.delta}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-1.5 mt-3 flex-wrap">
                {["ChatGPT", "Claude", "Gemini", "Perplexity", "Grok", "+ browse mode"].map((e) => (
                  <span key={e} className="text-[10px] bg-gray-100 text-[#555] px-2 py-0.5 rounded-full">{e}</span>
                ))}
              </div>
            </div>
          </div>

          {/* 02 Research */}
          <div className="grid grid-cols-2 gap-16 items-center">
            <div className="bg-white border border-[#e0d8cf] rounded-2xl p-5 shadow-sm order-2 md:order-1">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-[#888]">note-taking · AI workflow</span>
                <span className="ml-auto text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">Generative ✓</span>
              </div>
              <div className="flex gap-4 mb-3 text-xs">
                <span className="font-bold">247 <span className="text-[#888] font-normal">queries</span></span>
                <span className="font-bold">4.8M <span className="text-[#888] font-normal">volume</span></span>
                <span className="font-bold">82% <span className="text-[#888] font-normal">AI overlap</span></span>
              </div>
              <div className="space-y-1.5">
                {[
                  { q: "best note app for ADHD", vol: "12.4k", overlap: 84, intent: "info" },
                  { q: "notion vs obsidian for engineers", vol: "8.9k", overlap: 91, intent: "comp" },
                  { q: "how to write second brain notes", vol: "6.1k", overlap: 76, intent: "info" },
                  { q: "is notion losing to obsidian", vol: "2.3k", overlap: 88, intent: "comp" },
                  { q: "notion AI pricing 2026", vol: "11.2k", overlap: 94, intent: "trans" },
                ].map((r) => (
                  <div key={r.q} className="flex items-center gap-2 text-[11px] py-1 border-b border-gray-50">
                    <span className="flex-1 text-[#333]">{r.q}</span>
                    <span className="text-[#888] w-10">{r.vol}</span>
                    <span className="text-[#c8372d] font-semibold w-6">{r.overlap}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                      r.intent === "info" ? "bg-blue-100 text-blue-600" :
                      r.intent === "comp" ? "bg-purple-100 text-purple-600" :
                      "bg-green-100 text-green-600"
                    }`}>{r.intent}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="order-1 md:order-2">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-[#aaa]">02</span>
                <span className="text-xs uppercase tracking-widest text-[#888] font-semibold">Research</span>
              </div>
              <h3 className="text-3xl font-black tracking-tight mb-4">Mine the prompts your customers are about to type.</h3>
              <p className="text-[#666] mb-6 leading-relaxed">
                Volume, intent, and difficulty — for the way people actually ask AI. Surface the prompts that fork into your category,
                the long-tail no one else is tracking, and the questions where you&apos;re one good answer away from being cited.
              </p>
              <ul className="space-y-2">
                {[
                  "Generative query expansion — not keyword stems",
                  "AI overlap score: how often LLMs cite for this prompt",
                  "Intent classification: informational, comparative, transactional",
                  "Topic clusters mapped to your content gaps",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#555]">
                    <span className="text-[#c8372d] mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 03 Generation */}
          <div className="grid grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-[#aaa]">03</span>
                <span className="text-xs uppercase tracking-widest text-[#888] font-semibold">Generation</span>
              </div>
              <h3 className="text-3xl font-black tracking-tight mb-4">Write what citation engines actually quote.</h3>
              <p className="text-[#666] mb-6 leading-relaxed">
                A research-grounded writer that produces articles structured the way LLMs cite — claim-dense paragraphs, source tables, semantic schema.
                Backed by your brand voice and your factual sources, never fabricated.
              </p>
              <ul className="space-y-2">
                {[
                  "Brand voice trained on your existing content",
                  "Source-grounded — no hallucinated stats",
                  "Schema, FAQ, and TL;DR auto-emitted",
                  "In-editor revision loops with the visibility model",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#555]">
                    <span className="text-[#c8372d] mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white border border-[#e0d8cf] rounded-2xl p-5 shadow-sm font-mono text-xs">
              <div className="flex items-center justify-between mb-3">
                <span className="font-sans text-[10px] uppercase tracking-widest text-[#aaa]">Outline</span>
                <span className="font-sans text-[10px] text-[#888]">1,840 / 2,400</span>
              </div>
              <div className="space-y-1 text-[#555] mb-4">
                {["TL;DR", "The five engines", "Why GEO ≠ SEO", "Citation hierarchy", "Measurement", "FAQ"].map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <span className="text-[#ddd]">{i + 1}</span>
                    <span>{s}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-gray-100 pt-3">
                <div className="font-sans font-bold text-sm text-[#111] mb-2">Why GEO is not just SEO with extra steps</div>
                <p className="text-[10px] text-[#666] leading-relaxed font-sans">
                  Search has fragmented. Five different engines now decide what your prospects see, before they ever reach your site.
                  A traditional surface evaluates pages on keyword density and backlink graphs. A generative surface evaluates passages…
                </p>
                <div className="mt-2 flex items-center gap-1 text-[10px] text-[#c8372d] font-sans">
                  <span className="animate-pulse">▋</span>
                  <span className="text-[#aaa]">Writing claim-dense passage…</span>
                </div>
              </div>
            </div>
          </div>

          {/* 04 Publishing */}
          <div className="grid grid-cols-2 gap-16 items-center">
            <div className="bg-white border border-[#e0d8cf] rounded-2xl p-5 shadow-sm">
              <div className="text-[10px] uppercase tracking-widest text-[#aaa] font-medium mb-3">Publishing · 3 destinations</div>
              <div className="text-[10px] text-[#888] mb-3">Crawl pickup ~6h · <span className="text-[#c8372d] font-mono">14:32:20</span></div>
              <div className="space-y-2">
                {[
                  { dest: "WordPress", detail: "Published — /blog/why-geo-is-not-seo", status: "published" },
                  { dest: "Shopify", detail: "Published — /blogs/news/why-geo", status: "published" },
                  { dest: "Schema", detail: "Article + FAQ + HowTo emitted", status: "published" },
                  { dest: "Canonical", detail: "Cross-posts → primary URL", status: "published" },
                  { dest: "Internal links", detail: "7 contextual links woven in", status: "published" },
                  { dest: "Framer", detail: "Scheduled — 15:00 UTC", status: "scheduled" },
                ].map((r) => (
                  <div key={r.dest} className="flex items-center gap-3 text-xs py-1 border-b border-gray-50">
                    <span className="font-medium text-[#333] w-24 shrink-0">{r.dest}</span>
                    <span className="flex-1 text-[#888] truncate">{r.detail}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                      r.status === "published" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>{r.status}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xs font-mono text-[#aaa]">04</span>
                <span className="text-xs uppercase tracking-widest text-[#888] font-semibold">Publishing</span>
              </div>
              <h3 className="text-3xl font-black tracking-tight mb-4">Publish once. Structured for citation.</h3>
              <p className="text-[#666] mb-6 leading-relaxed">
                One click to your CMS, with the structure citation engines actually parse — schema, FAQ, canonical, and internal links applied automatically.
              </p>
              <ul className="space-y-2">
                {[
                  "Native: WordPress · Shopify · Framer",
                  "Anything else: REST API or webhook",
                  "Schema (Article, FAQ, HowTo) auto-emitted",
                  "Internal links woven in · canonical handled",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-[#555]">
                    <span className="text-[#c8372d] mt-0.5 shrink-0">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="bg-[#f0e8de] border-y border-[#e0d8cf] py-24 px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-xs uppercase tracking-widest text-[#888] font-semibold mb-3">How it works</p>
            <h2 className="text-4xl font-black tracking-tight mb-3">Diagnose. Treat. Repeat.</h2>
            <p className="text-[#666]">Every morning, you wake up to fresh visibility signals. Here&apos;s the loop.</p>
          </div>
          <div className="grid grid-cols-4 gap-6">
            {[
              { step: "01", label: "Diagnose", desc: "Plug in your domain. Daily visibility updates begin across your plan engines. Your first composite visibility index arrives in minutes." },
              { step: "02", label: "Research", desc: "Generative query mining, topic clusters, AI overlap & intent scoring. Outlines you approve." },
              { step: "03", label: "Write", desc: "Source-grounded article generation tuned to citation patterns. Schema and FAQ included." },
              { step: "04", label: "Publish", desc: "One-click to your CMS, structured for citation. Schema, canonical, and internal links, handled." },
            ].map((s) => (
              <div key={s.step} className="relative">
                <div className="text-xs font-mono text-[#c8372d] font-bold mb-2 uppercase tracking-widest">{s.step} Stage</div>
                <h4 className="font-black text-lg mb-2">{s.label}</h4>
                <p className="text-sm text-[#666] leading-relaxed">{s.desc}</p>
                {s.step !== "04" && (
                  <div className="hidden lg:block absolute top-3 -right-3 text-[#d0c8c0] text-lg">→</div>
                )}
              </div>
            ))}
          </div>
          <p className="text-center text-xs text-[#aaa] mt-10 uppercase tracking-widest">
            The loop runs daily: update visibility, treat gaps, re-measure.
          </p>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="max-w-6xl mx-auto px-8 py-24">
        <div className="text-center mb-12">
          <p className="text-xs uppercase tracking-widest text-[#888] font-semibold mb-3">Pricing</p>
          <h2 className="text-4xl font-black tracking-tight mb-3">Simple pricing. Every plan.</h2>
          <p className="text-[#666] mb-8">The full pipeline. The bigger the plan, the more brands, prompts, and articles.</p>
          <div className="inline-flex items-center gap-1 bg-[#ede5db] rounded-lg p-1">
            <button onClick={() => setBilling("monthly")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${billing === "monthly" ? "bg-white shadow-sm text-[#111]" : "text-[#888]"}`}>Monthly</button>
            <button onClick={() => setBilling("annual")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${billing === "annual" ? "bg-white shadow-sm text-[#111]" : "text-[#888]"}`}>
              Annual <span className="text-[#c8372d] text-xs ml-1 font-semibold">−17%</span>
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {PRICING.map((plan) => {
            const price = billing === "annual" ? Math.round(plan.price * 0.83) : plan.price;
            return (
              <div key={plan.name} className={`rounded-2xl p-7 ${plan.highlight ? "bg-[#111] text-white" : "bg-white border border-[#e0d8cf]"}`}>
                {plan.highlight && <div className="text-xs bg-[#c8372d] text-white px-3 py-1 rounded-full w-fit mb-4 font-semibold uppercase tracking-wide">Most picked</div>}
                <h3 className={`text-xl font-black mb-2 ${plan.highlight ? "text-white" : "text-[#111]"}`}>{plan.name}</h3>
                <p className={`text-sm mb-5 ${plan.highlight ? "text-[#aaa]" : "text-[#666]"}`}>{plan.desc}</p>
                <div className="mb-6">
                  <span className={`text-4xl font-black ${plan.highlight ? "text-white" : "text-[#111]"}`}>${price}</span>
                  <span className={`text-sm ml-1 ${plan.highlight ? "text-[#888]" : "text-[#aaa]"}`}>/ month</span>
                </div>
                <button className={`w-full py-3 rounded-xl text-sm font-semibold mb-6 transition-colors ${
                  plan.highlight
                    ? "bg-[#c8372d] hover:bg-[#b02f26] text-white"
                    : "bg-[#111] hover:bg-[#333] text-white"
                }`}>
                  Get started
                </button>
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-2 text-sm ${plan.highlight ? "text-[#ccc]" : "text-[#555]"}`}>
                      <span className={`shrink-0 mt-0.5 ${plan.highlight ? "text-[#c8372d]" : "text-[#c8372d]"}`}>✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-8 pb-24">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-widest text-[#888] font-semibold mb-3">FAQ</p>
          <h2 className="text-3xl font-black tracking-tight">Common questions.</h2>
        </div>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div key={i} className="border border-[#e0d8cf] bg-white rounded-xl overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                <span className="font-medium text-sm text-[#111]">{faq.q}</span>
                <span className={`text-[#888] transition-transform text-lg ml-4 shrink-0 ${openFaq === i ? "rotate-45" : ""}`}>+</span>
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm text-[#666] leading-relaxed border-t border-[#f0ece8]">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-[#888] mt-8">
          Still have questions?{" "}
          <a href="mailto:hello@yourapp.com" className="text-[#c8372d] hover:underline">Drop us a line</a>{" "}
          and we&apos;ll reply within a business day.
        </p>
      </section>

      {/* BOTTOM CTA */}
      <section className="bg-[#111] text-white py-24 px-8 text-center">
        <h2 className="text-4xl font-black tracking-tight mb-4">
          Be in the answer,<br />not just on the page.
        </h2>
        <p className="text-[#888] mb-8 max-w-md mx-auto">
          Run a free diagnosis in minutes. See exactly where you stand across the engines that now answer your customers&apos; questions.
        </p>
        <form onSubmit={handleStart} className="max-w-md mx-auto mb-5 space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="yoursite.com"
              className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
            />
            <button type="submit" className="bg-[#c8372d] hover:bg-[#b02f26] text-white font-semibold px-5 py-3 rounded-xl text-sm transition-colors whitespace-nowrap">
              Free analysis →
            </button>
          </div>
          <input
            type="text"
            value={competitors}
            onChange={(e) => setCompetitors(e.target.value)}
            placeholder="Competitors (optional) — e.g. competitor1.com, competitor2.com"
            className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-white/40"
          />
        </form>
        <p className="text-xs text-white/30 tracking-wide uppercase">
          Free analysis · Paid plans track up to 7 engines · Results in ~60s
        </p>
      </section>

      {/* FOOTER */}
      <footer className="bg-[#0a0a0a] text-white px-8 py-16">
        <div className="max-w-6xl mx-auto grid grid-cols-5 gap-8 mb-12">
          <div className="col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <LogoIcon />
              <span className="text-lg font-bold">App<span className="text-[#c8372d]">Name</span></span>
            </div>
            <p className="text-sm text-[#888] mb-4">The visibility layer for AI search. Track. Treat. Repeat.</p>
            <div className="flex gap-3">
              {["Twitter", "LinkedIn", "GitHub"].map((s) => (
                <a key={s} href="#" className="text-xs text-[#555] hover:text-white transition-colors">{s}</a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#555] font-medium mb-3">Product</div>
            <div className="space-y-2">
              {["Visibility", "Research", "Generation", "Publishing", "Pricing", "Blog"].map((l) => (
                <a key={l} href="#" className="block text-sm text-[#888] hover:text-white transition-colors">{l}</a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#555] font-medium mb-3">Integrations</div>
            <div className="space-y-2">
              {["WordPress", "Shopify", "Framer", "Webhooks", "REST API"].map((l) => (
                <a key={l} href="#" className="block text-sm text-[#888] hover:text-white transition-colors">{l}</a>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-[#555] font-medium mb-3">Resources</div>
            <div className="space-y-2">
              {[["Free visibility audit", true], ["Methodology", false], ["GEO playbook", false]].map(([l, free]) => (
                <a key={l as string} href="#" className="flex items-center gap-1.5 text-sm text-[#888] hover:text-white transition-colors">
                  {l}
                  {free && <span className="text-[9px] bg-[#c8372d] text-white px-1 rounded font-bold">free</span>}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-[#1a1a1a] pt-6 flex items-center justify-between text-xs text-[#555]">
          <span>© 2026 AppName</span>
          <div className="flex gap-4">
            {["Privacy", "Terms", "DPA", "Security"].map((l) => (
              <a key={l} href="#" className="hover:text-white transition-colors">{l}</a>
            ))}
          </div>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            All systems operational
          </span>
        </div>
      </footer>

      <style jsx global>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
