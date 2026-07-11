"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

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
  low: "text-[var(--olive)]",
  medium: "text-[var(--rust-deep)]",
  high: "text-red-700",
};
const DIFFICULTY_BG: Record<string, string> = {
  low: "bg-[var(--olive-wash)] border-[var(--olive)]/25",
  medium: "bg-[var(--rust-wash)] border-[var(--rust)]/25",
  high: "bg-red-500/10 border-red-500/25",
};

function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <circle cx="16" cy="16" r="6" stroke="var(--rust)" strokeWidth="2.5" />
      <circle cx="16" cy="16" r="12.5" stroke="var(--rust)" strokeWidth="1.8" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
      <circle cx="26.5" cy="9" r="2.5" fill="var(--olive)" />
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
        body: JSON.stringify({ plan, cancelPath: window.location.pathname + window.location.search }),
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
    <div className="min-h-screen bg-[var(--cream)] text-[var(--ink)]" style={{ fontFamily: "var(--font-work-sans), sans-serif" }}>
      {/* Nav */}
      <nav className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-8 py-4 bg-[var(--surface)] border-b border-[var(--line)]">
        <a href="/" className="flex items-center gap-2">
          <LogoIcon />
          <span className="text-lg font-bold tracking-tight">RankOn<span className="text-[var(--rust)]">Geo</span></span>
        </a>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-[var(--surface)] border border-[var(--line)] rounded-lg px-3 py-2 focus-within:border-[var(--rust)]/40 transition-colors">
            <svg className="w-3.5 h-3.5 text-[var(--ink-faint)]" fill="none" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="anothersite.com"
              className="text-sm text-[var(--ink)] bg-transparent outline-none w-32 sm:w-48 placeholder:text-[var(--ink-faint)]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !inputDomain.trim()}
            className="bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? "Scanning…" : "Analyze"}
          </button>
        </form>
      </nav>

      <main className="max-w-5xl mx-auto px-5 sm:px-8 py-14 pb-36">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-5">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-2 border-[var(--rust)]/20 rounded-full" />
              <div className="absolute inset-0 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--ink)]/80">Scanning {inputDomain.replace(/^https?:\/\//, "")}…</p>
              <p className="text-xs text-[var(--ink-faint)] mt-1">Crawling pages · Extracting brand signals · Finding keywords</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="max-w-lg mx-auto mt-16 bg-red-500/10 border border-red-500/25 rounded-xl px-5 py-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !result && (
          <div className="max-w-lg mx-auto text-center py-24">
            <LogoIcon size={36} />
            <h1 className="font-signal-serif text-3xl leading-tight mt-5 mb-2 text-[var(--ink)]" style={{ letterSpacing: "-0.02em" }}>
              Free AI visibility audit
            </h1>
            <p className="text-[var(--ink-soft)] text-sm mb-8">
              We&apos;ll crawl your site, find your keyword opportunities, and draft an article — in about a minute.
            </p>
            <form onSubmit={handleSubmit} className="flex items-center gap-2 mb-6">
              <div className="flex-1 flex items-center gap-2 bg-[var(--surface)] border border-[var(--line)] rounded-xl px-4 py-3 focus-within:border-[var(--rust)]/40 transition-colors">
                <svg className="w-4 h-4 text-[var(--ink-faint)] shrink-0" fill="none" viewBox="0 0 16 16">
                  <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M8 5v3l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
                <input
                  type="text"
                  value={inputDomain}
                  onChange={(e) => setInputDomain(e.target.value)}
                  placeholder="yoursite.com"
                  className="flex-1 text-sm text-[var(--ink)] bg-transparent outline-none placeholder:text-[var(--ink-faint)]"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !inputDomain.trim()}
                className="bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] text-sm font-medium px-5 py-3 rounded-xl transition-colors"
              >
                Analyze
              </button>
            </form>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <span className="text-xs text-[var(--ink-faint)]">Try:</span>
              {["stripe.com", "notion.so", "linear.app"].map((d) => (
                <button
                  key={d}
                  onClick={() => { setInputDomain(d); runAnalysis(d); }}
                  className="text-xs bg-[var(--line-soft)] hover:bg-[var(--line)] text-[var(--ink-soft)] px-2.5 py-1 rounded-full transition-colors"
                >
                  {d}
                </button>
              ))}
            </div>
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
                <div className="flex items-center gap-2 text-xs text-[var(--ink-faint)] mb-4">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M2 8a6 6 0 1012 0A6 6 0 002 8z" stroke="currentColor" strokeWidth="1.5" /><path d="M8 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  {result.pageCount} pages scanned · {result.brand.niche}
                </div>
                <h1 className="font-signal-serif text-4xl leading-tight mb-3 text-[var(--ink)]" style={{ letterSpacing: "-0.02em" }}>
                  AI visibility report for <span className="text-[var(--rust)] italic">{cleanDomain}</span>
                </h1>
                <p className="text-[var(--ink-soft)] text-sm">Keyword opportunities, competitor intelligence, and a draft article — based on {result.pageCount} scanned pages.</p>
              </div>

              {/* ── STAT CARDS ── */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium mb-2">Opportunity Score</p>
                  <p className="font-signal-mono text-4xl font-semibold text-[var(--ink)] leading-none mb-1">{opportunityScore}<span className="text-2xl text-[var(--ink-faint)]">%</span></p>
                  <p className="text-[11px] text-[var(--ink-faint)]">keyword growth potential</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium mb-2">AI Engines</p>
                  <p className="font-signal-mono text-4xl font-semibold text-[var(--ink)] leading-none mb-1">7</p>
                  <p className="text-[11px] text-[var(--ink-faint)]">ChatGPT · Claude · Gemini + 4</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium mb-2">Keywords Found</p>
                  <p className="font-signal-mono text-4xl font-semibold text-[var(--ink)] leading-none mb-1">{result.keywords.length}</p>
                  <p className="text-[11px] text-[var(--ink-faint)]">AI search opportunities</p>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5">
                  <p className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium mb-2">Competitors</p>
                  <p className="font-signal-mono text-4xl font-semibold text-[var(--ink)] leading-none mb-1">{competitors.length}</p>
                  <p className="text-[11px] text-[var(--ink-faint)]">identified from your site</p>
                </div>
              </div>

              {/* ── COMPETITOR LEADERBOARD ── */}
              {leaderboard.length > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-7 mb-10">
                  <div className="flex items-center justify-between mb-5">
                    <div>
                      <h2 className="text-base font-bold text-[var(--ink)]">How you compare</h2>
                      <p className="text-xs text-[var(--ink-faint)] mt-0.5">Estimated AI share of voice across your competitor set</p>
                    </div>
                    <span className="text-[10px] bg-[var(--rust-wash)] border border-[var(--rust)]/25 text-[var(--rust-deep)] px-2.5 py-1 rounded-full font-medium uppercase tracking-wide">Estimated</span>
                  </div>
                  <div className="space-y-3">
                    {leaderboard.map((comp, i) => (
                      <div key={comp.name} className="flex items-center gap-4">
                        <span className="text-xs text-[var(--ink-faint)] w-5 text-right shrink-0">#{i + 1}</span>
                        <div className="w-7 h-7 rounded-md bg-[var(--line-soft)] flex items-center justify-center shrink-0">
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
                        <span className="text-sm text-[var(--ink)]/80 w-40 shrink-0 truncate">{comp.name}</span>
                        <div className="flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
                          <div className="h-full bg-[#60a5fa] rounded-full" style={{ width: `${comp.score}%` }} />
                        </div>
                        <span className="text-sm font-semibold text-[var(--ink-soft)] w-10 text-right shrink-0">{comp.score}%</span>
                      </div>
                    ))}
                    {/* User's domain - locked */}
                    <div className="flex items-center gap-4 mt-1 pt-3 border-t border-[var(--line)]">
                      <span className="text-xs text-[var(--rust)] font-bold w-5 text-right shrink-0">#{leaderboard.length + 1}</span>
                      <div className="w-7 h-7 rounded-md border border-[var(--rust)]/30 bg-[var(--rust-wash)] flex items-center justify-center shrink-0">
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
                      <span className="text-sm font-bold text-[var(--rust)] w-40 shrink-0 truncate">{cleanDomain}</span>
                      <div className="flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
                        <div className="h-full bg-[var(--rust)]/30 rounded-full" style={{ width: "20%" }} />
                      </div>
                      <div className="flex items-center gap-1.5 w-10 text-right shrink-0">
                        <span className="text-[11px] text-[var(--ink-faint)]"><LockIcon /> Sign up</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const p = new URLSearchParams({ domain });
                      router.push(`/setup?${p}`);
                    }}
                    className="mt-5 w-full text-xs font-medium text-[var(--rust)] hover:text-[var(--rust-deep)] py-2 border border-[var(--rust)]/20 hover:border-[var(--rust)]/40 rounded-lg transition-colors"
                  >
                    Sign up to see your real AI visibility score →
                  </button>
                </div>
              )}

              {/* ── BRAND + KEYWORDS (side by side) ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 items-start">
                {/* Brand snapshot */}
                <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-7">
                  <div className="flex items-center gap-2 mb-5">
                    <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span className="text-xs font-semibold text-[var(--ink)]/80 uppercase tracking-widest">Brand Snapshot</span>
                  </div>
                  <div className="flex items-center gap-3 mb-4">
                    <h2 className="font-signal-serif text-2xl text-[var(--ink)] tracking-tight">{result.brand.name}</h2>
                    <span className="text-[10px] border border-[var(--line)] text-[var(--ink-faint)] px-2 py-0.5 rounded uppercase tracking-widest font-medium">
                      {result.brand.adjective}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--ink-faint)] mb-1 uppercase tracking-wide font-medium">Niche</div>
                  <p className="text-sm font-medium text-[var(--ink)]/80 mb-4">{result.brand.niche}</p>
                  <p className="text-sm text-[var(--ink-soft)] leading-relaxed mb-5 border-b border-[var(--line)] pb-5">{result.brand.description}</p>
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium mb-2">Target Audience</div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.brand.targetAudience.map((a) => (
                        <span key={a} className="text-xs bg-[var(--line-soft)] text-[var(--ink-soft)] px-2.5 py-1 rounded-full">{a}</span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium mb-2">Competitors</div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.brand.competitors.map((c) => (
                        <span key={c} className="text-xs bg-[var(--rust-wash)] border border-[var(--rust)]/25 text-[var(--rust-deep)] px-2.5 py-1 rounded-full">{c}</span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Keywords */}
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span className="text-xs font-semibold text-[var(--ink)]/80 uppercase tracking-widest">Keyword Opportunities</span>
                  </div>
                  <div className="space-y-2">
                    {result.keywords.map((kw, i) => (
                      <div key={i} className="bg-[var(--surface)] border border-[var(--line)] rounded-xl px-4 py-3.5 hover:border-[var(--rust)]/30 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <p className="text-sm font-semibold text-[var(--ink)] leading-snug">{kw.keyword}</p>
                          <div className={`flex items-center gap-1 shrink-0 text-[10px] border px-2 py-0.5 rounded-full font-medium ${DIFFICULTY_BG[kw.difficulty]} ${DIFFICULTY_COLORS[kw.difficulty]}`}>
                            {kw.difficulty}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium">{kw.intent}</span>
                        </div>
                        <p className="text-xs text-[var(--ink-faint)] leading-relaxed">{kw.rationale}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── AI ANSWERS PREVIEW (blurred/locked) ── */}
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl overflow-hidden mb-6">
                <div className="px-7 pt-7 pb-5 border-b border-[var(--line)]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 16 16"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                        <span className="text-xs font-semibold text-[var(--ink)]/80 uppercase tracking-widest">What AI says about your category</span>
                      </div>
                      <p className="text-xs text-[var(--ink-faint)]">How ChatGPT and Claude respond to your top queries</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1 text-[10px] bg-[var(--line-soft)] border border-[var(--line)] px-2 py-1 rounded-full text-[var(--ink-soft)] font-medium">
                        <img src="/openai.svg" alt="ChatGPT" className="h-2.5 w-auto" style={{ filter: "brightness(0) opacity(0.5)" }} />
                        ChatGPT
                      </span>
                      <span className="flex items-center gap-1 text-[10px] bg-[var(--line-soft)] border border-[var(--line)] px-2 py-1 rounded-full text-[var(--ink-soft)] font-medium">
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
                        <span className="text-[10px] font-semibold bg-[var(--rust-wash)] text-[var(--rust-deep)] border border-[var(--rust)]/20 px-2 py-0.5 rounded-full uppercase tracking-wide">ChatGPT</span>
                        <span className="text-xs text-[var(--ink-faint)] truncate">{result.keywords[0]?.keyword ?? "What is " + result.brand.name + "?"}</span>
                      </div>
                      <div className="text-sm text-[var(--ink-soft)] leading-relaxed">
                        <strong>{result.brand.name}</strong> is widely regarded as one of the leading solutions in {result.brand.niche}.
                        It offers a comprehensive approach that {result.brand.description.slice(0, 80)}…
                        When comparing options in this category, it stands out for its developer-friendly API, cross-platform support,
                        and active community. Competitors like {result.brand.competitors[0]} and {result.brand.competitors[1] ?? "others"} offer
                        similar functionality but differ in ecosystem depth and ease of onboarding.
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] font-semibold bg-orange-500/10 text-orange-700 border border-orange-500/25 px-2 py-0.5 rounded-full uppercase tracking-wide">Claude</span>
                        <span className="text-xs text-[var(--ink-faint)] truncate">{result.keywords[1]?.keyword ?? "best tools for " + result.brand.niche}</span>
                      </div>
                      <div className="text-sm text-[var(--ink-soft)] leading-relaxed">
                        For {result.brand.niche}, several tools stand out: {result.brand.name} is increasingly popular due to its
                        modern architecture and strong documentation. {result.brand.competitors[0] ?? "Alternatives"} remains the most widely used,
                        though teams migrating to newer stacks often cite {result.brand.name} as the preferred choice for
                        reliability and cross-browser consistency in 2025–2026.
                      </div>
                    </div>
                  </div>
                  {/* Lock overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[var(--cream)]/70 backdrop-blur-[2px]">
                    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl px-8 py-6 text-center shadow-lg max-w-sm">
                      <div className="w-10 h-10 bg-[var(--line-soft)] rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="8" rx="2" stroke="currentColor" className="text-[var(--ink-faint)]" strokeWidth="1.5" /><path d="M5 7V5a3 3 0 016 0v2" stroke="currentColor" className="text-[var(--ink-faint)]" strokeWidth="1.5" strokeLinecap="round" /></svg>
                      </div>
                      <p className="text-sm font-semibold text-[var(--ink)] mb-1">See how AI answers your queries</p>
                      <p className="text-xs text-[var(--ink-faint)] mb-4">Track real ChatGPT, Claude, Gemini + 4 more responses — and see if your brand is mentioned.</p>
                      <button
                        onClick={() => {
                          const p = new URLSearchParams({ domain });
                          router.push(`/setup?${p}`);
                        }}
                        className="w-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] text-sm font-semibold py-2.5 rounded-xl transition-colors"
                      >
                        Start free tracking →
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── ARTICLE DRAFT ── */}
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-7">
                <div className="flex items-center gap-2 mb-5">
                  <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 16 16"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  <span className="text-xs font-semibold text-[var(--ink)]/80 uppercase tracking-widest">Article We&apos;d Write For You</span>
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--ink-faint)] font-medium">Targeting:</span>
                  <span className="text-[10px] text-[var(--ink-soft)] font-medium">{result.article.targetKeyword}</span>
                </div>
                <h3 className="font-signal-serif text-xl text-[var(--ink)] tracking-tight mb-4">{result.article.title}</h3>
                {result.article.intro && (
                  <p className="italic text-[var(--ink-soft)] text-sm leading-relaxed mb-6 border-l-2 border-[var(--line)] pl-4">
                    {result.article.intro}
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
                  {result.article.sections.map((s, i) => (
                    <div key={i} className="bg-[var(--cream)] border border-[var(--line)] rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-5 h-5 bg-[var(--rust)] text-[var(--surface)] rounded flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</div>
                      <span className="text-xs text-[var(--ink)]/80 font-medium leading-snug">{s}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between pt-5 border-t border-[var(--line)] flex-wrap gap-3">
                  <div className="flex items-center gap-4 text-[var(--ink-faint)] text-xs">
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
                      const p = new URLSearchParams({ domain });
                      router.push(`/setup?${p}`);
                    }}
                    className="text-xs font-semibold text-[var(--rust)] hover:text-[var(--rust-deep)] flex items-center gap-1 transition-colors"
                  >
                    Sign up to generate & publish this article →
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Pricing section */}
        {showPricing && result && (
          <div ref={pricingRef} className="mt-20 pt-16 border-t border-[var(--line)]">
            <div className="mb-10">
              <h2 className="font-signal-serif text-3xl text-[var(--ink)] tracking-tight mb-2">Start tracking in 60 seconds.</h2>
              <p className="text-[var(--ink-soft)] text-sm">
                <span className="font-semibold text-[var(--ink)]">{result.keywords.length} keyword opportunities</span> found for {cleanDomain}. Every plan ships measurement, research, generation, and publishing.
              </p>
            </div>
            <div className="flex items-center gap-2 mb-10">
              <button onClick={() => setBilling("monthly")} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${billing === "monthly" ? "bg-[var(--rust)] text-[var(--surface)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}>Monthly</button>
              <button onClick={() => setBilling("annual")} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${billing === "annual" ? "bg-[var(--rust)] text-[var(--surface)]" : "text-[var(--ink-soft)] hover:text-[var(--ink)]"}`}>
                Annual <span className="text-xs bg-[var(--rust-wash)] text-[var(--rust-deep)] px-1.5 py-0.5 rounded font-semibold">−17%</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
              {[
                { name: "Free", desc: "Get started, no card needed.", price: "0", cta: "Start free →", action: () => router.push(`/setup?domain=${domain}`), highlight: false, features: ["1 website", "10 tracked prompts", "3 AI engines", "Manual refresh", "Basic visibility score"] },
                { name: "Pro", desc: "For solopreneurs & small sites.", price: billing === "annual" ? "41" : "49", cta: "Get started →", action: () => startCheckout("starter"), highlight: false, features: ["50 credits for Reddit upvotes", "1 website", "50 tracked prompts", "4,000 AI responses/mo", "3 AI engines", "Weekly refresh", "CMS publishing"] },
                { name: "Business", desc: "For growing brands.", price: billing === "annual" ? "82" : "99", cta: "Get started →", action: () => startCheckout("growth"), highlight: true, features: ["100 credits for Reddit upvotes", "3 websites", "150 tracked prompts", "6,000 AI responses/mo", "6 AI engines", "Daily updates", "Gap detection", "7 competitors", "Auto-publish"] },
                { name: "Scale", desc: "For teams — full autopilot.", price: billing === "annual" ? "124" : "149", cta: "Get started →", action: () => startCheckout("enterprise"), highlight: false, features: ["150 credits for Reddit upvotes", "10 websites", "400 tracked prompts", "15,000 AI responses/mo", "All 7 AI engines", "Unlimited seats", "Full autopilot"] },
              ].map((plan) => (
                <div key={plan.name} className={`rounded-2xl p-6 bg-[var(--surface)] ${plan.highlight ? "border-2 border-[var(--rust)]/30" : "border border-[var(--line)]"}`}>
                  {plan.highlight && <span className="inline-block text-xs bg-[var(--rust)] text-[var(--surface)] font-semibold px-3 py-1 rounded-full mb-3">Most picked</span>}
                  <p className={`text-sm font-semibold mb-1 ${plan.highlight ? "text-[var(--rust)]" : "text-[var(--ink)]"}`}>{plan.name}</p>
                  <p className="text-xs mb-5 text-[var(--ink-faint)]">{plan.desc}</p>
                  <div className="flex items-end gap-1 mb-6">
                    <span className="font-signal-mono text-4xl font-semibold text-[var(--ink)]">${plan.price}</span>
                    <span className="text-[var(--ink-faint)] text-sm mb-1">/ month</span>
                  </div>
                  <button
                    onClick={plan.action}
                    disabled={checkingOut}
                    className={`w-full text-sm font-medium py-2.5 rounded-lg transition-colors mb-6 disabled:opacity-50 ${plan.highlight ? "bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)]" : "border border-[var(--line)] hover:border-[var(--rust)]/30 text-[var(--ink)]"}`}
                  >
                    {plan.cta}
                  </button>
                  <ul className="space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-xs text-[var(--ink-soft)]">
                        <span className="text-[var(--ink-faint)]/70">—</span>{f}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="text-xs text-[var(--ink-faint)] mt-6 text-center">Cancel anytime. Your data for <span className="font-medium">{cleanDomain}</span> transfers to your account automatically.</p>
          </div>
        )}
      </main>

      {/* Sticky footer bar */}
      {result && !loading && (
        <div className="fixed bottom-0 inset-x-0 bg-[var(--surface)] border-t border-[var(--line)] px-8 py-3.5 flex items-center justify-between z-50" style={{ boxShadow: "0 -4px 24px rgba(48,40,33,0.08)" }}>
          <div>
            <p className="text-sm text-[var(--ink-soft)]">
              <span className="font-semibold text-[var(--ink)]">{cleanDomain}</span>
              {" · "}
              <span>{result.keywords.length} keyword opportunities</span>
              {" · "}
              <span>{result.brand.competitors.length} competitors found</span>
            </p>
          </div>
          {showPricing ? (
            <button onClick={() => { setShowPricing(false); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="text-sm font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors">
              ← Back to results
            </button>
          ) : (
            <button
              onClick={() => {
                setShowPricing(true);
                setTimeout(() => pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
              }}
              className="bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
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
  const signalVars = {
    "--cream": "oklch(0.965 0.013 80)",
    "--surface": "oklch(0.99 0.006 80)",
    "--ink": "oklch(0.19 0.014 55)",
    "--ink-soft": "oklch(0.46 0.02 55)",
    "--ink-faint": "oklch(0.62 0.02 60)",
    "--rust": "oklch(0.56 0.15 38)",
    "--rust-deep": "oklch(0.46 0.14 36)",
    "--rust-wash": "oklch(0.56 0.15 38 / 12%)",
    "--olive": "oklch(0.52 0.1 130)",
    "--olive-wash": "oklch(0.52 0.1 130 / 12%)",
    "--line": "oklch(0.19 0.014 55 / 10%)",
    "--line-soft": "oklch(0.19 0.014 55 / 6%)",
  } as React.CSSProperties;

  return (
    <div className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable}`} style={signalVars}>
      <Suspense>
        <AuditContent />
      </Suspense>
    </div>
  );
}
