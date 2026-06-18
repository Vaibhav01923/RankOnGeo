"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AIEngine, BrandData, GapItem, ScanResult, VisibilityScore } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase";

const ENGINE_LABELS: Record<AIEngine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google: "Google AI",
  grok: "Grok",
};

const ENGINE_COLORS: Record<AIEngine, string> = {
  chatgpt: "bg-green-500",
  claude: "bg-orange-500",
  gemini: "bg-blue-500",
  perplexity: "bg-purple-500",
  google: "bg-red-500",
  grok: "bg-gray-800",
};

const ENGINE_TEXT_COLORS: Record<AIEngine, string> = {
  chatgpt: "text-green-600",
  claude: "text-orange-500",
  gemini: "text-blue-500",
  perplexity: "text-purple-500",
  google: "text-red-600",
  grok: "text-gray-800",
};

const AVAILABLE_ENGINES: AIEngine[] = ["chatgpt", "claude", "gemini", "perplexity", "grok", "google"];

type ScanRun = {
  id: string;
  engines: string[];
  overall_score: number;
  created_at: string;
  visibility_scores: { engine: string; score: number }[];
};

function computeGaps(results: ScanResult[], brand: BrandData): GapItem[] {
  const promptIds = [...new Set(results.map((r) => r.promptId))];
  const gaps: GapItem[] = [];

  for (const promptId of promptIds) {
    const promptResults = results.filter((r) => r.promptId === promptId);
    const promptText = promptResults[0]?.promptText ?? "";
    const missingEngines = promptResults.filter((r) => !r.brandMentioned).map((r) => r.engine);
    if (missingEngines.length === 0) continue;

    const competitorCounts: Record<string, number> = {};
    for (const r of promptResults) {
      for (const c of r.competitorMentions) {
        competitorCounts[c.name] = (competitorCounts[c.name] ?? 0) + 1;
      }
    }
    const topCompetitor = Object.entries(competitorCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    gaps.push({
      promptText,
      engines: missingEngines,
      topCompetitor,
      recommendation: `Create content targeting "${promptText}" to increase AI visibility`,
    });
  }

  return gaps.sort((a, b) => b.engines.length - a.engines.length);
}

function MiniTrendChart({ runs }: { runs: ScanRun[] }) {
  if (runs.length < 2) return null;
  const ordered = [...runs].reverse();
  const scores = ordered.map((r) => r.overall_score ?? 0);
  const max = Math.max(...scores, 1);
  const width = 200;
  const height = 48;
  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = height - (s / max) * height;
    return `${x},${y}`;
  }).join(" ");

  return (
    <div className="mt-1">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <polyline points={points} fill="none" stroke="#10b981" strokeWidth="2" strokeLinejoin="round" />
        {scores.map((s, i) => (
          <circle
            key={i}
            cx={(i / (scores.length - 1)) * width}
            cy={height - (s / max) * height}
            r="3"
            fill="#10b981"
          />
        ))}
      </svg>
      <p className="text-xs text-gray-400 mt-1">{runs.length} scans · trend over time</p>
    </div>
  );
}

function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [loadingBrand, setLoadingBrand] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scores, setScores] = useState<VisibilityScore[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "results" | "competitors" | "gaps" | "history">("overview");
  const [scanned, setScanned] = useState(false);
  const [selectedEngines, setSelectedEngines] = useState<AIEngine[]>(["chatgpt", "claude", "gemini", "perplexity", "grok", "google"]);
  const [error, setError] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanRun[]>([]);

  useEffect(() => {
    const savedTab = sessionStorage.getItem("dashTab");
    if (savedTab) setActiveTab(savedTab as "overview" | "results" | "competitors" | "gaps" | "history");

    const brandId = searchParams.get("brandId");
    if (!brandId) { router.push("/setup"); return; }

    fetch(`/api/brand?id=${brandId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { router.push("/setup"); return; }
        setBrand(data);
        fetch(`/api/history?brandId=${brandId}`)
          .then((r) => r.json())
          .then((d) => setScanHistory(d.runs ?? []));
      })
      .finally(() => setLoadingBrand(false));
  }, []);

  // Recompute scores/gaps when results change
  useEffect(() => {
    if (!brand || results.length === 0) return;
    const activeEngines = [...new Set(results.map((r) => r.engine))] as AIEngine[];
    const sc = activeEngines.map((engine) => {
      const er = results.filter((r) => r.engine === engine);
      const mentions = er.filter((r) => r.brandMentioned);
      const ranked = mentions.filter((r) => r.brandRank !== null);
      const avgRank = ranked.length
        ? ranked.reduce((s, r) => s + (r.brandRank ?? 0), 0) / ranked.length
        : null;
      return { engine, score: er.length ? Math.round((mentions.length / er.length) * 100) : 0, mentionCount: mentions.length, totalPrompts: er.length, avgRank };
    });
    setScores(sc);
    setOverallScore(Math.round(sc.reduce((s, x) => s + x.score, 0) / sc.length));
    setGaps(computeGaps(results, brand));
  }, [results, brand]);

  async function runScan() {
    if (!brand) return;
    setScanning(true);
    setError("");
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, engines: selectedEngines }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");

      const newResults: ScanResult[] = data.results;
      setResults(newResults);

      if (data.scores) setScores(data.scores);
      if (data.overallScore !== undefined) setOverallScore(data.overallScore);
      setGaps(computeGaps(newResults, brand));
      setScanned(true);

      // Refresh history
      if (brand.id) {
        fetch(`/api/history?brandId=${brand.id}`)
          .then((r) => r.json())
          .then((d) => setScanHistory(d.runs ?? []));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  function toggleEngine(engine: AIEngine) {
    setSelectedEngines((prev) =>
      prev.includes(engine) ? prev.filter((e) => e !== engine) : [...prev, engine]
    );
  }

  if (loadingBrand) return (
    <div className="min-h-screen bg-[#f5ede3] flex items-center justify-center">
      <span className="w-7 h-7 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );
  if (!brand) return null;

  return (
    <div className="min-h-screen bg-[#f5ede3]">
      <header className="bg-white border-b border-stone-200 px-6 py-4 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#c8372d" />
            <rect x="6" y="6" width="4" height="16" rx="1" fill="white" />
            <rect x="12" y="10" width="4" height="12" rx="1" fill="white" />
            <rect x="18" y="8" width="4" height="14" rx="1" fill="white" />
          </svg>
          <span className="font-bold text-xl tracking-tight text-gray-900">SEO<span className="text-red-600">itis</span></span>
        </a>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{brand.domain}</span>
          <button
            onClick={() => router.push("/setup")}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Switch brand
          </button>
          <button
            onClick={async () => {
              const supabase = createSupabaseBrowserClient();
              await supabase.auth.signOut();
              router.push("/auth");
            }}
            className="text-sm text-gray-400 hover:text-red-500 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Brand bar */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{brand.name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{brand.niche}</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {AVAILABLE_ENGINES.map((engine) => (
                <button
                  key={engine}
                  onClick={() => toggleEngine(engine)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    selectedEngines.includes(engine)
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-gray-200 text-gray-400 hover:border-gray-300"
                  }`}
                >
                  {ENGINE_LABELS[engine]}
                </button>
              ))}
            </div>
            <button
              onClick={runScan}
              disabled={scanning || selectedEngines.length === 0}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              {scanning && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {scanning ? "Scanning..." : scanned ? "Re-scan" : "Run scan"}
            </button>
          </div>
        </div>

        {error && <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-600 mb-6">{error}</div>}

        {scanning && (
          <div className="bg-white border border-stone-200 rounded-xl p-8 text-center mb-6">
            <div className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm font-medium text-gray-700">Submitting prompts to AI engines...</p>
            <p className="text-xs text-gray-400 mt-1">Running {brand.trackedPrompts.length} prompts × {selectedEngines.length} engines</p>
          </div>
        )}

        {!scanned && !scanning && (
          <div className="bg-white border border-dashed border-gray-200 rounded-xl p-12 text-center">
            <p className="text-gray-500 text-sm mb-2">No scan data yet</p>
            <p className="text-xs text-gray-400 mb-6">Select AI engines above and click &quot;Run scan&quot; to measure your brand&apos;s visibility</p>
            <div className="text-xs text-gray-300">{brand.trackedPrompts.length} tracked prompts ready</div>
          </div>
        )}

        {scanned && !scanning && (
          <>
            {/* Score cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="col-span-1 bg-white border border-stone-200 rounded-xl p-5 flex flex-col items-center justify-center">
                <div className="text-4xl font-bold text-gray-900 mb-1">{overallScore}%</div>
                <div className="text-xs text-gray-400 uppercase tracking-wide text-center">Overall visibility</div>
                <MiniTrendChart runs={scanHistory} />
              </div>
              {scores.map((s) => (
                <div key={s.engine} className="bg-white border border-stone-200 rounded-xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className={`w-2 h-2 rounded-full ${ENGINE_COLORS[s.engine]}`} />
                    <span className="text-sm font-medium text-gray-700">{ENGINE_LABELS[s.engine]}</span>
                  </div>
                  <div className={`text-3xl font-bold mb-1 ${ENGINE_TEXT_COLORS[s.engine]}`}>{s.score}%</div>
                  <div className="text-xs text-gray-400">
                    {s.mentionCount}/{s.totalPrompts} prompts
                    {s.avgRank && ` · avg rank #${s.avgRank.toFixed(1)}`}
                  </div>
                  <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${ENGINE_COLORS[s.engine]}`} style={{ width: `${s.score}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-stone-100 rounded-lg p-1 w-fit">
              {(["overview", "results", "competitors", "gaps", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => { setActiveTab(tab); sessionStorage.setItem("dashTab", tab); }}
                  className={`px-4 py-1.5 rounded-md text-sm font-medium capitalize transition-colors ${
                    activeTab === tab ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {tab}
                  {tab === "gaps" && gaps.length > 0 && (
                    <span className="ml-1.5 bg-red-100 text-red-600 text-xs px-1.5 py-0.5 rounded-full">{gaps.length}</span>
                  )}
                  {tab === "history" && scanHistory.length > 0 && (
                    <span className="ml-1.5 bg-gray-200 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">{scanHistory.length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Overview */}
            {activeTab === "overview" && (
              <div className="space-y-3">
                {(() => {
                  const scannedPromptIds = new Set(results.map((r) => r.promptId));
                  const unscanned = brand.trackedPrompts.filter((p) => !scannedPromptIds.has(p.id));
                  return (
                    <>
                      {brand.trackedPrompts.filter((p) => scannedPromptIds.has(p.id)).map((p) => {
                        const promptResults = results.filter((r) => r.promptId === p.id);
                        return (
                          <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-4">
                            <p className="text-sm font-medium text-gray-800 mb-3">{p.text}</p>
                            <div className="flex items-center gap-4">
                              {promptResults.map((r) => (
                                <div key={r.engine} className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${ENGINE_COLORS[r.engine]}`} />
                                  <span className="text-xs text-gray-500">{ENGINE_LABELS[r.engine]}</span>
                                  {r.brandMentioned ? (
                                    <span className="text-xs font-medium text-red-600">#{r.brandRank ?? "✓"}</span>
                                  ) : (
                                    <span className="text-xs text-gray-400">absent</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {unscanned.length > 0 && (
                        <div className="bg-white border border-dashed border-stone-200 rounded-xl p-4">
                          <p className="text-xs text-gray-400 mb-2">{unscanned.length} prompts not yet scanned</p>
                          <div className="space-y-1">
                            {unscanned.map((p) => (
                              <p key={p.id} className="text-xs text-gray-500 truncate">— {p.text}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            )}

            {/* Results */}
            {activeTab === "results" && (
              <div className="space-y-3">
                {results.map((r, i) => (
                  <div key={i} className="bg-white border border-stone-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-2 h-2 rounded-full ${ENGINE_COLORS[r.engine]}`} />
                      <span className="text-xs font-medium text-gray-600">{ENGINE_LABELS[r.engine]}</span>
                      <span className="text-gray-200">·</span>
                      <span className="text-xs text-gray-500 truncate max-w-xs">{r.promptText}</span>
                      {r.brandMentioned ? (
                        <span className="ml-auto text-xs font-medium text-red-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                          Mentioned{r.brandRank ? ` #${r.brandRank}` : ""}
                        </span>
                      ) : (
                        <span className="ml-auto text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">Absent</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{r.response}</p>
                    {r.citations.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {r.citations.slice(0, 3).map((c, j) => (
                          <span key={j} className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-100 truncate max-w-[200px]">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Competitors */}
            {activeTab === "competitors" && (
              <div className="bg-white border border-stone-200 rounded-xl p-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-5">Share of voice vs competitors</h3>
                {[...brand.competitors, brand.name].map((name) => {
                  const isBrand = name === brand.name;
                  const mentions = isBrand
                    ? results.filter((r) => r.brandMentioned).length
                    : results.filter((r) => r.competitorMentions.some((c) => c.name === name)).length;
                  const pct = results.length ? Math.round((mentions / results.length) * 100) : 0;
                  return (
                    <div key={name} className={`flex items-center gap-3 mb-3 ${isBrand ? "pt-3 border-t border-gray-50 mt-1" : ""}`}>
                      <span className={`text-sm w-40 truncate ${isBrand ? "font-semibold text-gray-900" : "text-gray-600"}`}>{name}</span>
                      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isBrand ? "bg-red-500" : "bg-gray-300"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className={`text-sm font-medium w-10 text-right ${isBrand ? "text-red-600" : "text-gray-500"}`}>{pct}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Gaps */}
            {activeTab === "gaps" && (
              <div className="space-y-3">
                {gaps.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
                    <p className="text-sm text-gray-500">No gaps — your brand appeared in all scanned prompts.</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-gray-400 mb-2">
                      {gaps.length} queries where {brand.name} isn&apos;t mentioned. Fix each one by writing a targeted article.
                    </p>
                    {gaps.map((gap, i) => (
                      <div key={i} className="bg-white border border-stone-200 rounded-xl p-4">
                        <p className="text-sm font-medium text-gray-800 mb-2">{gap.promptText}</p>
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {gap.engines.map((e) => (
                            <span key={e} className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">
                              Not in {ENGINE_LABELS[e as AIEngine]}
                            </span>
                          ))}
                          {gap.topCompetitor && (
                            <span className="text-xs text-gray-400">
                              · <span className="font-medium text-gray-600">{gap.topCompetitor}</span> appears instead
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-gray-400 flex-1">
                            Publishing an article that answers this query will teach AI engines to recommend {brand.name} for it.
                          </p>
                          <button
                            onClick={() => {
                              const params = new URLSearchParams({
                                gapPrompt: gap.promptText,
                                brand: brand.name,
                                niche: brand.niche,
                                engines: encodeURIComponent(JSON.stringify(gap.engines)),
                                ...(gap.topCompetitor ? { competitor: gap.topCompetitor } : {}),
                              });
                              window.open(`/article?${params}`, "_blank");
                            }}
                            className="shrink-0 text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                          >
                            Write article →
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {/* History */}
            {activeTab === "history" && (
              <div className="space-y-3">
                {scanHistory.length === 0 ? (
                  <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
                    <p className="text-sm text-gray-500">No history yet. Run more scans to see trends.</p>
                  </div>
                ) : (
                  scanHistory.map((run) => (
                    <div key={run.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4">
                      <div className="text-2xl font-bold text-gray-900 w-16">{run.overall_score}%</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {run.visibility_scores?.map((s) => (
                            <span key={s.engine} className="text-xs text-gray-500">
                              {ENGINE_LABELS[s.engine as AIEngine]}: <span className="font-medium text-gray-700">{s.score}%</span>
                            </span>
                          ))}
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {run.engines.map((e) => (
                          <div key={e} className={`w-2 h-2 rounded-full ${ENGINE_COLORS[e as AIEngine] ?? "bg-gray-300"}`} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function DashboardPageWrapper() {
  return <Suspense><DashboardPage /></Suspense>;
}
