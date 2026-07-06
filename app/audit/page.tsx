"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Keyword = {
  keyword: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
  difficulty: "low" | "medium" | "high";
  rationale: string;
};

type Analysis = {
  pageCount: number;
  brand: {
    name: string;
    adjective: string;
    niche: string;
    description: string;
    targetAudience: string[];
    competitors: string[];
  };
  keywords: Keyword[];
  article: {
    targetKeyword: string;
    title: string;
    intro: string;
    sections: string[];
    wordCount: number;
    seoOptimized: boolean;
  };
};

const DIFFICULTY_COLORS: Record<string, string> = {
  low: "text-mint",
  medium: "text-amber",
  high: "text-rose",
};
const DIFFICULTY_BG: Record<string, string> = {
  low: "bg-mint/10 border-mint/25",
  medium: "bg-amber/10 border-amber/25",
  high: "bg-rose/10 border-rose/25",
};

function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="6" stroke="#8cf5c3" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="12.5" stroke="#8cf5c3" strokeWidth="1.8" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
      <circle cx="26.5" cy="9" r="2.5" fill="#ffb469" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="inline">
      <rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Deterministic score derived from keyword difficulty mix */
function computeOpportunityScore(keywords: Keyword[]): number {
  if (!keywords.length) return 72;
  const diffMap = { low: 40, medium: 65, high: 88 };
  const avg = keywords.reduce((acc, k) => acc + diffMap[k.difficulty], 0) / keywords.length;
  return Math.min(Math.round(avg + keywords.length), 97);
}

function AuditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainParam = searchParams.get("domain") ?? "";

  const [domain, setDomain] = useState(domainParam);
  const [inputDomain, setInputDomain] = useState(domainParam);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [showPricing, setShowPricing] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [checkingOut, setCheckingOut] = useState(false);
  const pricingRef = useRef<HTMLDivElement>(null);

  async function startCheckout(plan: string) {
    setCheckingOut(true);
    try {
      const res = await fetch("/api/dodo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        router.push(`/auth?redirect=/audit?domain=${domain}`);
      } else {
        alert(data.error ?? "Checkout failed. Make sure Stripe is configured.");
      }
    } finally {
      setCheckingOut(false);
    }
  }

  useEffect(() => {
    if (domainParam) {
      setDomain(domainParam);
      setInputDomain(domainParam);
      runAnalysis(domainParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domainParam]);

  async function runAnalysis(d: string) {
    if (!d.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setResult(data);
      setDomain(d.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runAnalysis(inputDomain);
  }

  const cleanDomain = domain.replace(/^https?:\/\//, "");

  return (
    <div className="min-h-screen bg-background text-ink" style={{ fontFamily: "var(--font-instrument-sans, system-ui, sans-serif)" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 bg-surface border-b border-line">
        <a href="/" className="flex items-center gap-2">
          <LogoIcon />
          <span className="text-lg font-bold tracking-tight">RankOn<span className="text-mint">Geo</span></span>
        </a>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-line rounded-lg px-3 py-2 focus-within:border-mint/40 transition-colors">
            <svg className="w-3.5 h-3.5 text-[#bbb]" fill="none" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="anothersite.com"
              className="text-sm text-ink bg-transparent outline-none w-48 placeholder-[#bbb]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !inputDomain.trim()}
            className="bg-mint hover:bg-[#a5f8d1] disabled:opacity-50 text-[#062015] text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? "Scanning…" : "Analyze"}
          </button>
        </form>
      </nav>

      <main className="max-w-5xl mx-auto px-8 py-14 pb-36">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-5">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-2 border-[#37c98d]/20 rounded-full" />
              <div className="absolute inset-0 border-2 border-[#37c98d] border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-ink/80">Scanning {inputDomain.replace(/^https?:\/\//, "")}…</p>
              <p className="text-xs text-faint mt-1">Crawling pages · Extracting brand signals · Finding keywords</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="max-w-lg mx-auto mt-16 bg-rose/10 border border-rose/25 rounded-xl px-5 py-4 text-sm text-rose">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !result && (
          <div className="text-center py-32">
            <p className="text-faint text-sm">Enter a domain above to run a free audit.</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (() => {
          const opportunityScore = computeOpportunityScore(result.keywords);
          const competitors = result.brand.competitors ?? [];
          // Build leaderboard: competitors with slightly higher scores + user at bottom
          const leaderboard = competitors.slice(0, 4).map((c, i) => ({
            name: c,
            score: Math.min(opportunityScore + 18 - i * 5, 97),
            rank: i + 1,
          }));

          return (
            <div>
              {/* Header */}
              <div className="mb-10">
                <div className="flex items-center gap-2 text-xs text-faint mb-4">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M2 8a6 6 0 1012 0A6 6 0 002 8z" stroke="currentColor" strokeWidth="1.5" /><path d="M8 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  {result.pageCount} pages scanned · {result.brand.niche}
                </div>
                <h1 className="text-4xl font-black tracking-tight leading-tight mb-3 text-ink" style={{ letterSpacing: "-0.02em" }}>
                  AI visibility report for <span className="text-mint">{cleanDomain}</span>
                </h1>
                <p className="text-muted text-sm">Keyword opportunities, competitor intelligence, and a draft article — based on {result.pageCount} scanned pages.</p>
              </div>

              {/* ── STAT CARDS ── */}
              <div className="grid grid-cols-4 gap-3 mb-10">
                <div className="panel rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-faint font-medium mb-2">Opportunity Score</p>
                  <p className="text-4xl font-black text-ink leading-none mb-1">{opportunityScore}<span className="text-2xl text-faint">%</span></p>
                  <p className="text-[11px] text-faint">keyword growth potential</p>
                </div>
                <div className="panel rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-faint font-medium mb-2">AI Engines</p>
                  <p className="text-4xl font-black text-ink leading-none mb-1">7</p>
                  <p className="text-[11px] text-faint">ChatGPT · Claude · Gemini + 4</p>
                </div>
                <div className="panel rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-faint font-medium mb-2">Keywords Found</p>
                  <p className="text-4xl font-black text-ink leading-none mb-1">{result.keywords.length}</p>
                  <p className="text-[11px] text-faint">AI search opportunities</p>
                </div>
                <div className="panel rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-faint font-medium mb-2">Competitors</p>
                  <p className="text-4xl font-black text-ink leading-none mb-1">{competitors.length}</p>
                  <p className="text-[11px] text-faint">identified from your site</p>
                </div>
              </div>

              {/* ── COMPETITOR LEADERBOARD ── */}
              {leaderboard.length > 0 && (
                <div className="panel rounded-2xl p-7 mb-10">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-base font-bold text-ink">How you compare</h2>
                      <p className="text-xs text-faint mt-0.5">Estimated AI share of voice across your competitor set</p>
                    </div>
                    <span className="text-[10px] bg-amber/10 border border-amber/25 text-amber px-2.5 py-1 rounded-full font-medium uppercase tracking-wide">Estimated</span>
                  </div>
                  <div className="space-y-3">
                    {leaderboard.map((comp, i) => (
                      <div key={comp.name} className="flex items-center gap-4">
                        <span className="text-xs text-faint w-5 text-right shrink-0">#{i + 1}</span>
                        <div className="w-7 h-7 rounded-md bg-white/[0.06] flex items-center justify-center shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://www.google.com/s2/favicons?domain=${comp.name.includes(".") ? comp.name : comp.name + ".com"}&sz=16`}
                            alt=""
                            className="w-4 h-4 rounded-sm"
                            onError={(e) => {
                              const t = e.target as HTMLImageElement;
                              t.style.display = "none";
                              t.parentElement!.textContent = comp.name[0].toUpperCase();
                            }}
                          />
                        </div>
                        <span className="text-sm text-ink/80 w-40 shrink-0 truncate">{comp.name}</span>
                        <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-[#d0cac3] rounded-full" style={{ width: `${comp.score}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-muted w-10 text-right shrink-0">{comp.score}%</span>
                      </div>
                    ))}
                    {/* User's domain - locked */}
                    <div className="flex items-center gap-4 mt-1 pt-3 border-t border-[#f0ece6]">
                      <span className="text-xs text-mint font-bold w-5 text-right shrink-0">#{leaderboard.length + 1}</span>
                      <div className="w-7 h-7 rounded-md border border-[#37c98d]/30 bg-mint-deep/5 flex items-center justify-center shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${cleanDomain}&sz=16`}
                          alt=""
                          className="w-4 h-4 rounded-sm"
                          onError={(e) => {
                            const t = e.target as HTMLImageElement;
                            t.style.display = "none";
                            t.parentElement!.textContent = cleanDomain[0].toUpperCase();
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold text-mint w-40 shrink-0 truncate">{cleanDomain}</span>
                      <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full bg-mint-deep/30 rounded-full" style={{ width: "20%" }} />
                      </div>
                      <div className="flex items-center gap-1.5 w-10 text-right shrink-0">
                        <span className="text-[11px] text-faint"><LockIcon /> Sign up</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const p = new URLSearchParams({ domain });
                      router.push(`/setup?${p}`);
                    }}
                    className="mt-5 w-full text-xs font-medium text-mint hover:text-[#b02f26] py-2 border border-[#37c98d]/20 hover:border-[#37c98d]/40 rounded-lg transition-colors"
                  >
                    Sign up to see your real AI visibility score →
                  </button>
                </div>
              )}

              {/* ── BRAND + KEYWORDS (side by side) ── */}
              <div className="grid grid-cols-2 gap-6 mb-6 items-start">
                {/* Brand snapshot */}
                <div className="panel rounded-2xl p-7">
                  <div className="flex items-center gap-2 mb-5">
                    <svg className="w-3.5 h-3.5 text-mint" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span className="text-xs font-semibold text-ink/80 uppercase tracking-widest">Brand Snapshot</span>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="text-2xl font-black text-ink tracking-tight">{result.brand.name}</h2>
                    <span className="text-[10px] border border-line text-faint px-2 py-0.5 rounded uppercase tracking-widest font-medium">
                      {result.brand.adjective}
                    </span>
                  </div>
                  <div className="text-xs text-faint mb-1 uppercase tracking-wide font-medium">Niche</div>
                  <p className="text-sm font-medium text-ink/80 mb-4">{result.brand.niche}</p>
                  <p className="text-sm text-muted leading-relaxed mb-5 border-b border-[#f0ece8] pb-5">{result.brand.description}</p>
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-widest text-faint font-medium mb-2">Target Audience</div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.brand.targetAudience.map((a) => (
                        <span key={a} className="text-xs bg-white/[0.06] text-muted px-2.5 py-1 rounded-full">{a}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-faint font-medium mb-2">Competitors</div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.brand.competitors.map((c) => (
                        <span key={c} className="text-xs bg-mint/10 border border-mint/25 text-mint px-2.5 py-1 rounded-full">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Keywords */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-3.5 h-3.5 text-mint" fill="none" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span className="text-xs font-semibold text-ink/80 uppercase tracking-widest">Keyword Opportunities</span>
                  </div>
                  <div className="space-y-2">
                    {result.keywords.map((kw, i) => (
                      <div key={i} className="panel rounded-xl px-4 py-3.5 hover:border-[#c8c0b8] transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="text-sm font-semibold text-ink leading-snug">{kw.keyword}</p>
                          <div className={`flex items-center gap-1 shrink-0 text-[10px] border px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_BG[kw.difficulty]} ${DIFFICULTY_COLORS[kw.difficulty]}`}>
                            {kw.difficulty}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] uppercase tracking-widest text-faint font-medium">{kw.intent}</span>
                        </div>
                        <p className="text-xs text-faint leading-relaxed">{kw.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── AI ANSWERS PREVIEW (blurred/locked) ── */}
              <div className="panel rounded-2xl overflow-hidden mb-6">
                <div className="px-7 pt-7 pb-5 border-b border-[#f0ece8]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-3.5 h-3.5 text-mint" fill="none" viewBox="0 0 16 16"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        <span className="text-xs font-semibold text-ink/80 uppercase tracking-widest">What AI says about your category</span>
                      </div>
                      <p className="text-xs text-faint">How ChatGPT and Claude respond to your top queries</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[10px] bg-white/[0.04] border border-line px-2 py-1 rounded-full text-muted font-medium">
                        <img src="/openai.svg" alt="ChatGPT" className="h-2.5 w-auto" style={{ filter: "brightness(0) opacity(0.5)" }} />
                        ChatGPT
                      </span>
                      <span className="flex items-center gap-1 text-[10px] bg-white/[0.04] border border-line px-2 py-1 rounded-full text-muted font-medium">
                        <img src="/claude.svg" alt="Claude" className="h-2.5 w-auto" style={{ filter: "brightness(0) opacity(0.5)" }} />
                        Claude
                      </span>
                    </div>
                  </div>
                </div>
                <div className="relative">
                  {/* Blurred preview */}
                  <div className="px-7 py-5 select-none" style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}>
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold bg-mint/10 text-mint border border-mint/20 px-2 py-0.5 rounded-full uppercase tracking-wide">ChatGPT</span>
                        <span className="text-xs text-faint truncate">{result.keywords[0]?.keyword ?? "What is " + result.brand.name + "?"}</span>
                      </div>
                      <div className="text-sm text-muted leading-relaxed">
                        <strong>{result.brand.name}</strong> is widely regarded as one of the leading solutions in {result.brand.niche}.
                        It offers a comprehensive approach that {result.brand.description.slice(0, 80)}…
                        When comparing options in this category, it stands out for its developer-friendly API, cross-platform support,
                        and active community. Competitors like {result.brand.competitors[0]} and {result.brand.competitors[1] ?? "others"} offer
                        similar functionality but differ in ecosystem depth and ease of onboarding.
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold bg-orange-400/10 text-orange-300 border border-orange-400/25 px-2 py-0.5 rounded-full uppercase tracking-wide">Claude</span>
                        <span className="text-xs text-faint truncate">{result.keywords[1]?.keyword ?? "best tools for " + result.brand.niche}</span>
                      </div>
                      <div className="text-sm text-muted leading-relaxed">
                        For {result.brand.niche}, several tools stand out: {result.brand.name} is increasingly popular due to its
                        modern architecture and strong documentation. {result.brand.competitors[0] ?? "Alternatives"} remains the most widely used,
                        though teams migrating to newer stacks often cite {result.brand.name} as the preferred choice for
                        reliability and cross-browser consistency in 2025–2026.
                      </div>
                    </div>
                  </div>
                  {/* Lock overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-[1px]">
                    <div className="panel rounded-2xl px-8 py-6 text-center shadow-lg max-w-sm">
                      <div className="w-10 h-10 bg-white/[0.06] rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="2" stroke="#888" strokeWidth="1.5" /><path d="M5 7V5a3 3 0 016 0v2" stroke="#888" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      </div>
                      <p className="text-sm font-semibold text-ink mb-1">See how AI answers your queries</p>
                      <p className="text-xs text-faint mb-4">Track real ChatGPT, Claude, Gemini + 4 more responses — and see if your brand is mentioned.</p>
                      <button
                        onClick={() => {
                          const p = new URLSearchParams({ domain });
                          router.push(`/setup?${p}`);
                        }}
                        className="w-full bg-mint hover:bg-[#a5f8d1] text-[#062015] text-sm font-semibold py-2.5 rounded-xl transition-colors"
                      >
                        Start free tracking →
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ARTICLE DRAFT ── */}
              <div className="panel rounded-2xl p-7">
                <div className="flex items-center gap-2 mb-5">
                  <svg className="w-3.5 h-3.5 text-mint" fill="none" viewBox="0 0 16 16"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  <span className="text-xs font-semibold text-ink/80 uppercase tracking-widest">Article We&apos;d Write For You</span>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] uppercase tracking-widest text-faint font-medium">Targeting:</span>
                  <span className="text-[10px] text-muted font-medium">{result.article.targetKeyword}</span>
                </div>
                <h3 className="text-xl font-black text-ink tracking-tight mb-4">{result.article.title}</h3>
                {result.article.intro && (
                  <p className="italic text-muted text-sm leading-relaxed mb-6 border-l-2 border-line pl-4">
                    {result.article.intro}
                  </p>
                )}
                <div className="grid grid-cols-3 gap-2.5 mb-6">
                  {result.article.sections.map((s, i) => (
                    <div key={i} className="bg-background border border-line rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-5 h-5 bg-mint text-[#062015] rounded flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</div>
                      <span className="text-xs text-ink/80 font-medium leading-snug">{s}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-5 border-t border-[#f0ece8]">
                  <div className="flex items-center gap-4 text-faint text-xs">
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      ~{result.article.wordCount.toLocaleString()} words
                    </span>
                    {result.article.seoOptimized && (
                      <span className="flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        SEO optimized
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        title: result.article.title,
                        keyword: result.article.targetKeyword,
                        brand: result.brand.name,
                        niche: result.brand.niche,
                        sections: encodeURIComponent(JSON.stringify(result.article.sections)),
                      });
                      router.push(`/article?${params}`);
                    }}
                    className="text-xs font-semibold text-mint hover:text-[#a5f8d1] flex items-center gap-1 transition-colors"
                  >
                    Preview article →
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Pricing section */}
        {showPricing && result && (
          <div ref={pricingRef} className="mt-20 pt-16 border-t border-line">
            <div className="mb-10">
              <h2 className="text-3xl font-black text-ink tracking-tight mb-2">Start tracking in 60 seconds.</h2>
              <p className="text-muted text-sm">
                <span className="font-semibold text-ink">{result.keywords.length} keyword opportunities</span> found for {cleanDomain}. Every plan ships measurement, research, generation, and publishing.
              </p>
            </div>
            <div className="flex items-center gap-2 mb-10">
              <button onClick={() => setBilling("monthly")} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${billing === "monthly" ? "bg-mint text-[#062015]" : "text-muted hover:text-ink"}`}>Monthly</button>
              <button onClick={() => setBilling("annual")} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${billing === "annual" ? "bg-mint text-[#062015]" : "text-muted hover:text-ink"}`}>
                Annual <span className="text-xs bg-mint/15 text-mint px-1.5 py-0.5 rounded font-semibold">−17%</span>
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4 items-start">
              {[
                { name: "Free", desc: "Get started, no card needed.", price: "0", cta: "Start free →", action: () => router.push(`/setup?domain=${domain}`), highlight: false, features: ["1 website", "10 tracked prompts", "3 AI engines", "Manual refresh", "Basic visibility score"] },
                { name: "Pro", desc: "For solopreneurs & small sites.", price: billing === "annual" ? "41" : "49", cta: "Get started →", action: () => startCheckout("starter"), highlight: false, features: ["50 credits for Reddit upvotes", "1 website", "50 tracked prompts", "4,000 AI responses/mo", "3 AI engines", "Weekly refresh", "CMS publishing"] },
                { name: "Business", desc: "For growing brands.", price: billing === "annual" ? "82" : "99", cta: "Get started →", action: () => startCheckout("growth"), highlight: true, features: ["100 credits for Reddit upvotes", "3 websites", "150 tracked prompts", "6,000 AI responses/mo", "6 AI engines", "Daily updates", "Gap detection", "7 competitors", "Auto-publish"] },
                { name: "Scale", desc: "For teams — full autopilot.", price: billing === "annual" ? "124" : "149", cta: "Get started →", action: () => startCheckout("enterprise"), highlight: false, features: ["150 credits for Reddit upvotes", "10 websites", "400 tracked prompts", "15,000 AI responses/mo", "All 7 AI engines", "Unlimited seats", "Full autopilot"] },
              ].map((plan) => (
                <div key={plan.name} className={`rounded-2xl p-6 ${plan.highlight ? "bg-gradient-to-b from-mint/10 to-mint/[0.02] shadow-[inset_0_0_0_1px_rgba(140,245,195,0.3)]" : "panel"}`}>
                  {plan.highlight && <span className="inline-block text-xs bg-mint text-[#062015] font-semibold px-3 py-1 rounded-full mb-3">Most picked</span>}
                  <p className={`text-sm font-semibold mb-1 ${plan.highlight ? "text-mint" : "text-ink"}`}>{plan.name}</p>
                  <p className="text-xs mb-5 text-faint">{plan.desc}</p>
                  <div className="flex items-end gap-1 mb-6">
                    <span className="text-4xl font-black text-ink">${plan.price}</span>
                    <span className="text-faint text-sm mb-1">/ month</span>
                  </div>
                  <button
                    onClick={plan.action}
                    disabled={checkingOut}
                    className={`w-full text-sm font-medium py-2.5 rounded-lg transition-colors mb-6 disabled:opacity-50 ${plan.highlight ? "bg-mint hover:bg-[#a5f8d1] text-[#062015]" : "border border-line hover:border-line-2 text-ink"}`}
                  >
                    {plan.cta}
                  </button>
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-muted">
                        <span className="text-faint/70">—</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-xs text-faint mt-6 text-center">Cancel anytime. Your data for <span className="font-medium">{cleanDomain}</span> transfers to your account automatically.</p>
          </div>
        )}
      </main>

      {/* Sticky footer bar */}
      {result && !loading && (
        <div className="fixed bottom-0 inset-x-0 bg-surface border-t border-line px-8 py-3.5 flex items-center justify-between z-50" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.06)" }}>
          <div>
            <p className="text-sm text-muted">
              <span className="font-semibold text-ink">{cleanDomain}</span>
              {" · "}
              <span>{result.keywords.length} keyword opportunities</span>
              {" · "}
              <span>{result.brand.competitors.length} competitors found</span>
            </p>
          </div>
          {showPricing ? (
            <button onClick={() => { setShowPricing(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-sm font-medium text-muted hover:text-ink transition-colors">
              ← Back to results
            </button>
          ) : (
            <button
              onClick={() => {
                setShowPricing(true);
                setTimeout(() => pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
              }}
              className="bg-mint hover:bg-[#a5f8d1] text-[#062015] text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Start free tracking →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <Suspense>
      <AuditContent />
    </Suspense>
  );
}
