"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AIEngine, BrandData, GapItem, RedditThread, ScanResult, SocialKeyword, UserPlan, VisibilityScore } from "@/lib/types";
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

type Tab = "overview" | "results" | "competitors" | "gaps" | "history" | "social";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  history: "Engines",
  results: "Prompts",
  competitors: "Competitors",
  gaps: "Research",
  social: "Social",
};

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
  const width = 160;
  const height = 36;
  const points = scores
    .map((s, i) => {
      const x = (i / (scores.length - 1)) * width;
      const y = height - (s / max) * height;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="mt-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <polyline points={points} fill="none" stroke="#c8372d" strokeWidth="1.5" strokeLinejoin="round" strokeOpacity="0.4" />
        {scores.map((s, i) => (
          <circle
            key={i}
            cx={(i / (scores.length - 1)) * width}
            cy={height - (s / max) * height}
            r="2.5"
            fill="#c8372d"
            fillOpacity="0.5"
          />
        ))}
      </svg>
    </div>
  );
}

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="bg-white border border-dashed border-stone-200 rounded-xl p-12 text-center">
      <p className="text-sm font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}

function NavItem({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
        active ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-800 hover:bg-white/40"
      }`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${active ? "bg-red-500" : "bg-transparent"}`}
      />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
          {badge}
        </span>
      )}
    </button>
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
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanned, setScanned] = useState(false);
  const [selectedEngines, setSelectedEngines] = useState<AIEngine[]>(["chatgpt", "claude", "gemini", "perplexity", "grok", "google"]);
  const [error, setError] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanRun[]>([]);
  const [socialKeywords, setSocialKeywords] = useState<SocialKeyword[]>([]);
  const [redditThreads, setRedditThreads] = useState<RedditThread[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [activeThread, setActiveThread] = useState<RedditThread | null>(null);
  const [draftReply, setDraftReply] = useState("");
  const [draftingReply, setDraftingReply] = useState(false);
  const [userPlan, setUserPlan] = useState<UserPlan | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const savedTab = sessionStorage.getItem("dashTab");
    if (savedTab) setActiveTab(savedTab as Tab);

    createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUserEmail(user?.email ?? ""));

    const brandId = searchParams.get("brandId");
    if (!brandId) {
      router.push("/setup");
      return;
    }

    fetch(`/api/brand?id=${brandId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          router.push("/setup");
          return;
        }
        setBrand(data);
        fetch(`/api/history?brandId=${brandId}`)
          .then((r) => r.json())
          .then((d) => setScanHistory(d.runs ?? []));
        fetch(`/api/keywords?brandId=${brandId}`)
          .then((r) => r.json())
          .then((d) => setSocialKeywords(d.keywords ?? []));
        fetch(`/api/reddit/threads?brandId=${brandId}`)
          .then((r) => r.json())
          .then((d) => setRedditThreads(d.threads ?? []));
      })
      .finally(() => setLoadingBrand(false));

    fetch("/api/credits")
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setUserPlan(d);
      });
  }, []);

  useEffect(() => {
    if (!brand || results.length === 0) return;
    const activeEngines = [...new Set(results.map((r) => r.engine))] as AIEngine[];
    const sc = activeEngines.map((engine) => {
      const er = results.filter((r) => r.engine === engine);
      const mentions = er.filter((r) => r.brandMentioned);
      const ranked = mentions.filter((r) => r.brandRank !== null);
      const avgRank = ranked.length ? ranked.reduce((s, r) => s + (r.brandRank ?? 0), 0) / ranked.length : null;
      return {
        engine,
        score: er.length ? Math.round((mentions.length / er.length) * 100) : 0,
        mentionCount: mentions.length,
        totalPrompts: er.length,
        avgRank,
      };
    });
    setScores(sc);
    setOverallScore(Math.round(sc.reduce((s, x) => s + x.score, 0) / sc.length));
    setGaps(computeGaps(results, brand));
  }, [results, brand]);

  async function syncReddit() {
    if (!brand?.id) return;
    setSyncing(true);
    try {
      await fetch("/api/reddit/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id }),
      });
      const d = await fetch(`/api/reddit/threads?brandId=${brand.id}`).then((r) => r.json());
      setRedditThreads(d.threads ?? []);
    } finally {
      setSyncing(false);
    }
  }

  async function addKeyword() {
    if (!brand?.id || !newKeyword.trim()) return;
    const res = await fetch("/api/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, keyword: newKeyword.trim() }),
    });
    const d = await res.json();
    if (d.keyword) {
      setSocialKeywords((prev) => [
        ...prev,
        { id: d.keyword.id, keyword: d.keyword.keyword, createdAt: d.keyword.created_at },
      ]);
      setNewKeyword("");
    }
  }

  async function removeKeyword(id: string) {
    await fetch(`/api/keywords?id=${id}`, { method: "DELETE" });
    setSocialKeywords((prev) => prev.filter((k) => k.id !== id));
  }

  async function draftReplyForThread(thread: RedditThread) {
    if (!brand?.id) return;
    setActiveThread(thread);
    setDraftReply(thread.draftedReply ?? "");
    if (thread.draftedReply) return;
    setDraftingReply(true);
    try {
      const res = await fetch("/api/reddit/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: thread.id, brandId: brand.id }),
      });
      const d = await res.json();
      setDraftReply(d.reply ?? "");
      setRedditThreads((prev) =>
        prev.map((t) => (t.id === thread.id ? { ...t, draftedReply: d.reply, status: "read" } : t))
      );
    } finally {
      setDraftingReply(false);
    }
  }

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

  function navTo(tab: Tab) {
    setActiveTab(tab);
    sessionStorage.setItem("dashTab", tab);
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/auth");
  }

  if (loadingBrand) {
    return (
      <div className="min-h-screen bg-[#ede6dc] flex items-center justify-center">
        <span className="w-7 h-7 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!brand) return null;

  const newThreadCount = redditThreads.filter((t) => t.status === "new").length;
  const brandInitial = brand.name[0]?.toUpperCase() ?? "B";

  return (
    <div className="flex h-screen bg-[#ede6dc] overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-[272px] shrink-0 flex flex-col border-r border-stone-200/60">
        {/* Logo */}
        <div className="px-4 py-4 flex items-center gap-2 shrink-0">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#c8372d" />
            <rect x="6" y="6" width="4" height="16" rx="1" fill="white" />
            <rect x="12" y="10" width="4" height="12" rx="1" fill="white" />
            <rect x="18" y="8" width="4" height="14" rx="1" fill="white" />
          </svg>
          <span className="font-bold text-xl tracking-tight text-gray-900">
            SEO<span className="text-red-600">itis</span>
          </span>
          <span className="ml-auto text-[10px] font-semibold bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded">
            v2.0
          </span>
        </div>

        {/* Brand card */}
        <div className="mx-3 mb-5 shrink-0">
          <button
            onClick={() => router.push("/setup")}
            className="w-full bg-white rounded-xl px-3 py-3 flex items-center gap-3 hover:bg-white/90 transition-colors shadow-sm"
          >
            <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center text-sm font-bold shrink-0">
              {brandInitial}
            </div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{brand.name}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">{userPlan?.plan ?? "STARTER"}</p>
            </div>
            <svg className="ml-auto w-4 h-4 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 overflow-y-auto space-y-5">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2.5 mb-1.5">
              Measure
            </p>
            <div className="space-y-0.5">
              <NavItem label="Overview" active={activeTab === "overview"} onClick={() => navTo("overview")} />
              <NavItem label="Engines" active={activeTab === "history"} onClick={() => navTo("history")} />
              <NavItem label="Prompts" active={activeTab === "results"} onClick={() => navTo("results")} />
              <NavItem label="Competitors" active={activeTab === "competitors"} onClick={() => navTo("competitors")} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2.5 mb-1.5">
              Create
            </p>
            <div className="space-y-0.5">
              <NavItem
                label="Research"
                active={activeTab === "gaps"}
                onClick={() => navTo("gaps")}
                badge={gaps.length || undefined}
              />
              <NavItem
                label="Social"
                active={activeTab === "social"}
                onClick={() => navTo("social")}
                badge={newThreadCount || undefined}
              />
            </div>
          </div>
        </nav>

        {/* User info */}
        <div className="mx-3 mb-3 mt-3 shrink-0">
          <div className="bg-white/60 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {userEmail[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{userEmail || brand.domain}</p>
              <p className="text-[10px] text-gray-400">
                {userPlan ? `${userPlan.creditsBalance} credits` : "Workspace"}
              </p>
            </div>
            <button
              onClick={signOut}
              title="Sign out"
              className="text-gray-300 hover:text-gray-600 transition-colors shrink-0"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main content ── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white/70 backdrop-blur-sm border-b border-stone-200/70 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">
              {brandInitial}
            </div>
            <span className="font-medium text-gray-700">{brand.domain}</span>
            <span className="text-gray-300 mx-0.5">/</span>
            <span className="text-gray-500">{TAB_LABELS[activeTab]}</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              {AVAILABLE_ENGINES.map((engine) => (
                <button
                  key={engine}
                  onClick={() => toggleEngine(engine)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedEngines.includes(engine)
                      ? "border-red-300 bg-red-50 text-red-700"
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
              className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              {scanning && (
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              )}
              {scanning ? "Scanning…" : scanned ? "+ Re-scan" : "+ Run scan"}
            </button>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-600 mb-5">
              {error}
            </div>
          )}

          {scanning && (
            <div className="bg-white border border-stone-200 rounded-xl p-8 text-center mb-5">
              <div className="w-7 h-7 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">Submitting prompts to AI engines…</p>
              <p className="text-xs text-gray-400 mt-1">
                Running {brand.trackedPrompts.length} prompts × {selectedEngines.length} engines
              </p>
            </div>
          )}

          {/* ── OVERVIEW ── */}
          {activeTab === "overview" && (
            <>
              {!scanned && !scanning ? (
                <EmptyState
                  label="No scan data yet"
                  sub={`${brand.trackedPrompts.length} prompts ready — click "+ Run scan" to start`}
                />
              ) : scanned && (
                <>
                  <div className="mb-5">
                    <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
                    {overallScore !== null && (
                      <p className="text-sm text-gray-400 mt-0.5">
                        Visibility up to {overallScore}% composite
                      </p>
                    )}
                  </div>

                  {/* Score cards */}
                  <div className="grid grid-cols-4 gap-3 mb-5">
                    <div className="col-span-1 bg-white border border-stone-200 rounded-xl p-5 flex flex-col items-center justify-center">
                      <div className="text-4xl font-bold text-gray-900 mb-1">{overallScore}%</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider text-center">
                        Composite visibility
                      </div>
                      <MiniTrendChart runs={scanHistory} />
                    </div>
                    {scores.map((s) => (
                      <div key={s.engine} className="bg-white border border-stone-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-2 h-2 rounded-full ${ENGINE_COLORS[s.engine]}`} />
                          <span className="text-xs font-medium text-gray-700">{ENGINE_LABELS[s.engine]}</span>
                        </div>
                        <div className={`text-3xl font-bold mb-1 ${ENGINE_TEXT_COLORS[s.engine]}`}>{s.score}%</div>
                        <div className="text-xs text-gray-400">
                          {s.mentionCount}/{s.totalPrompts} prompts
                          {s.avgRank && ` · avg #${s.avgRank.toFixed(1)}`}
                        </div>
                        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${ENGINE_COLORS[s.engine]}`}
                            style={{ width: `${s.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Prompt overview list */}
                  <div className="space-y-2">
                    {(() => {
                      const scannedIds = new Set(results.map((r) => r.promptId));
                      return brand.trackedPrompts
                        .filter((p) => scannedIds.has(p.id))
                        .map((p) => {
                          const promptResults = results.filter((r) => r.promptId === p.id);
                          return (
                            <div key={p.id} className="bg-white border border-stone-200 rounded-xl p-4">
                              <p className="text-sm font-medium text-gray-800 mb-3">{p.text}</p>
                              <div className="flex items-center gap-4 flex-wrap">
                                {promptResults.map((r) => (
                                  <div key={r.engine} className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${ENGINE_COLORS[r.engine]}`} />
                                    <span className="text-xs text-gray-500">{ENGINE_LABELS[r.engine]}</span>
                                    {r.brandMentioned ? (
                                      <span className="text-xs font-medium text-red-600">
                                        #{r.brandRank ?? "✓"}
                                      </span>
                                    ) : (
                                      <span className="text-xs text-gray-400">absent</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        });
                    })()}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── ENGINES (history) ── */}
          {activeTab === "history" && (
            <>
              {scanHistory.length === 0 ? (
                <EmptyState
                  label="No engine history yet"
                  sub="Run a scan to see per-engine visibility trends over time"
                />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-5">Engines</h2>
                  <div className="space-y-3">
                    {scanHistory.map((run) => (
                      <div key={run.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4">
                        <div className="text-2xl font-bold text-gray-900 w-16">{run.overall_score}%</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            {run.visibility_scores?.map((s) => (
                              <span key={s.engine} className="text-xs text-gray-500">
                                {ENGINE_LABELS[s.engine as AIEngine]}:{" "}
                                <span className="font-medium text-gray-700">{s.score}%</span>
                              </span>
                            ))}
                          </div>
                          <p className="text-xs text-gray-400">
                            {new Date(run.created_at).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {run.engines.map((e) => (
                            <div
                              key={e}
                              className={`w-2 h-2 rounded-full ${ENGINE_COLORS[e as AIEngine] ?? "bg-gray-300"}`}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── PROMPTS (results) ── */}
          {activeTab === "results" && (
            <>
              {!scanned ? (
                <EmptyState label="No prompt data" sub="Run a scan to see AI responses per prompt" />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-5">Prompts</h2>
                  <div className="space-y-3">
                    {results.map((r, i) => (
                      <div key={i} className="bg-white border border-stone-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${ENGINE_COLORS[r.engine]}`} />
                          <span className="text-xs font-medium text-gray-600">{ENGINE_LABELS[r.engine]}</span>
                          <span className="text-gray-200">·</span>
                          <span className="text-xs text-gray-500 truncate max-w-xs">{r.promptText}</span>
                          {r.brandMentioned ? (
                            <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                              Mentioned{r.brandRank ? ` #${r.brandRank}` : ""}
                            </span>
                          ) : (
                            <span className="ml-auto text-xs font-medium text-red-500 bg-red-50 px-2 py-0.5 rounded-full shrink-0">
                              Absent
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 leading-relaxed line-clamp-3">{r.response}</p>
                        {r.citations.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {r.citations.slice(0, 3).map((c, j) => (
                              <span
                                key={j}
                                className="text-xs bg-gray-50 text-gray-500 px-2 py-0.5 rounded border border-gray-100 truncate max-w-[200px]"
                              >
                                {c}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* ── COMPETITORS ── */}
          {activeTab === "competitors" && (
            <>
              {!scanned ? (
                <EmptyState label="No competitor data" sub="Run a scan to see share of voice vs competitors" />
              ) : (
                <div className="bg-white border border-stone-200 rounded-xl p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Competitors</h2>
                  <p className="text-sm text-gray-400 mb-5">Share of voice across AI engines</p>
                  {[...brand.competitors, brand.name].map((name) => {
                    const isBrand = name === brand.name;
                    const mentions = isBrand
                      ? results.filter((r) => r.brandMentioned).length
                      : results.filter((r) => r.competitorMentions.some((c) => c.name === name)).length;
                    const pct = results.length ? Math.round((mentions / results.length) * 100) : 0;
                    return (
                      <div
                        key={name}
                        className={`flex items-center gap-3 mb-3 ${isBrand ? "pt-3 border-t border-gray-100 mt-1" : ""}`}
                      >
                        <span
                          className={`text-sm w-40 truncate ${isBrand ? "font-semibold text-gray-900" : "text-gray-600"}`}
                        >
                          {name}
                        </span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isBrand ? "bg-red-500" : "bg-gray-300"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span
                          className={`text-sm font-medium w-10 text-right ${isBrand ? "text-red-600" : "text-gray-500"}`}
                        >
                          {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* ── RESEARCH (gaps) ── */}
          {activeTab === "gaps" && (
            <>
              {!scanned ? (
                <EmptyState
                  label="No research data"
                  sub="Run a scan to discover gaps where competitors appear but you don't"
                />
              ) : gaps.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
                  <p className="text-sm text-gray-500">
                    No gaps — your brand appeared in all scanned prompts.
                  </p>
                </div>
              ) : (
                <>
                  <div className="mb-5">
                    <h2 className="text-xl font-bold text-gray-900">Research</h2>
                    <p className="text-sm text-gray-400 mt-0.5">
                      {gaps.length} queries where {brand.name} isn&apos;t mentioned
                    </p>
                  </div>
                  <div className="space-y-3">
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
                              ·{" "}
                              <span className="font-medium text-gray-600">{gap.topCompetitor}</span>{" "}
                              appears instead
                            </span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-gray-400 flex-1">
                            Publishing an article that answers this query will teach AI engines to recommend{" "}
                            {brand.name} for it.
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
                  </div>
                </>
              )}
            </>
          )}

          {/* ── SOCIAL ── */}
          {activeTab === "social" && (
            <div>
              <div className="mb-5">
                <h2 className="text-xl font-bold text-gray-900">Social</h2>
                <p className="text-sm text-gray-400 mt-0.5">Monitor Reddit for keyword-relevant conversations</p>
              </div>

              {/* Keywords card */}
              <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Reddit keywords</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Keywords we watch for relevant conversations</p>
                  </div>
                  <button
                    onClick={syncReddit}
                    disabled={syncing || socialKeywords.length === 0}
                    className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {syncing && (
                      <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    )}
                    {syncing ? "Syncing…" : "Sync Reddit"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {socialKeywords.map((k) => (
                    <span
                      key={k.id}
                      className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full"
                    >
                      {k.keyword}
                      <button
                        onClick={() => removeKeyword(k.id)}
                        className="text-blue-400 hover:text-blue-700 ml-0.5"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {socialKeywords.length === 0 && (
                    <span className="text-xs text-gray-400">No keywords yet — add one below</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKeyword();
                      }
                    }}
                    placeholder="Add keyword (e.g. AI visibility tool)"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
                  />
                  <button
                    onClick={addKeyword}
                    className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Thread feed */}
              {redditThreads.length === 0 ? (
                <div className="bg-white border border-dashed border-stone-200 rounded-xl p-10 text-center">
                  <p className="text-sm text-gray-500 mb-1">No threads found yet</p>
                  <p className="text-xs text-gray-400">
                    Add keywords above and click &quot;Sync Reddit&quot; to find relevant conversations
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 mb-2">
                    {redditThreads.length} threads · {newThreadCount} new
                  </p>
                  {redditThreads.map((thread) => (
                    <div
                      key={thread.id}
                      className="bg-white border border-stone-200 rounded-xl p-4 hover:border-blue-200 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-600">r/{thread.subreddit}</span>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">
                              {thread.keyword}
                            </span>
                            {thread.status === "new" && (
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            )}
                          </div>
                          <p className="text-sm font-medium text-gray-800 truncate mb-1">{thread.title}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span>↑ {thread.score}</span>
                            <span>{thread.numComments} comments</span>
                            {thread.redditCreatedAt && (
                              <span>
                                {new Date(thread.redditCreatedAt).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a
                            href={thread.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            View ↗
                          </a>
                          <button
                            onClick={() => draftReplyForThread(thread)}
                            className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            {thread.draftedReply ? "View reply" : "Draft reply"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Thread reply modal */}
      {activeThread && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setActiveThread(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-blue-600">r/{activeThread.subreddit}</span>
                    <span className="text-xs text-gray-400">
                      ↑ {activeThread.score} · {activeThread.numComments} comments
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{activeThread.title}</h3>
                </div>
                <button
                  onClick={() => setActiveThread(null)}
                  className="text-gray-400 hover:text-gray-600 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              {activeThread.body && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4">
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{activeThread.body}</p>
                </div>
              )}

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">AI draft reply</p>
                  <button
                    onClick={async () => {
                      setDraftingReply(true);
                      setDraftReply("");
                      const res = await fetch("/api/reddit/draft", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ threadId: activeThread.id, brandId: brand?.id }),
                      });
                      const d = await res.json();
                      setDraftReply(d.reply ?? "");
                      setDraftingReply(false);
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Regenerate
                  </button>
                </div>

                {draftingReply ? (
                  <div className="flex items-center gap-2 py-6 justify-center">
                    <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Drafting reply…</span>
                  </div>
                ) : draftReply ? (
                  <div>
                    <textarea
                      value={draftReply}
                      onChange={(e) => setDraftReply(e.target.value)}
                      rows={5}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-400 resize-none"
                    />
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => navigator.clipboard.writeText(draftReply)}
                        className="flex-1 text-sm font-medium border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors"
                      >
                        Copy reply
                      </button>
                      <a
                        href={activeThread.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-sm font-medium bg-blue-600 text-white text-center rounded-lg py-2 hover:bg-blue-700 transition-colors"
                      >
                        Post on Reddit ↗
                      </a>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => draftReplyForThread(activeThread)}
                    className="w-full text-sm font-medium bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Generate draft
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DashboardPageWrapper() {
  return (
    <Suspense>
      <DashboardPage />
    </Suspense>
  );
}
