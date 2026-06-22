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

const INTENT_LABELS: Record<string, string> = {
  informational: "Informational",
  commercial: "Commercial",
  transactional: "Transactional",
  navigational: "Navigational",
};

const DIFFICULTY_COLORS: Record<string, string> = {
  low: "text-emerald-600",
  medium: "text-amber-600",
  high: "text-red-600",
};

function LogoIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <rect width="28" height="28" rx="6" fill="#c8372d" />
      <rect x="6" y="6" width="4" height="16" rx="1" fill="white" />
      <rect x="12" y="10" width="4" height="12" rx="1" fill="white" />
      <rect x="18" y="8" width="4" height="14" rx="1" fill="white" />
    </svg>
  );
}

function AuditContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const domainParam = searchParams.get("domain") ?? "";
  const competitorsParam = searchParams.get("competitors") ?? "";

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

  return (
    <div className="min-h-screen bg-[#f5ede3] text-gray-900" style={{ fontFamily: "var(--font-geist-sans, system-ui, sans-serif)" }}>
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-[#e8e0d4]">
        <a href="/" className="flex items-center gap-2">
          <LogoIcon />
          <span className="text-lg font-bold tracking-tight">App<span className="text-[#c8372d]">Name</span></span>
        </a>
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-[#d8cfc5] rounded-lg px-3 py-2 shadow-sm">
            <svg className="w-3.5 h-3.5 text-[#bbb]" fill="none" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5v3l1.5 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={inputDomain}
              onChange={(e) => setInputDomain(e.target.value)}
              placeholder="anothersite.com"
              className="text-sm text-gray-900 bg-transparent outline-none w-48 placeholder-[#bbb]"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !inputDomain.trim()}
            className="bg-[#c8372d] hover:bg-[#b02f26] disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            {loading ? "Scanning…" : "Analyze"}
          </button>
        </form>
      </nav>

      <main className="max-w-6xl mx-auto px-8 py-14 pb-32">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 gap-5">
            <div className="w-8 h-8 border-2 border-[#c8372d] border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Crawling your site…</p>
              <p className="text-xs text-gray-400 mt-1">This takes about 20 seconds</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="max-w-lg mx-auto mt-16 bg-red-50 border border-red-100 rounded-xl px-5 py-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && !result && (
          <div className="text-center py-32">
            <p className="text-gray-400 text-sm">Enter a domain above to run a free audit.</p>
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div>
            {/* Header */}
            <div className="mb-12">
              <p className="text-sm text-gray-400 mb-3 flex items-center gap-2">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M2 8a6 6 0 1012 0A6 6 0 002 8z" stroke="currentColor" strokeWidth="1.5" /><path d="M8 5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                {result.pageCount} pages scanned
              </p>
              <h1 className="text-5xl font-black tracking-tight leading-tight mb-4 text-gray-900" style={{ letterSpacing: "-0.02em" }}>
                Here&apos;s what we found<br />
                on <span className="text-[#c8372d]">{domain.replace(/^https?:\/\//, "")}</span>
              </h1>
              <p className="text-gray-600 max-w-lg">
                Brand snapshot, keyword opportunities, and a draft article outline — ready to turn into published content.
              </p>
            </div>

            {/* 01 + 02 side by side */}
            <div className="grid grid-cols-2 gap-6 mb-6 items-start">
              {/* 01 Brand snapshot */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 border border-[#d8cfc5] rounded-lg flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" /><path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">01</span>
                  <span className="text-sm font-semibold text-gray-900">Brand snapshot</span>
                </div>
                <div className="bg-white border border-[#e0d8cf] rounded-2xl p-7">
                  <div className="flex items-center gap-3 mb-6">
                    <h2 className="text-3xl font-black text-gray-900 tracking-tight">{result.brand.name}</h2>
                    <span className="text-xs border border-[#d8cfc5] text-gray-400 px-2.5 py-1 rounded uppercase tracking-widest font-medium">
                      {result.brand.adjective}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" /></svg>
                    <span className="text-gray-400 uppercase tracking-wide text-xs font-medium">Niche:</span>
                    <span className="font-medium text-gray-700">{result.brand.niche}</span>
                  </div>
                  <p className="text-sm text-gray-500 leading-relaxed mb-6 border-b border-[#f0ece8] pb-6">
                    {result.brand.description}
                  </p>
                  <div className="mb-5">
                    <div className="flex items-center gap-1.5 mb-3">
                      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 12 12"><circle cx="4" cy="4" r="2" stroke="currentColor" strokeWidth="1" /><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1" /></svg>
                      <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Target Audience</span>
                    </div>
                    <div className="space-y-1.5">
                      {result.brand.targetAudience.map((a) => (
                        <div key={a} className="flex items-center gap-2 text-sm text-[#444]">
                          <span className="text-[#bbb]">—</span>
                          {a}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 12 12"><path d="M2 6h8M6 2v8" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                      <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">Competitors</span>
                    </div>
                    <p className="text-sm text-gray-500">{result.brand.competitors.join(", ")}</p>
                  </div>
                </div>
              </div>

              {/* 02 Keywords */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 border border-[#d8cfc5] rounded-lg flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 16 16"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" /><path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                  </div>
                  <span className="text-xs text-gray-400 font-mono">02</span>
                  <span className="text-sm font-semibold text-gray-900">Keyword opportunities</span>
                </div>
                <div className="space-y-2">
                  {result.keywords.map((kw, i) => (
                    <div key={i} className="bg-white border border-[#e0d8cf] rounded-xl px-5 py-4 hover:border-[#c8c0b8] transition-colors">
                      <div className="flex items-start justify-between gap-3 mb-1.5">
                        <p className="text-sm font-semibold text-gray-900">{kw.keyword}</p>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium flex items-center gap-1">
                            {kw.intent === "informational" && (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1" /><path d="M6 5.5v3M6 4v.5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                            )}
                            {kw.intent === "commercial" && (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12"><path d="M1 6h10M6 1v10" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                            )}
                            {kw.intent === "transactional" && (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 12 12"><rect x="1.5" y="3" width="9" height="7" rx="1" stroke="currentColor" strokeWidth="1" /></svg>
                            )}
                            {INTENT_LABELS[kw.intent]}
                          </span>
                          <span className="text-[#d8cfc5]">·</span>
                          <span className={`text-[10px] uppercase tracking-widest font-medium ${DIFFICULTY_COLORS[kw.difficulty]}`}>
                            {kw.difficulty} difficulty
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{kw.rationale}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 03 Article */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 border border-[#d8cfc5] rounded-lg flex items-center justify-center">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 16 16"><rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" /><path d="M6 6h4M6 9h4M6 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                </div>
                <span className="text-xs text-gray-400 font-mono">03</span>
                <span className="text-sm font-semibold text-gray-900">Article we&apos;d write for you</span>
              </div>

              <div className="bg-white border border-[#e0d8cf] rounded-2xl p-8">
                <div className="flex items-center gap-2 mb-5">
                  <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" /></svg>
                  <span className="text-[10px] uppercase tracking-widest text-gray-400 font-medium">
                    Targeting: {result.article.targetKeyword}
                  </span>
                </div>

                <h3 className="text-2xl font-black text-gray-900 tracking-tight mb-5">{result.article.title}</h3>

                {result.article.intro && (
                  <blockquote className="italic text-gray-600 text-sm leading-relaxed border-l-0 mb-7 max-w-3xl">
                    {result.article.intro}
                  </blockquote>
                )}

                <div className="grid grid-cols-3 gap-3 mb-7">
                  {result.article.sections.map((s, i) => (
                    <div key={i} className="bg-orange-50 border border-orange-100 rounded-xl px-4 py-3 flex items-center gap-3">
                      <div className="w-6 h-6 bg-gray-900 text-white rounded flex items-center justify-center text-xs font-bold shrink-0">
                        {i + 1}
                      </div>
                      <span className="text-sm text-gray-700 font-medium leading-snug">{s}</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-5 pt-5 border-t border-[#f0ece8] text-gray-400">
                  <div className="flex items-center gap-1.5 text-xs">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span>~{result.article.wordCount.toLocaleString()} words</span>
                  </div>
                  {result.article.seoOptimized && (
                    <div className="flex items-center gap-1.5 text-xs">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5" /><path d="M5.5 8l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>SEO optimized</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Pricing section */}
        {showPricing && result && (
          <div ref={pricingRef} className="mt-20 pt-16 border-t border-stone-200">
            <div className="mb-10">
              <h2 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Simple pricing. Every plan.</h2>
              <p className="text-gray-500 text-sm">
                Your site has <span className="font-semibold text-gray-900">{result.keywords.length} keyword opportunities</span>. Every paid plan ships measurement, research, generation, and publishing.
              </p>
            </div>

            {/* Billing toggle */}
            <div className="flex items-center gap-3 mb-10">
              <button
                onClick={() => setBilling("monthly")}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${billing === "monthly" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("annual")}
                className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${billing === "annual" ? "bg-gray-900 text-white" : "text-gray-500 hover:text-gray-900"}`}
              >
                Annual
                <span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-semibold">−17%</span>
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4 items-start">
              {/* Free */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6">
                <p className="text-sm font-semibold text-gray-900 mb-1">Free</p>
                <p className="text-gray-400 text-xs mb-5">Get started, no card needed.</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-black text-gray-900">$0</span>
                  <span className="text-gray-400 text-sm mb-1">/ month</span>
                </div>
                <button
                  onClick={() => {
                    const params = new URLSearchParams({ domain });
                    if (competitorsParam) params.set("competitors", competitorsParam);
                    router.push(`/setup?${params}`);
                  }}
                  className="w-full border border-gray-200 hover:border-gray-400 text-gray-900 text-sm font-medium py-2.5 rounded-lg transition-colors mb-6"
                >
                  Start free →
                </button>
                {result && (
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
                    className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
                  >
                    Preview the article →
                  </button>
                )}
                <ul className="space-y-2 text-xs text-gray-500">
                  {["1 website", "10 tracked prompts", "3 AI engines", "Manual refresh", "Basic visibility score"].map(f => (
                    <li key={f} className="flex items-center gap-2"><span className="text-gray-300">—</span>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Pro */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6">
                <p className="text-sm font-semibold text-gray-900 mb-1">Pro</p>
                <p className="text-gray-400 text-xs mb-5">For solopreneurs & small sites.</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-black text-gray-900">${billing === "annual" ? "74" : "89"}</span>
                  <span className="text-gray-400 text-sm mb-1">/ month</span>
                </div>
                <button
                  onClick={() => startCheckout("starter")}
                  className="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium py-2.5 rounded-lg transition-colors mb-6"
                >
                  Get started →
                </button>
                <ul className="space-y-2 text-xs text-gray-500">
                  {["1 website", "50 tracked prompts", "4,000 AI responses / mo", "3 AI engines", "Weekly full refresh", "CMS publishing", "Email support"].map(f => (
                    <li key={f} className="flex items-center gap-2"><span className="text-gray-300">—</span>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Business */}
              <div className="bg-gray-900 border border-gray-900 rounded-2xl p-6 relative">
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-red-600 text-white text-xs font-semibold px-3 py-1 rounded-full">Most picked</span>
                <p className="text-sm font-semibold text-white mb-1">Business</p>
                <p className="text-gray-400 text-xs mb-5">For growing brands.</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-black text-white">${billing === "annual" ? "198" : "239"}</span>
                  <span className="text-gray-400 text-sm mb-1">/ month</span>
                </div>
                <button
                  onClick={() => startCheckout("growth")}
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 rounded-lg transition-colors mb-6"
                >
                  Get started →
                </button>
                <ul className="space-y-2 text-xs text-gray-300">
                  {["3 websites", "150 tracked prompts", "6,000 AI responses / mo", "6 AI engines", "Daily visibility updates", "Gap detection", "7 competitor brands", "Auto-publish"].map(f => (
                    <li key={f} className="flex items-center gap-2"><span className="text-gray-600">—</span>{f}</li>
                  ))}
                </ul>
              </div>

              {/* Scale */}
              <div className="bg-white border border-stone-200 rounded-2xl p-6">
                <p className="text-sm font-semibold text-gray-900 mb-1">Scale</p>
                <p className="text-gray-400 text-xs mb-5">For teams — full autopilot.</p>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-black text-gray-900">${billing === "annual" ? "614" : "739"}</span>
                  <span className="text-gray-400 text-sm mb-1">/ month</span>
                </div>
                <button
                  onClick={() => startCheckout("enterprise")}
                  className="w-full border border-gray-200 hover:border-gray-400 text-gray-900 text-sm font-medium py-2.5 rounded-lg transition-colors mb-6"
                >
                  Get started →
                </button>
                <ul className="space-y-2 text-xs text-gray-500">
                  {["10 websites", "400 tracked prompts", "15,000 AI responses / mo", "All 7 AI engines", "Unlimited team seats", "Full autopilot", "Priority support"].map(f => (
                    <li key={f} className="flex items-center gap-2"><span className="text-gray-300">—</span>{f}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-6 text-center">
              Cancel anytime. Your analyzed site data for <span className="font-medium">{domain.replace(/^https?:\/\//, "")}</span> transfers to your account automatically.
            </p>
          </div>
        )}
      </main>

      {/* Sticky footer bar */}
      {result && !loading && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-[#e0d8cf] px-8 py-3.5 flex items-center justify-between z-50" style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.06)" }}>
          <p className="text-sm text-gray-500">
            <span className="font-semibold text-gray-900">{domain.replace(/^https?:\/\//, "")}</span>
            {" "}—{" "}
            <span>{result.keywords.length} keyword opportunities found</span>
          </p>
          {showPricing ? (
            <button
              onClick={() => {
                setShowPricing(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
              ← Back to results
            </button>
          ) : (
            <button
              onClick={() => {
                setShowPricing(true);
                setTimeout(() => pricingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
              }}
              className="bg-[#c8372d] hover:bg-[#b02f26] text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors"
            >
              Generate first post →
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
