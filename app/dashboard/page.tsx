"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AIEngine, BrandData, GapItem, RedditThread, ScanResult, SocialKeyword, VisibilityScore } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const ENGINE_ICONS: Record<AIEngine, string> = {
  chatgpt: "/engines/chatgpt.png",
  claude: "/engines/claude.png",
  gemini: "/engines/gemini.png",
  perplexity: "/engines/perplexity.svg",
  google: "/engines/google.png",
  grok: "/engines/grok.png",
};

function EngineIcon({ engine, size = 20 }: { engine: AIEngine; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ENGINE_ICONS[engine]}
      alt={ENGINE_LABELS[engine]}
      width={size}
      height={size}
      className="rounded-full object-contain bg-white border border-gray-100"
      style={{ width: size, height: size }}
    />
  );
}

const ENGINE_TEXT_COLORS: Record<AIEngine, string> = {
  chatgpt: "text-green-600",
  claude: "text-orange-500",
  gemini: "text-blue-500",
  perplexity: "text-purple-500",
  google: "text-red-600",
  grok: "text-gray-800",
};

const ENGINE_BADGE_COLORS: Record<string, string> = {
  chatgpt: "bg-green-50 text-green-700 border border-green-100",
  claude: "bg-orange-50 text-orange-700 border border-orange-100",
  gemini: "bg-blue-50 text-blue-700 border border-blue-100",
  perplexity: "bg-purple-50 text-purple-700 border border-purple-100",
  google: "bg-red-50 text-red-700 border border-red-100",
  grok: "bg-gray-100 text-gray-700 border border-gray-200",
};

const AVAILABLE_ENGINES: AIEngine[] = ["chatgpt", "claude", "gemini", "perplexity", "grok", "google"];

type Tab =
  | "overview" | "history" | "results" | "citations" | "competitors"
  | "gaps" | "keywords" | "articles" | "social"
  | "publishing" | "schedule"
  | "brands" | "alerts"
  | "agent";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  history: "Engines",
  results: "Prompts",
  citations: "Citations",
  competitors: "Competitors",
  gaps: "Research",
  keywords: "Keywords",
  articles: "Articles",
  social: "Social",
  publishing: "Publishing",
  schedule: "Schedule",
  brands: "Brands",
  alerts: "Alerts",
  agent: "Agent",
};

type ScanRun = {
  id: string;
  engines: string[];
  overall_score: number;
  created_at: string;
  visibility_scores: { engine: string; score: number }[];
};

type SavedArticle = {
  id: string;
  title: string;
  keyword: string;
  status: "draft" | "review" | "published" | "scheduled" | "writing";
  seoScore: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
  brandId: string;
  content?: string;
};

type AgentMessage = { role: "user" | "assistant"; content: string };

type PublishingChannel = {
  id: string;
  name: string;
  type: "wordpress" | "webflow" | "webhook" | "discord" | "framer";
  url: string;
  api_key?: string;
  status: "active" | "paused";
  last_published_at?: string;
  created_at: string;
};

type PublishingLogEntry = {
  id: string;
  channel_id?: string;
  brand_id: string;
  article_id?: string;
  article_title?: string;
  status: "published" | "failed" | "running";
  error_message?: string;
  created_at: string;
  publishing_channels?: { name: string; type: string } | null;
};

type AlertDestination = {
  id: string;
  name: string;
  kind: "slack" | "webhook" | "discord" | "email";
  url?: string;
  email?: string;
  status: "active" | "paused";
  events_count: number;
  created_at: string;
};

type AlertDelivery = {
  id: string;
  destination_id: string;
  event_type: string;
  status: "succeeded" | "failed";
  error_detail?: string;
  created_at: string;
  alert_destinations?: { name: string; kind: string } | null;
};

function getSourceType(domain: string): string {
  if (domain.includes("reddit.com")) return "Reddit";
  if (["youtube.com", "twitter.com", "x.com", "instagram.com", "linkedin.com", "tiktok.com"].some((d) => domain.includes(d))) return "Social";
  if (["wikipedia.org", "wikidata.org"].some((d) => domain.includes(d))) return "Wiki";
  if (["g2.com", "capterra.com", "trustpilot.com", "getapp.com", "producthunt.com", "softwareadvice.com"].some((d) => domain.includes(d))) return "Review";
  if (["nytimes.com", "techcrunch.com", "theverge.com", "wired.com", "forbes.com", "businessinsider.com", "washingtonpost.com", "cnn.com", "bbc.com"].some((d) => domain.includes(d))) return "News";
  return "Editorial";
}

const SOURCE_TYPE_COLORS: Record<string, string> = {
  Owned: "bg-blue-50 text-blue-700",
  Editorial: "bg-gray-100 text-gray-600",
  Review: "bg-yellow-50 text-yellow-700",
  Reddit: "bg-orange-50 text-orange-700",
  Wiki: "bg-green-50 text-green-700",
  Social: "bg-purple-50 text-purple-700",
  News: "bg-sky-50 text-sky-700",
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
  const points = scores.map((s, i) => `${(i / (scores.length - 1)) * width},${height - (s / max) * height}`).join(" ");
  return (
    <div className="mt-2">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        <polyline points={points} fill="none" stroke="#c8372d" strokeWidth="1.5" strokeLinejoin="round" strokeOpacity="0.4" />
        {scores.map((s, i) => (
          <circle key={i} cx={(i / (scores.length - 1)) * width} cy={height - (s / max) * height} r="2.5" fill="#c8372d" fillOpacity="0.5" />
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

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-5">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

function NavItem({ label, active, onClick, badge }: { label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left ${
        active ? "bg-white shadow-sm text-gray-900 font-medium" : "text-gray-500 hover:text-gray-800 hover:bg-white/40"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${active ? "bg-red-500" : "bg-transparent"}`} />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[10px] font-semibold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  review: "bg-yellow-50 text-yellow-700",
  published: "bg-green-50 text-green-700",
  scheduled: "bg-blue-50 text-blue-700",
  writing: "bg-purple-50 text-purple-700",
};

function mapArticleFromDb(a: Record<string, unknown>): SavedArticle {
  return {
    id: a.id as string,
    title: a.title as string,
    keyword: (a.keyword as string) ?? "",
    status: (a.status as SavedArticle["status"]) ?? "draft",
    seoScore: (a.seo_score as number) ?? 0,
    wordCount: (a.word_count as number) ?? 0,
    createdAt: a.created_at as string,
    updatedAt: (a.updated_at as string) ?? (a.created_at as string),
    brandId: a.brand_id as string,
    content: a.content as string | undefined,
  };
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const CHANNEL_ICONS: Record<string, string> = {
  wordpress: "📝", webflow: "🌊", webhook: "🔗", discord: "💬", framer: "🎨",
};

function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [loadingBrand, setLoadingBrand] = useState(true);
  const [loadingResults, setLoadingResults] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scores, setScores] = useState<VisibilityScore[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanned, setScanned] = useState(false);
  const [selectedEngines] = useState<AIEngine[]>(["google"]);
  const [nextCheckIn, setNextCheckIn] = useState<string>("");
  const [error, setError] = useState("");
  const [scanHistory, setScanHistory] = useState<ScanRun[]>([]);
  const [socialKeywords, setSocialKeywords] = useState<SocialKeyword[]>([]);
  const [redditThreads, setRedditThreads] = useState<RedditThread[]>([]);
  const [redditConnected, setRedditConnected] = useState(false);
  const [redditUsername, setRedditUsername] = useState<string | null>(null);
  const [postingReply, setPostingReply] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [activeThread, setActiveThread] = useState<RedditThread | null>(null);
  const [draftReply, setDraftReply] = useState("");
  const [draftingReply, setDraftingReply] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  // Agent state
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentInitialized, setAgentInitialized] = useState(false);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [expandedCitationDomains, setExpandedCitationDomains] = useState<Set<string>>(new Set());
  const [engageItem, setEngageItem] = useState<{ url: string; promptText: string; engine: string } | null>(null);
  const [engageDraft, setEngageDraft] = useState("");
  const [engageGenerating, setEngageGenerating] = useState(false);
  const [engageCopied, setEngageCopied] = useState(false);
  const [hoveredScanIdx, setHoveredScanIdx] = useState<number | null>(null);
  // Citations page state
  const [showCitationOnboarding, setShowCitationOnboarding] = useState(false);
  const [citationOnboardingStep, setCitationOnboardingStep] = useState(0);
  const [dontShowCitationsOnboarding, setDontShowCitationsOnboarding] = useState(false);
  const [citationSearch, setCitationSearch] = useState("");
  const [citationTypeFilter, setCitationTypeFilter] = useState("All");
  const [citationPromptFilter, setCitationPromptFilter] = useState("All");
  const [citationHistory, setCitationHistory] = useState<{ domain: string; data: { date: string; count: number }[] }[]>([]);
  const [citationChartMode, setCitationChartMode] = useState<"line" | "bar">("line");
  const [citationChartHover, setCitationChartHover] = useState<{ idx: number; x: number; y: number } | null>(null);
  // Prompts tab state
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedCitationDomain, setSelectedCitationDomain] = useState<string | null>(null);
  const [selectedResponseResult, setSelectedResponseResult] = useState<ScanResult | null>(null);
  const [promptSearch, setPromptSearch] = useState("");
  const [newPromptText, setNewPromptText] = useState("");
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const agentEndRef = useRef<HTMLDivElement>(null);

  // Articles state
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<SavedArticle | null>(null);
  const [articleFilter, setArticleFilter] = useState<"all" | "draft" | "review" | "published" | "scheduled">("all");
  const [showNewArticleModal, setShowNewArticleModal] = useState(false);
  const [newArticleTopic, setNewArticleTopic] = useState("");
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDate, setScheduleDate] = useState("");

  // Keywords state
  const [keywordSearch, setKeywordSearch] = useState("");

  // Publishing state
  const [publishingChannels, setPublishingChannels] = useState<PublishingChannel[]>([]);
  const [publishingLog, setPublishingLog] = useState<PublishingLogEntry[]>([]);
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [newChannel, setNewChannel] = useState({ name: "", type: "webhook", url: "", apiKey: "" });
  const [addingChannel, setAddingChannel] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishArticleId, setPublishArticleId] = useState("");
  const [publishChannelId, setPublishChannelId] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Alerts state
  const [alertDestinations, setAlertDestinations] = useState<AlertDestination[]>([]);
  const [alertDeliveries, setAlertDeliveries] = useState<AlertDelivery[]>([]);
  const [showAddAlert, setShowAddAlert] = useState(false);
  const [newAlert, setNewAlert] = useState({ name: "", kind: "slack", url: "", email: "" });
  const [addingAlert, setAddingAlert] = useState(false);

  useEffect(() => {
    const savedTab = sessionStorage.getItem("dashTab");
    if (savedTab) setActiveTab(savedTab as Tab);

    createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUserEmail(user?.email ?? ""));

    fetch("/api/reddit/connection").then((r) => r.json()).then((d) => {
      setRedditConnected(d.connected);
      setRedditUsername(d.username);
    });

    if (searchParams.get("reddit") === "connected") setActiveTab("social");
    if (searchParams.get("tab") === "social") setActiveTab("social");

    const brandId = searchParams.get("brandId");

    const loadBrand = (id: string) => {
      fetch(`/api/brand?id=${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) { router.push("/setup"); return; }
          if (!searchParams.get("brandId")) router.replace(`/dashboard?brandId=${id}`);
          setBrand(data);
          fetch(`/api/history?brandId=${id}`).then((r) => r.json()).then((d) => setScanHistory(d.runs ?? []));
          fetch(`/api/scan/results?brandId=${id}`).then((r) => r.json()).then((d) => {
            if (d.results?.length) {
              setResults(d.results);
              setScanned(true);
              if (d.scores?.length) setScores(d.scores);
              if (d.overallScore !== undefined) setOverallScore(d.overallScore);
            }
          }).finally(() => setLoadingResults(false));
          fetch(`/api/keywords?brandId=${id}`).then((r) => r.json()).then((d) => setSocialKeywords(d.keywords ?? []));
          fetch(`/api/reddit/threads?brandId=${id}`).then((r) => r.json()).then((d) => setRedditThreads(d.threads ?? []));
          fetch(`/api/articles?brandId=${id}`).then((r) => r.json()).then((d) => setSavedArticles((d.articles ?? []).map(mapArticleFromDb))).finally(() => setLoadingArticles(false));
          fetch(`/api/publishing/channels?brandId=${id}`).then((r) => r.json()).then((d) => setPublishingChannels(d.channels ?? []));
          fetch(`/api/publishing/log?brandId=${id}`).then((r) => r.json()).then((d) => setPublishingLog(d.log ?? []));
          fetch(`/api/alerts?brandId=${id}`).then((r) => r.json()).then((d) => { setAlertDestinations(d.destinations ?? []); setAlertDeliveries(d.deliveries ?? []); });
        })
        .finally(() => setLoadingBrand(false));
    };

    if (!brandId) {
      fetch("/api/brands")
        .then((r) => r.json())
        .then((data) => {
          if (data.brands?.length) { loadBrand(data.brands[0].id); }
          else { router.push("/setup"); }
        })
        .catch(() => router.push("/setup"));
      return;
    }

    loadBrand(brandId);
  }, []);

  // Realtime: runs after brand loads regardless of whether brandId was in the URL
  useEffect(() => {
    if (!brand?.id) return;
    const supabase = createSupabaseBrowserClient();

    const runsChannel = supabase
      .channel("scan_runs_live")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scan_runs", filter: `brand_id=eq.${brand.id}` },
        (payload) => {
          const updated = payload.new as { id: string; overall_score: number };
          setScanHistory((prev) =>
            prev.map((r) => (r.id === updated.id ? { ...r, overall_score: updated.overall_score } : r))
          );
        }
      )
      .subscribe();

    const resultsChannel = supabase
      .channel("scan_results_live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scan_results", filter: `brand_id=eq.${brand.id}` },
        (payload) => {
          const r = payload.new as {
            prompt_id: string; prompt_text: string; engine: string;
            response: string; brand_mentioned: boolean; brand_rank: number | null;
            competitor_mentions: { name: string; rank: number | null }[];
            citations: string[]; scanned_at: string;
          };
          const newResult: ScanResult = {
            promptId: r.prompt_id,
            promptText: r.prompt_text,
            engine: r.engine as AIEngine,
            response: r.response,
            brandMentioned: r.brand_mentioned,
            brandRank: r.brand_rank,
            competitorMentions: r.competitor_mentions ?? [],
            citations: r.citations ?? [],
            scannedAt: r.scanned_at,
          };
          setResults((prev) => {
            const exists = prev.some((x) => x.promptId === newResult.promptId && x.engine === newResult.engine);
            if (exists) return prev;
            setScanned(true);
            return [...prev, newResult];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(runsChannel);
      supabase.removeChannel(resultsChannel);
    };
  }, [brand?.id]);

  useEffect(() => {
    if (!brand || results.length === 0) return;
    const activeEngines = [...new Set(results.map((r) => r.engine))] as AIEngine[];
    const sc = activeEngines.map((engine) => {
      const er = results.filter((r) => r.engine === engine);
      const mentions = er.filter((r) => r.brandMentioned);
      const ranked = mentions.filter((r) => r.brandRank !== null);
      const avgRank = ranked.length ? ranked.reduce((s, r) => s + (r.brandRank ?? 0), 0) / ranked.length : null;
      return { engine, score: er.length ? Math.round((mentions.length / er.length) * 100) : 0, mentionCount: mentions.length, totalPrompts: er.length, avgRank };
    });
    setScores(sc);
    setOverallScore(Math.round(sc.reduce((s, x) => s + x.score, 0) / sc.length));
    setGaps(computeGaps(results, brand));
  }, [results, brand]);

  useEffect(() => {
    agentEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

  // Show citations onboarding dialog + fetch citation history when tab opens
  useEffect(() => {
    if (activeTab !== "citations" || !brand) return;
    if (!localStorage.getItem("citationsOnboardingSeen")) {
      setShowCitationOnboarding(true);
      setCitationOnboardingStep(0);
    }
    fetch(`/api/citations/history?brandId=${brand.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.series) setCitationHistory(d.series); });
  }, [activeTab, brand]);

  // Countdown to next daily cron scan (8am UTC daily)
  useEffect(() => {
    function computeCountdown() {
      const now = new Date();
      // Find next 8am UTC
      const next = new Date();
      next.setUTCHours(8, 0, 0, 0);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
      const diffMs = next.getTime() - now.getTime();
      const h = Math.floor(diffMs / 3600000);
      const m = Math.floor((diffMs % 3600000) / 60000);
      setNextCheckIn(`${h}h ${m}m`);
    }
    computeCountdown();
    const timer = setInterval(computeCountdown, 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeTab === "agent" && !agentInitialized && brand) {
      setAgentInitialized(true);
      const greeting = overallScore !== null
        ? `Based on your latest scan across ${brand.trackedPrompts.length} prompts, **${brand.name}** holds **${overallScore}% visibility** with the biggest opportunities on ${gaps.length > 0 ? `"${gaps[0].promptText}"` : "comparison queries"}. Ask about gaps, competitors, or what to write next — I have your live tracking data.`
        : `Hi! I'm GROG, your AI visibility analyst for **${brand.name}** (${brand.domain}). Run a scan first to unlock live data insights, or ask me anything about AI visibility strategy.`;
      setAgentMessages([{ role: "assistant", content: greeting }]);
    }
  }, [activeTab, agentInitialized, brand, overallScore, gaps]);

  async function updateArticleStatus(id: string, status: string, extra?: Record<string, unknown>) {
    await fetch(`/api/articles/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, ...extra }) });
    setSavedArticles((prev) => prev.map((a) => a.id === id ? { ...a, status: status as SavedArticle["status"] } : a));
    setSelectedArticle((prev) => prev?.id === id ? { ...prev, status: status as SavedArticle["status"] } : prev);
  }

  async function scheduleArticle(id: string, dateStr: string) {
    await fetch(`/api/articles/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "scheduled", scheduledAt: new Date(dateStr).toISOString() }) });
    setSavedArticles((prev) => prev.map((a) => a.id === id ? { ...a, status: "scheduled" as SavedArticle["status"] } : a));
    setSelectedArticle((prev) => prev?.id === id ? { ...prev, status: "scheduled" as SavedArticle["status"] } : prev);
    setShowSchedulePicker(false);
  }

  async function deleteArticle(id: string) {
    await fetch(`/api/articles/${id}`, { method: "DELETE" });
    setSavedArticles((prev) => prev.filter((a) => a.id !== id));
    setSelectedArticle((prev) => prev?.id === id ? null : prev);
  }

  async function addChannel() {
    if (!brand?.id || !newChannel.name || !newChannel.url) return;
    setAddingChannel(true);
    const res = await fetch("/api/publishing/channels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id, name: newChannel.name, type: newChannel.type, url: newChannel.url, apiKey: newChannel.apiKey }) });
    const d = await res.json();
    if (d.channel) { setPublishingChannels((prev) => [...prev, d.channel]); setShowAddChannel(false); setNewChannel({ name: "", type: "webhook", url: "", apiKey: "" }); }
    setAddingChannel(false);
  }

  async function toggleChannel(id: string, currentStatus: string) {
    const status = currentStatus === "active" ? "paused" : "active";
    const res = await fetch("/api/publishing/channels", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    const d = await res.json();
    if (d.channel) setPublishingChannels((prev) => prev.map((ch) => ch.id === id ? d.channel : ch));
  }

  async function deleteChannel(id: string) {
    await fetch(`/api/publishing/channels?id=${id}`, { method: "DELETE" });
    setPublishingChannels((prev) => prev.filter((ch) => ch.id !== id));
  }

  async function publishNow() {
    if (!publishArticleId || !publishChannelId || !brand?.id) return;
    setPublishing(true);
    setPublishResult(null);
    const res = await fetch("/api/publishing/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: publishChannelId, articleId: publishArticleId }) });
    const d = await res.json();
    setPublishResult(d);
    if (d.success) {
      fetch(`/api/publishing/log?brandId=${brand.id}`).then((r) => r.json()).then((dd) => setPublishingLog(dd.log ?? []));
      fetch(`/api/publishing/channels?brandId=${brand.id}`).then((r) => r.json()).then((dd) => setPublishingChannels(dd.channels ?? []));
      setSavedArticles((prev) => prev.map((a) => a.id === publishArticleId ? { ...a, status: "published" as const } : a));
    }
    setPublishing(false);
  }

  async function addAlertDestination() {
    if (!brand?.id || !newAlert.name || !newAlert.kind) return;
    setAddingAlert(true);
    const res = await fetch("/api/alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id, name: newAlert.name, kind: newAlert.kind, url: newAlert.url || undefined, email: newAlert.email || undefined }) });
    const d = await res.json();
    if (d.destination) { setAlertDestinations((prev) => [...prev, d.destination]); setShowAddAlert(false); setNewAlert({ name: "", kind: "slack", url: "", email: "" }); }
    setAddingAlert(false);
  }

  async function toggleAlertDestination(id: string, currentStatus: string) {
    const status = currentStatus === "active" ? "paused" : "active";
    const res = await fetch("/api/alerts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
    const d = await res.json();
    if (d.destination) setAlertDestinations((prev) => prev.map((dest) => dest.id === id ? d.destination : dest));
  }

  async function deleteAlertDestination(id: string) {
    await fetch(`/api/alerts?id=${id}`, { method: "DELETE" });
    setAlertDestinations((prev) => prev.filter((d) => d.id !== id));
  }

  async function syncReddit() {
    if (!brand?.id) return;
    setSyncing(true);
    try {
      const syncRes = await fetch("/api/reddit/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id }) }).then((r) => r.json());
      if (syncRes.errors?.length) {
        setError(`Reddit sync issue: ${syncRes.errors[0]}`);
      }
      const d = await fetch(`/api/reddit/threads?brandId=${brand.id}`).then((r) => r.json());
      setRedditThreads(d.threads ?? []);
    } finally { setSyncing(false); }
  }

  async function addKeyword() {
    if (!brand?.id || !newKeyword.trim()) return;
    const res = await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id, keyword: newKeyword.trim() }) });
    const d = await res.json();
    if (d.keyword) {
      setSocialKeywords((prev) => [...prev, { id: d.keyword.id, keyword: d.keyword.keyword, createdAt: d.keyword.created_at }]);
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
      const res = await fetch("/api/reddit/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: thread.id, brandId: brand.id }) });
      const d = await res.json();
      setDraftReply(d.reply ?? "");
      setRedditThreads((prev) => prev.map((t) => (t.id === thread.id ? { ...t, draftedReply: d.reply, status: "read" } : t)));
    } finally { setDraftingReply(false); }
  }

  async function postReply() {
    if (!activeThread || !draftReply.trim() || !brand?.id) return;
    setPostingReply(true);
    try {
      const res = await fetch("/api/reddit/post", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: activeThread.id, reply: draftReply, brandId: brand.id }) });
      const d = await res.json();
      if (d.error) { setError(d.error); return; }
      setRedditThreads((prev) => prev.map((t) => t.id === activeThread.id ? { ...t, status: "replied" } : t));
      setActiveThread(null);
      setDraftReply("");
    } finally { setPostingReply(false); }
  }

  async function disconnectReddit() {
    await fetch("/api/reddit/connection", { method: "DELETE" });
    setRedditConnected(false);
    setRedditUsername(null);
  }

  async function runScan() {
    if (!brand) return;
    setScanning(true);
    setError("");
    const total = Math.min(5, brand.trackedPrompts.length) * selectedEngines.length;
    setScanProgress({ done: 0, total });
    const accumulated: ScanResult[] = [];

    try {
      const promptIds = brand.trackedPrompts.slice(0, 5).map((p) => p.id);
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, engines: selectedEngines, promptIds }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Scan failed");
      }

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);
            if (msg.type === "result") {
              accumulated.push(msg.result);
              setResults([...accumulated]);
              setScanned(true);
              setScanProgress((p) => p ? { ...p, done: p.done + 1 } : null);
            } else if (msg.type === "done") {
              if (msg.scores) setScores(msg.scores);
              if (msg.overallScore !== undefined) setOverallScore(msg.overallScore);
              setGaps(computeGaps(accumulated, brand));
              if (brand.id) fetch(`/api/history?brandId=${brand.id}`).then((r) => r.json()).then((d) => setScanHistory(d.runs ?? []));
            }
          } catch {}
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }

  async function sendAgentMessage() {
    if (!agentInput.trim() || agentLoading || !brand) return;
    const userMsg: AgentMessage = { role: "user", content: agentInput.trim() };
    const newMessages = [...agentMessages, userMsg];
    setAgentMessages(newMessages);
    setAgentInput("");
    setAgentLoading(true);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          scanContext: {
            brandName: brand.name,
            domain: brand.domain,
            niche: brand.niche,
            overallScore,
            scores,
            gaps: gaps.slice(0, 5),
            totalPrompts: brand.trackedPrompts.length,
            competitors: brand.competitors,
          },
        }),
      });

      if (!res.ok) throw new Error("Agent failed");
      const d = await res.json();
      setAgentMessages((prev) => [...prev, { role: "assistant", content: d.reply }]);
    } catch {
      setAgentMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't reach the server. Try again in a moment." }]);
    } finally {
      setAgentLoading(false);
    }
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

  // Citations derived data
  const CITATION_BLOCKED = [
    "vertexaisearch.cloud.google.com", "google.com", "googleapis.com", "googleusercontent.com",
    "gstatic.com", "googlesyndication.com", "doubleclick.net",
    "bing.com", "search.yahoo.com", "duckduckgo.com", "baidu.com",
    "t.co", "bit.ly", "tinyurl.com", "goo.gl",
    "example.com", "example.org", "example.net", "localhost",
    "your-domain.com", "yourdomain.com", "domain.com", "myapp.com",
  ];
  const isCitationBlocked = (domain: string) =>
    CITATION_BLOCKED.some((b) => domain === b || domain.endsWith("." + b));

  const citationDomains = (() => {
    const map: Record<string, { count: number; engines: Set<string>; type: string }> = {};
    const brandHost = brand.domain.replace(/^www\./, "");
    results.forEach((r) => {
      const seenInThisResult = new Set<string>();
      r.citations.forEach((url) => {
        const domain = url.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
        if (!domain) return;
        if (domain === brandHost || domain.endsWith("." + brandHost)) return;
        if (isCitationBlocked(domain)) return;
        if (seenInThisResult.has(domain)) return;
        seenInThisResult.add(domain);
        if (!map[domain]) map[domain] = { count: 0, engines: new Set(), type: getSourceType(domain) };
        map[domain].count++;
        map[domain].engines.add(r.engine);
      });
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  })();

  const citationInstances = (() => {
    const map: Record<string, { url: string; engine: string; promptText: string }[]> = {};
    const brandHost = brand.domain.replace(/^www\./, "");
    results.forEach((r) => {
      r.citations.forEach((url) => {
        try {
          const domain = new URL(url).hostname.replace(/^www\./, "");
          if (!domain) return;
          if (domain === brandHost || domain.endsWith("." + brandHost)) return;
          if (isCitationBlocked(domain)) return;
          if (!map[domain]) map[domain] = [];
          const exists = map[domain].some((x) => x.url === url && x.engine === r.engine);
          if (!exists) map[domain].push({ url, engine: r.engine, promptText: r.promptText });
        } catch {}
      });
    });
    return map;
  })();

  const sourceTypeCounts = citationDomains.reduce<Record<string, number>>((acc, [, v]) => {
    acc[v.type] = (acc[v.type] ?? 0) + v.count;
    return acc;
  }, {});

  // Keywords derived from prompts + gaps
  const keywordRows = brand.trackedPrompts.map((p) => {
    const gap = gaps.find((g) => g.promptText === p.text);
    const promptResults = results.filter((r) => r.promptId === p.id);
    const mentioned = promptResults.filter((r) => r.brandMentioned).length;
    const total = promptResults.length;
    const vis = total > 0 ? Math.round((mentioned / total) * 100) : null;
    return { text: p.text, hasGap: !!gap, vis, topCompetitor: gap?.topCompetitor ?? null, promptId: p.id };
  }).filter((k) => k.text.toLowerCase().includes(keywordSearch.toLowerCase()));

  const filteredArticles = articleFilter === "all" ? savedArticles : savedArticles.filter((a) => a.status === articleFilter);

  const publishedCount = savedArticles.filter((a) => a.status === "published").length;
  const draftCount = savedArticles.filter((a) => a.status === "draft" || a.status === "writing").length;
  const avgSeoScore = savedArticles.length ? Math.round(savedArticles.reduce((s, a) => s + a.seoScore, 0) / savedArticles.length) : null;

  return (
    <div className="flex h-screen bg-[#ede6dc] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-[272px] shrink-0 flex flex-col border-r border-stone-200/60">
        <div className="px-4 py-4 flex items-center gap-2 shrink-0">
          <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#c8372d" />
            <path d="M14 5C10.96 5 8.5 7.46 8.5 10.5c0 4.63 5.5 12.5 5.5 12.5s5.5-7.87 5.5-12.5C19.5 7.46 17.04 5 14 5z" fill="white" />
            <circle cx="14" cy="10.5" r="2.2" fill="#c8372d" />
          </svg>
          <span className="font-bold text-xl tracking-tight text-gray-900">RankOn<span className="text-red-600">Geo</span></span>
          <span className="ml-auto text-[10px] font-semibold bg-stone-200 text-stone-500 px-1.5 py-0.5 rounded">v2.0</span>
        </div>

        <div className="mx-3 mb-5 shrink-0 relative">
          <button
            onClick={() => setShowBrandDropdown((v) => !v)}
            className="w-full bg-white rounded-xl px-3 py-3 flex items-center gap-3 hover:bg-white/90 transition-colors shadow-sm"
          >
            <div className="w-9 h-9 rounded-lg bg-gray-900 text-white flex items-center justify-center text-sm font-bold shrink-0">{brandInitial}</div>
            <div className="text-left min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{brand.name}</p>
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">OWNER</p>
            </div>
            <svg className={`ml-auto w-4 h-4 text-gray-300 shrink-0 transition-transform duration-150 ${showBrandDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showBrandDropdown && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowBrandDropdown(false)} />
              <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-white rounded-xl shadow-lg border border-stone-200 overflow-hidden">
                <div className="px-3 py-2.5 flex items-center gap-3 bg-stone-50 border-b border-stone-100">
                  <div className="w-7 h-7 rounded-lg bg-gray-900 text-white flex items-center justify-center text-xs font-bold shrink-0">{brandInitial}</div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-900 truncate">{brand.name}</p>
                    <p className="text-[9px] text-gray-400 uppercase tracking-wider">Current brand</p>
                  </div>
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                </div>
                <button
                  onClick={() => { setShowBrandDropdown(false); router.push("/setup"); }}
                  className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-stone-50 transition-colors group"
                >
                  <div className="w-7 h-7 rounded-lg border-2 border-dashed border-stone-300 group-hover:border-stone-400 flex items-center justify-center shrink-0 transition-colors">
                    <svg className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-600 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-stone-500 group-hover:text-stone-700 transition-colors">Add another brand</span>
                </button>
              </div>
            </>
          )}
        </div>

        <nav className="flex-1 px-3 overflow-y-auto space-y-5">
          <div>
            <NavItem label="Agent" active={activeTab === "agent"} onClick={() => navTo("agent")} />
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2.5 mb-1.5">Measure</p>
            <div className="space-y-0.5">
              <NavItem label="Overview" active={activeTab === "overview"} onClick={() => navTo("overview")} />
              <NavItem label="Engines" active={activeTab === "history"} onClick={() => navTo("history")} />
              <NavItem label="Prompts" active={activeTab === "results"} onClick={() => navTo("results")} />
              <NavItem label="Citations" active={activeTab === "citations"} onClick={() => navTo("citations")} />
              <NavItem label="Competitors" active={activeTab === "competitors"} onClick={() => navTo("competitors")} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2.5 mb-1.5">Create</p>
            <div className="space-y-0.5">
              <NavItem label="Research" active={activeTab === "gaps"} onClick={() => navTo("gaps")} badge={gaps.length || undefined} />
              <NavItem label="Keywords" active={activeTab === "keywords"} onClick={() => navTo("keywords")} />
              <NavItem label="Articles" active={activeTab === "articles"} onClick={() => navTo("articles")} badge={draftCount || undefined} />
              <NavItem label="Social" active={activeTab === "social"} onClick={() => navTo("social")} badge={newThreadCount || undefined} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2.5 mb-1.5">Distribute</p>
            <div className="space-y-0.5">
              <NavItem label="Publishing" active={activeTab === "publishing"} onClick={() => navTo("publishing")} />
              <NavItem label="Schedule" active={activeTab === "schedule"} onClick={() => navTo("schedule")} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-2.5 mb-1.5">On Page</p>
            <div className="space-y-0.5">
              <NavItem label="Brands" active={activeTab === "brands"} onClick={() => navTo("brands")} />
              <NavItem label="Alerts" active={activeTab === "alerts"} onClick={() => navTo("alerts")} />
            </div>
          </div>
        </nav>

        <div className="mx-3 mb-3 mt-3 shrink-0">
          <div className="bg-white/60 rounded-xl px-3 py-2.5 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
              {userEmail[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate">{userEmail || brand.domain}</p>
              <p className="text-[10px] text-gray-400">Workspace</p>
            </div>
            <button onClick={signOut} title="Sign out" className="text-gray-300 hover:text-gray-600 transition-colors shrink-0">
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="bg-white/70 backdrop-blur-sm border-b border-stone-200/70 px-6 py-3 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <div className="w-5 h-5 rounded bg-gray-900 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{brandInitial}</div>
            <span className="font-medium text-gray-700">{brand.domain}</span>
            <span className="text-gray-300 mx-0.5">/</span>
            <span className="text-gray-500">{TAB_LABELS[activeTab]}</span>
          </div>

          <div className="flex items-center gap-3">
            {/* "Next check in" countdown — shown once scanned, hidden during scan */}
            {scanned && !scanning && (
              <div className="flex items-center gap-1.5 text-xs text-gray-400 border border-stone-200 rounded-lg px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                Next check in: <span className="font-medium text-gray-600">{nextCheckIn}</span>
              </div>
            )}
            {/* Scan button — always visible when not scanning */}
            {!scanning && !loadingResults && (
              <button
                onClick={runScan}
                disabled={selectedEngines.length === 0}
                className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                {scanned ? "Re-scan" : "Start monitoring"}
              </button>
            )}
            {scanning && (
              <div className="flex items-center gap-1.5 text-xs text-gray-500 border border-stone-200 rounded-lg px-3 py-1.5">
                <span className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                {scanned ? "Scanning…" : "Running initial scan…"}
              </div>
            )}
            {activeTab === "articles" && (
              <button
                onClick={() => { setNewArticleTopic(""); setShowNewArticleModal(true); }}
                className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                + New article
              </button>
            )}
            {activeTab === "publishing" && (
              <button onClick={() => { setPublishResult(null); setShowPublishModal(true); }} className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
                ⚡ Publish now
              </button>
            )}
            {activeTab === "agent" && (
              <button
                onClick={() => { setAgentMessages([]); setAgentInitialized(false); }}
                className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors"
              >
                + New chat
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className={`flex-1 overflow-y-auto ${activeTab === "agent" ? "flex flex-col" : "px-6 py-6"}`}>
          {error && (
            <div className="px-6 pt-4">
              <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-600 mb-5">{error}</div>
            </div>
          )}

          {scanning && activeTab !== "agent" && (
            <div className="bg-white border border-stone-200 rounded-xl p-8 text-center mb-5">
              <div className="w-7 h-7 border-2 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-700">Scanning AI engines…</p>
              {scanProgress ? (
                <div className="mt-2 w-48">
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>{scanProgress.done} of {scanProgress.total} done</span>
                    <span>{Math.round((scanProgress.done / scanProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#c8372d] rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((scanProgress.done / scanProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400 mt-1">Starting up…</p>
              )}
            </div>
          )}

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <>
              {!scanned && !scanning && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
              ) : !scanned && !scanning ? (
                <EmptyState label="No scan data yet" sub={`${brand.trackedPrompts.length} prompts ready — click "+ Run scan" to start`} />
              ) : scanned && (
                <>
                  <div className="mb-5">
                    <h2 className="text-2xl font-bold text-gray-900">Overview</h2>
                    {overallScore !== null && <p className="text-sm text-gray-400 mt-0.5">Visibility up to {overallScore}% composite</p>}
                  </div>
                  <div className="grid grid-cols-4 gap-3 mb-5">
                    <div className="col-span-1 bg-white border border-stone-200 rounded-xl p-5 flex flex-col items-center justify-center">
                      <div className="text-4xl font-bold text-gray-900 mb-1">{overallScore}%</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider text-center">Composite visibility</div>
                      <MiniTrendChart runs={scanHistory} />
                    </div>
                    {scores.map((s) => (
                      <div key={s.engine} className="bg-white border border-stone-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <div className={`w-2 h-2 rounded-full ${ENGINE_COLORS[s.engine]}`} />
                          <span className="text-xs font-medium text-gray-700">{ENGINE_LABELS[s.engine]}</span>
                        </div>
                        <div className={`text-3xl font-bold mb-1 ${ENGINE_TEXT_COLORS[s.engine]}`}>{s.score}%</div>
                        <div className="text-xs text-gray-400">{s.mentionCount}/{s.totalPrompts} prompts{s.avgRank ? ` · avg #${s.avgRank.toFixed(1)}` : ""}</div>
                        <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${ENGINE_COLORS[s.engine]}`} style={{ width: `${s.score}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {(() => {
                      const scannedIds = new Set(results.map((r) => r.promptId));
                      return brand.trackedPrompts.filter((p) => scannedIds.has(p.id)).map((p) => {
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
                                    <span className="text-xs font-medium text-red-600">#{r.brandRank ?? "✓"}</span>
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

          {/* ENGINES */}
          {activeTab === "history" && (
            <>
              {scanHistory.length === 0 ? (
                <EmptyState label="No engine history yet" sub="Run a scan to see per-engine visibility trends over time" />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Engines</h2>
                  <p className="text-sm text-gray-400 mb-5">Overall AI visibility over time — hover for details</p>

                  {/* Chart */}
                  {(() => {
                    const runs = [...scanHistory].reverse();
                    const W = 600, H = 160, PAD = { t: 12, r: 16, b: 28, l: 36 };
                    const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;
                    const xOf = (i: number) => PAD.l + (runs.length === 1 ? iW / 2 : (i / (runs.length - 1)) * iW);
                    const yOf = (v: number) => PAD.t + iH - (v / 100) * iH;
                    const ENGINE_HEX: Record<string, string> = { chatgpt: "#10a37f", claude: "#d4673a", gemini: "#4285f4", perplexity: "#7c3aed", google: "#c8372d", grok: "#555" };
                    const hovered = hoveredScanIdx !== null ? runs[hoveredScanIdx] : null;

                    return (
                      <div className="bg-white border border-stone-200 rounded-xl p-5 mb-5">
                        <div className="relative">
                          <svg
                            viewBox={`0 0 ${W} ${H}`}
                            className="w-full"
                            style={{ height: 180 }}
                            onMouseLeave={() => setHoveredScanIdx(null)}
                          >
                            {/* Grid lines */}
                            {[0, 25, 50, 75, 100].map((pct) => (
                              <g key={pct}>
                                <line x1={PAD.l} y1={yOf(pct)} x2={W - PAD.r} y2={yOf(pct)} stroke="#f0ece8" strokeWidth="1" />
                                <text x={PAD.l - 4} y={yOf(pct) + 4} textAnchor="end" fontSize="9" fill="#bbb">{pct}%</text>
                              </g>
                            ))}

                            {/* Area fill */}
                            {runs.length > 1 && (
                              <path
                                d={[
                                  `M ${xOf(0)} ${yOf(runs[0].overall_score)}`,
                                  ...runs.slice(1).map((r, i) => `L ${xOf(i + 1)} ${yOf(r.overall_score)}`),
                                  `L ${xOf(runs.length - 1)} ${H - PAD.b}`,
                                  `L ${xOf(0)} ${H - PAD.b} Z`,
                                ].join(" ")}
                                fill="rgba(200,55,45,0.06)"
                              />
                            )}

                            {/* Composite line */}
                            <polyline
                              points={runs.map((r, i) => `${xOf(i)},${yOf(r.overall_score)}`).join(" ")}
                              fill="none"
                              stroke="#c8372d"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />

                            {/* Hover crosshair */}
                            {hoveredScanIdx !== null && (
                              <line x1={xOf(hoveredScanIdx)} y1={PAD.t} x2={xOf(hoveredScanIdx)} y2={H - PAD.b} stroke="#d0cac3" strokeWidth="1" strokeDasharray="3 2" />
                            )}

                            {/* Dots */}
                            {runs.map((r, i) => (
                              <circle key={i} cx={xOf(i)} cy={yOf(r.overall_score)} r={hoveredScanIdx === i ? 4 : 3} fill="#c8372d" />
                            ))}

                            {/* X-axis labels */}
                            {runs.map((r, i) => {
                              if (runs.length > 6 && i % 2 !== 0) return null;
                              return (
                                <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#bbb">
                                  {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </text>
                              );
                            })}

                            {/* Hover hit areas */}
                            {runs.map((_, i) => (
                              <rect key={i} x={xOf(i) - (iW / Math.max(runs.length - 1, 1)) / 2} y={PAD.t} width={iW / Math.max(runs.length - 1, 1)} height={iH} fill="transparent" onMouseEnter={() => setHoveredScanIdx(i)} />
                            ))}
                          </svg>

                          {/* Tooltip */}
                          {hovered && hoveredScanIdx !== null && (
                            <div
                              className="absolute z-10 bg-white border border-stone-200 rounded-xl shadow-lg px-3.5 py-3 text-xs pointer-events-none"
                              style={{ top: 8, left: Math.min(Math.max((hoveredScanIdx / Math.max(runs.length - 1, 1)) * 100, 5), 70) + "%", transform: "translateX(-50%)", minWidth: 160 }}
                            >
                              <p className="font-semibold text-gray-700 mb-2">
                                {new Date(hovered.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-gray-500">Overall</span>
                                <span className="font-bold text-[#c8372d] ml-auto">{hovered.overall_score}%</span>
                              </div>
                              {hovered.visibility_scores?.map((s) => (
                                <div key={s.engine} className="flex items-center gap-2 mb-1">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ENGINE_HEX[s.engine] ?? "#888" }} />
                                  <span className="text-gray-400">{ENGINE_LABELS[s.engine as AIEngine]}</span>
                                  <span className="font-medium text-gray-600 ml-auto">{s.score}%</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Scan history cards */}
                  <div className="space-y-2.5">
                    {scanHistory.map((run) => {
                      const isScanning = run.overall_score === 0 && (Date.now() - new Date(run.created_at).getTime()) < 10 * 60 * 1000;
                      return (
                      <div key={run.id} className="bg-white border border-stone-200 rounded-xl px-5 py-4 flex items-center gap-4">
                        {isScanning ? (
                          <div className="w-14 shrink-0 flex items-center">
                            <span className="w-5 h-5 border-2 border-stone-300 border-t-[#c8372d] rounded-full animate-spin" />
                          </div>
                        ) : (
                          <div className="text-2xl font-black text-gray-900 w-14 shrink-0">{run.overall_score}%</div>
                        )}
                        <div className="flex-1 min-w-0">
                          {isScanning ? (
                            <p className="text-xs font-medium text-[#c8372d] mb-1">Scanning in progress…</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {run.visibility_scores?.map((s) => (
                                <span key={s.engine} className="text-xs text-gray-500">
                                  {ENGINE_LABELS[s.engine as AIEngine]}: <span className="font-semibold text-gray-800">{s.score}%</span>
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-gray-400">{new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {run.engines.map((e) => <div key={e} className={`w-2 h-2 rounded-full ${ENGINE_COLORS[e as AIEngine] ?? "bg-gray-300"}`} />)}
                        </div>
                      </div>
                    )})}
                  </div>
                </>
              )}
            </>
          )}

          {/* PROMPTS */}
          {activeTab === "results" && (
            <>
              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
              ) : !scanned ? (
                <EmptyState label="No prompt data" sub="Monitoring starts automatically — check back after your first daily scan" />
              ) : selectedPromptId ? (() => {
                /* ── PROMPT DETAIL VIEW ── */
                const prompt = brand.trackedPrompts.find((p) => p.id === selectedPromptId);
                if (!prompt) return null;
                const promptResults = results.filter((r) => r.promptId === selectedPromptId);
                const mentionedCount = promptResults.filter((r) => r.brandMentioned).length;
                const visibility = promptResults.length ? Math.round(mentionedCount / promptResults.length * 100) : 0;
                const ranks = promptResults.filter((r) => r.brandMentioned && r.brandRank).map((r) => r.brandRank!);
                const avgPos = ranks.length ? (ranks.reduce((s, r) => s + r, 0) / ranks.length) : null;

                // Top brands — extract from ranked list items in the response directly (no pre-config needed)
                const compMap: Record<string, { name: string; domain: string | null; count: number; totalRank: number; engines: AIEngine[] }> = {};
                const brandNameLower = brand.name.toLowerCase();
                promptResults.forEach((r) => {
                  const listItems = r.response.match(/\d+[\.\)]\s+([^\n]+)/g) ?? [];
                  const seen = new Set<string>();

                  listItems.forEach((item, idx) => {
                    const boldMatch = item.match(/\*{1,2}([A-Za-z][A-Za-z0-9\s\.\-]+?)\*{1,2}/);
                    const plainMatch = item.match(/\d+[\.\)]\s+([A-Za-z][A-Za-z0-9\s\.\-]{1,30}?)[\s:,\(]/);
                    const name = (boldMatch?.[1] ?? plainMatch?.[1] ?? "").trim();
                    if (!name || name.toLowerCase() === brandNameLower || seen.has(name.toLowerCase())) return;
                    seen.add(name.toLowerCase());
                    // Try to extract a domain from a URL in the same list item
                    const urlMatch = item.match(/https?:\/\/(?:www\.)?([^\s\)\"<>\/]+)/);
                    const domain = urlMatch ? urlMatch[1] : null;
                    if (!compMap[name]) compMap[name] = { name, domain, count: 0, totalRank: 0, engines: [] };
                    if (!compMap[name].domain && domain) compMap[name].domain = domain;
                    compMap[name].count++;
                    compMap[name].totalRank += idx + 1;
                    if (!compMap[name].engines.includes(r.engine)) compMap[name].engines.push(r.engine);
                  });

                  // Also include stored competitorMentions in case they're not in a numbered list
                  r.competitorMentions.forEach((cm) => {
                    if (seen.has(cm.name.toLowerCase()) || cm.name.toLowerCase() === brandNameLower) return;
                    seen.add(cm.name.toLowerCase());
                    if (!compMap[cm.name]) compMap[cm.name] = { name: cm.name, domain: null, count: 0, totalRank: 0, engines: [] };
                    compMap[cm.name].count++;
                    if (cm.rank) compMap[cm.name].totalRank += cm.rank;
                    if (!compMap[cm.name].engines.includes(r.engine)) compMap[cm.name].engines.push(r.engine);
                  });
                });
                const topBrands: { name: string; domain: string; visibility: number; avgPos: number | null; engines: AIEngine[]; isOwn: boolean }[] = [
                  { name: brand.name, domain: brand.domain, visibility, avgPos, engines: promptResults.filter(r => r.brandMentioned).map(r => r.engine), isOwn: true },
                  ...Object.values(compMap).map((c) => ({
                    name: c.name,
                    domain: c.domain ?? `${c.name.toLowerCase()}.com`,
                    visibility: Math.round(c.count / promptResults.length * 100),
                    avgPos: c.count ? c.totalRank / c.count || null : null,
                    engines: c.engines,
                    isOwn: false,
                  })),
                ].sort((a, b) => {
                  // Sort by avg position ascending (rank #1 first); nulls last
                  if (a.avgPos === null && b.avgPos === null) return 0;
                  if (a.avgPos === null) return 1;
                  if (b.avgPos === null) return -1;
                  return a.avgPos - b.avgPos;
                });

                // Top citations by domain
                const citDomains: Record<string, { count: number; urls: { url: string; engine: AIEngine }[] }> = {};
                promptResults.forEach((r) => {
                  r.citations.forEach((url) => {
                    try {
                      const domain = new URL(url).hostname.replace(/^www\./, "");
                      if (!citDomains[domain]) citDomains[domain] = { count: 0, urls: [] };
                      citDomains[domain].count++;
                      if (!citDomains[domain].urls.some((u) => u.url === url)) citDomains[domain].urls.push({ url, engine: r.engine });
                    } catch {}
                  });
                });
                const sortedCitDomains = Object.entries(citDomains).sort((a, b) => b[1].count - a[1].count);
                const activeDomain = selectedCitationDomain && citDomains[selectedCitationDomain] ? selectedCitationDomain : null;
                const promptType = prompt.category || "other";
                const typeLabel = promptType.includes("brand") ? "Branded" : promptType.includes("competitor") ? "Competitor" : promptType.includes("commercial") ? "Commercial" : "General";
                const typeColor = promptType.includes("brand") ? "bg-purple-100 text-purple-700" : promptType.includes("competitor") ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700";

                // Simulated area chart: flat at 0 then jump to current visibility (real data needs historical per-prompt API)
                const chartPts = [0, 0, 0, 0, 0, visibility, visibility];
                const chartDates = Array.from({ length: 7 }, (_, i) => {
                  const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                });
                const W2 = 600, H2 = 200, pL = 40, pR = 12, pT = 16, pB = 36;
                const tx2 = (i: number) => pL + i * (W2 - pL - pR) / 6;
                const ty2 = (v: number) => pT + (H2 - pT - pB) * (1 - v / 100);
                let areaPath = `M ${tx2(0)} ${ty2(chartPts[0])}`;
                for (let i = 1; i < chartPts.length; i++) {
                  const cp1x = tx2(i-1) + (tx2(i) - tx2(i-1)) * 0.5, cp1y = ty2(chartPts[i-1]);
                  const cp2x = tx2(i) - (tx2(i) - tx2(i-1)) * 0.5, cp2y = ty2(chartPts[i]);
                  areaPath += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${tx2(i)} ${ty2(chartPts[i])}`;
                }
                const fillPath = areaPath + ` L ${tx2(6)} ${H2 - pB} L ${tx2(0)} ${H2 - pB} Z`;

                return (
                  <div>
                    {/* Back nav */}
                    <button onClick={() => { setSelectedPromptId(null); setSelectedCitationDomain(null); }} className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 mb-5 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                      Back to Prompts
                    </button>

                    {/* PROMPT card */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-6 mb-4">
                      <div className="flex gap-6">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Prompt</p>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center gap-1.5 text-xs font-medium bg-green-50 text-green-700 px-2.5 py-1 rounded-full border border-green-100">
                              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />Active
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-gray-500">🌐 Global</span>
                          </div>
                          <h2 className="text-xl font-bold text-gray-900 mb-3">{prompt.text}</h2>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${typeColor}`}>{typeLabel}</span>
                            <div className="flex items-center gap-1">
                              {promptResults.slice(0,3).map((r) => (
                                <EngineIcon key={r.engine} engine={r.engine} size={20} />
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 grid grid-cols-3 gap-3">
                          <div className="bg-stone-50 rounded-xl p-3 text-center min-w-[80px]">
                            <p className="text-lg font-bold text-green-600">#{avgPos?.toFixed(1) ?? "—"}</p>
                            <p className="text-[10px] text-gray-400 mt-0.5">Avg. Position</p>
                          </div>
                          <div className="bg-stone-50 rounded-xl p-3 text-center min-w-[80px]">
                            <div className="flex items-center justify-center gap-0.5 mb-0.5">
                              {[1,2,3,4].map((b) => (
                                <div key={b} className={`w-1.5 rounded-sm ${b <= Math.ceil(visibility/25) ? "h-4 bg-green-500" : "h-4 bg-stone-200"}`} style={{height: `${8 + b * 3}px`}} />
                              ))}
                            </div>
                            <p className="text-[10px] text-gray-400">Volume</p>
                          </div>
                          <div className="bg-stone-50 rounded-xl p-3 text-center min-w-[80px]">
                            <div className="relative w-12 h-12 mx-auto mb-1">
                              <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
                                <circle cx="22" cy="22" r="17" fill="none" stroke="#e5e7eb" strokeWidth="3.5"/>
                                <circle cx="22" cy="22" r="17" fill="none" stroke="#22c55e" strokeWidth="3.5" strokeDasharray={`${visibility * 1.068} 106.8`} strokeLinecap="round"/>
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                              </div>
                            </div>
                            <p className="text-[10px] font-semibold text-gray-700">Visibility</p>
                            <p className="text-[10px] text-green-600 font-bold">{visibility}% <span className="text-gray-400 font-normal">in last 7d</span></p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LLM Visibility Score + Top Brands */}
                    <div className="grid grid-cols-[1fr_420px] gap-4 mb-4">
                      {/* Area chart */}
                      <div className="bg-white border border-stone-200 rounded-2xl p-6">
                        <p className="text-sm font-semibold text-gray-900 mb-0.5">LLM Visibility Score <span className="text-gray-400 font-normal text-xs ml-1">ⓘ</span></p>
                        <p className="text-xs text-gray-400 mb-4">Percentage of AI responses that mention your brand for this prompt</p>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="text-4xl font-bold text-gray-900">{visibility}%</span>
                            <span className="ml-2 text-xs font-medium bg-stone-100 text-gray-500 px-2 py-0.5 rounded-full">vs previous day</span>
                          </div>
                          <div className="text-right">
                            <p className="text-xl font-bold text-gray-900">#{avgPos?.toFixed(1) ?? "—"}</p>
                            <p className="text-xs text-gray-400">Your rank</p>
                          </div>
                        </div>
                        <svg viewBox={`0 0 ${W2} ${H2}`} className="w-full" style={{ height: H2 }}>
                          <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.15"/>
                              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.01"/>
                            </linearGradient>
                          </defs>
                          {[0, 25, 50, 75, 100].map((v) => (
                            <g key={v}>
                              <line x1={pL} x2={W2 - pR} y1={ty2(v)} y2={ty2(v)} stroke="#f3f4f6" strokeWidth="1"/>
                              <text x={pL - 6} y={ty2(v) + 4} textAnchor="end" fontSize="9" fill="#9ca3af">{v}%</text>
                            </g>
                          ))}
                          <path d={fillPath} fill="url(#areaGrad)"/>
                          <path d={areaPath} fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"/>
                          {chartDates.map((d, i) => (
                            <text key={i} x={tx2(i)} y={H2 - 8} textAnchor="middle" fontSize="9" fill="#9ca3af">{d}</text>
                          ))}
                        </svg>
                      </div>

                      {/* Top Brands */}
                      <div className="bg-white border border-stone-200 rounded-2xl p-5 overflow-hidden">
                        <p className="text-sm font-semibold text-gray-900 mb-0.5">Top Brands <span className="text-gray-400 font-normal text-xs ml-1">ⓘ</span></p>
                        <p className="text-xs text-gray-400 mb-3">Brands appearing in AI responses for this prompt</p>
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 px-2 py-1.5 border-b border-stone-100 bg-stone-50/60 rounded-lg mb-1">
                          <span className="text-[10px] font-semibold text-gray-400 w-5">Rank</span>
                          <span className="text-[10px] font-semibold text-gray-400"></span>
                          <span className="text-[10px] font-semibold text-gray-400 text-right">Sources</span>
                          <span className="w-12" />
                        </div>
                        <div className="space-y-1 overflow-y-auto max-h-[320px]">
                          {topBrands.slice(0, 8).map((b, i) => {
                            return (
                              <div key={b.name} className={`grid grid-cols-[auto_1fr_auto_auto] gap-x-2 px-2 py-2.5 rounded-xl items-center ${b.isOwn ? "bg-amber-50/60 border border-amber-100" : "hover:bg-stone-50"}`}>
                                <span className="text-xs font-semibold text-gray-500 w-5">{i + 1}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={`https://logo.clearbit.com/${b.domain}`} alt="" width={22} height={22} className="rounded shrink-0" onError={(e) => { const el = e.target as HTMLImageElement; el.src = `https://www.google.com/s2/favicons?domain=${b.domain}&sz=32`; el.onerror = () => { el.style.display = "none"; }; }} />
                                    <span className="text-xs font-semibold text-gray-800 truncate">{b.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 ml-7">
                                    <span className="text-[10px] text-gray-500">●{b.visibility}% Visibility</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-xs font-bold ${i === 0 ? "text-green-600" : i < 3 ? "text-amber-500" : "text-gray-400"}`}>#{b.avgPos?.toFixed(1) ?? "—"}</p>
                                  <p className="text-[9px] text-gray-400">Avg. Position</p>
                                </div>
                                <div className="flex gap-0.5 w-12 justify-end">
                                  {b.engines.slice(0, 2).map((e) => (
                                    <EngineIcon key={e} engine={e} size={20} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Recent Responses table */}
                    {promptResults.length > 0 && (
                      <div className="bg-white border border-stone-200 rounded-2xl p-5 mb-4">
                        <p className="text-sm font-semibold text-gray-900 mb-0.5">Recent Responses for Your Prompt</p>
                        <p className="text-xs text-gray-400 mb-4">Latest AI responses when this specific prompt was used</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-stone-100">
                                <th className="text-left text-[10px] font-semibold text-gray-400 pb-2 pr-3 w-8">LLM</th>
                                <th className="text-left text-[10px] font-semibold text-gray-400 pb-2 pr-3">Response</th>
                                <th className="text-left text-[10px] font-semibold text-gray-400 pb-2 pr-3 w-16">Position</th>
                                <th className="text-left text-[10px] font-semibold text-gray-400 pb-2 pr-3 w-20">Mentioned?</th>
                                <th className="text-left text-[10px] font-semibold text-gray-400 pb-2 pr-3 w-16">Citations</th>
                                <th className="text-left text-[10px] font-semibold text-gray-400 pb-2 w-20">Created</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-50">
                              {promptResults.map((r, i) => {
                                const ago = (() => {
                                  const diff = Date.now() - new Date(r.scannedAt).getTime();
                                  const h = Math.floor(diff / 3600000);
                                  const d = Math.floor(h / 24);
                                  return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : "just now";
                                })();
                                return (
                                  <tr key={i} className="hover:bg-stone-50 cursor-pointer" onClick={() => setSelectedResponseResult(r)}>
                                    <td className="py-3 pr-3">
                                      <EngineIcon engine={r.engine} size={24} />
                                    </td>
                                    <td className="py-3 pr-3 max-w-xs">
                                      <span className="text-gray-700 line-clamp-2 leading-snug">{r.response.slice(0, 140)}{r.response.length > 140 ? "…" : ""}</span>
                                    </td>
                                    <td className="py-3 pr-3">
                                      <span className={`font-bold ${r.brandRank ? "text-green-600" : "text-gray-400"}`}>{r.brandRank ? `#${r.brandRank}` : "—"}</span>
                                    </td>
                                    <td className="py-3 pr-3">
                                      {r.brandMentioned
                                        ? <span className="inline-flex items-center gap-1 bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full text-[10px] font-semibold">✓ Yes</span>
                                        : <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 border border-red-100 px-2 py-0.5 rounded-full text-[10px] font-semibold">✗ No</span>
                                      }
                                    </td>
                                    <td className="py-3 pr-3">
                                      <div className="flex items-center gap-1">
                                        {r.citations.slice(0, 3).map((url, ci) => {
                                          try {
                                            const d = new URL(url).hostname.replace(/^www\./, "");
                                            // eslint-disable-next-line @next/next/no-img-element
                                            return <img key={ci} src={`https://www.google.com/s2/favicons?domain=${d}&sz=16`} alt={d} width={14} height={14} className="rounded" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />;
                                          } catch { return null; }
                                        })}
                                        {r.citations.length > 3 && <span className="text-[10px] text-gray-400">+{r.citations.length - 3}</span>}
                                        {r.citations.length === 0 && <span className="text-gray-300">—</span>}
                                      </div>
                                    </td>
                                    <td className="py-3 text-gray-400">{ago}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Full response modal */}
                    {selectedResponseResult && (
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedResponseResult(null)}>
                        <div className="bg-[#111] rounded-2xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                              <EngineIcon engine={selectedResponseResult.engine} size={28} />
                              <span className="text-sm font-semibold text-white">{ENGINE_LABELS[selectedResponseResult.engine]}</span>
                            </div>
                            <button onClick={() => setSelectedResponseResult(null)} className="text-gray-400 hover:text-white transition-colors text-lg leading-none">×</button>
                          </div>
                          <div className="bg-[#1a1a1a] rounded-xl px-4 py-3 mb-4">
                            <p className="text-xs text-gray-400 mb-1">Prompt</p>
                            <p className="text-sm text-white">{selectedResponseResult.promptText}</p>
                          </div>
                          <div className="prose prose-invert prose-sm max-w-none text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{selectedResponseResult.response}</div>
                        </div>
                      </div>
                    )}

                    {/* Top Citations split view */}
                    {sortedCitDomains.length > 0 && (
                      <div className="bg-white border border-stone-200 rounded-2xl p-5">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">Top Citations <span className="text-gray-400 font-normal text-xs ml-1">ⓘ</span></p>
                            <p className="text-xs text-gray-400">Check the citation sources and engage</p>
                          </div>
                          <button onClick={() => navTo("citations")} className="text-xs font-semibold border border-stone-200 px-3 py-1.5 rounded-lg text-gray-600 hover:bg-stone-50 transition-colors">View all</button>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                          {/* Left: domain list */}
                          <div className="space-y-1.5">
                            {sortedCitDomains.map(([domain, info], i) => (
                              <button
                                key={domain}
                                onClick={() => setSelectedCitationDomain(domain === activeDomain ? null : domain)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${domain === activeDomain ? "border-stone-300 bg-stone-50" : "border-stone-100 hover:bg-stone-50"}`}
                              >
                                <span className="text-xs text-gray-400 font-medium w-5 shrink-0">#{i+1}</span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={24} height={24} className="rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                <span className="text-sm text-gray-800 font-medium truncate flex-1">{domain}</span>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold text-gray-900">{info.count}</p>
                                  <p className="text-[10px] text-gray-400">Citations</p>
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Right: URL detail panel */}
                          <div>
                            {!activeDomain ? (
                              <div className="flex flex-col items-center justify-center h-full text-center py-8 border border-dashed border-stone-200 rounded-xl">
                                <div className="w-12 h-4 bg-stone-100 rounded mb-2 mx-auto" />
                                <div className="w-24 h-2 bg-stone-100 rounded mb-1 mx-auto" />
                                <div className="w-16 h-2 bg-stone-100 rounded mb-4 mx-auto" />
                                <p className="text-xs text-gray-400 leading-relaxed">Select a citation source from left panel<br/>to see the engage-able links.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {citDomains[activeDomain].urls.map((item, i) => {
                                  const isReddit = item.url.includes("reddit.com");
                                  const urlShort = item.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60) + (item.url.length > 75 ? "…" : "");
                                  const urlDomain = new URL(item.url).hostname.replace(/^www\./, "");
                                  const impact = isReddit ? "High impact" : citDomains[activeDomain].count >= 3 ? "Medium impact" : "Low impact";
                                  const impactColor = impact === "High impact" ? "bg-green-100 text-green-700" : impact === "Medium impact" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-600";
                                  return (
                                    <div key={i} className="border border-stone-100 rounded-xl p-3">
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 inline-block ${impactColor}`}>{impact}</span>
                                      <div className="flex items-start gap-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`https://www.google.com/s2/favicons?domain=${urlDomain}&sz=16`} alt="" width={14} height={14} className="rounded mt-0.5 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                        <div className="flex-1 min-w-0">
                                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-700 hover:text-blue-600 font-medium leading-snug flex items-center gap-1">
                                            <span className="truncate">{urlShort}</span>
                                            <svg className="w-3 h-3 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                          </a>
                                          <p className="text-[10px] text-gray-400">{urlDomain}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="text-xs font-bold text-gray-900">{citDomains[activeDomain].count}</p>
                                          <p className="text-[9px] text-gray-400">Citations</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-2">
                                        <span className="text-[10px] text-gray-400">Cited by</span>
                                        <EngineIcon engine={item.engine} size={16} />
                                        {isReddit && (
                                          <button onClick={() => { setEngageItem({ url: item.url, promptText: prompt.text, engine: item.engine }); setEngageDraft(""); navTo("citations"); }} className="ml-auto text-[10px] font-semibold bg-[#FF4500] text-white px-2 py-0.5 rounded-full hover:bg-[#e03d00] transition-colors">Engage</button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })() : (
                /* ── PROMPTS LIST VIEW ── */
                (() => {
                  const allPrompts = brand.trackedPrompts;
                  const brandedCount = allPrompts.filter((p) => p.category?.toLowerCase().includes("brand")).length;
                  const competitorCount = allPrompts.filter((p) => p.category?.toLowerCase().includes("competitor")).length;
                  const commercialCount = allPrompts.filter((p) => p.category?.toLowerCase().includes("commercial")).length;
                  const used = allPrompts.length;
                  const limit = 20;
                  const filtered = allPrompts.filter((p) => !promptSearch || p.text.toLowerCase().includes(promptSearch.toLowerCase()));

                  return (
                    <>
                      <h2 className="text-xl font-bold text-gray-900 mb-0.5">Prompts</h2>
                      <p className="text-sm text-gray-400 mb-5">Manage your search prompts</p>

                      {/* Usage bar */}
                      <div className="bg-white border border-stone-200 rounded-2xl px-5 py-4 mb-5">
                        <p className="text-sm font-semibold text-gray-800 mb-2">{used} of {limit} prompts used</p>
                        <div className="h-2 bg-stone-100 rounded-full overflow-hidden flex gap-0.5 mb-2">
                          <div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${(commercialCount / limit) * 100}%` }} />
                          <div className="h-full bg-amber-300 rounded-full transition-all" style={{ width: `${(competitorCount / limit) * 100}%` }} />
                          <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${(brandedCount / limit) * 100}%` }} />
                        </div>
                        <div className="flex gap-4">
                          {[["bg-blue-400","Commercial",commercialCount],["bg-amber-300","Competitor",competitorCount],["bg-purple-500","Branded",brandedCount]].map(([color, label, count]) => (
                            <div key={label as string} className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${color}`} />
                              <span className="text-xs text-gray-500">{label as string}</span>
                              {(count as number) > 0 && <span className="text-xs text-gray-400">({count as number})</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Search */}
                      <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 py-2 mb-4">
                        <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <input value={promptSearch} onChange={(e) => setPromptSearch(e.target.value)} placeholder="Search prompts" className="text-sm flex-1 outline-none bg-transparent text-gray-800 placeholder:text-gray-400" />
                      </div>

                      {/* Table */}
                      <div className="bg-white border border-stone-200 rounded-2xl overflow-hidden">
                        <div className="grid grid-cols-[1fr_80px_60px_100px_70px_40px_32px] gap-x-4 px-5 py-3 border-b border-stone-100 bg-stone-50/60">
                          <span className="text-[11px] font-semibold text-gray-500">Prompts</span>
                          <span className="text-[11px] font-semibold text-gray-500 text-center">Position</span>
                          <span className="text-[11px] font-semibold text-gray-500 text-center">Volume</span>
                          <span className="text-[11px] font-semibold text-gray-500 text-center">Brands</span>
                          <span className="text-[11px] font-semibold text-gray-500 text-center">Mentioned?</span>
                          <span className="text-[11px] font-semibold text-gray-500 text-center">Type</span>
                          <span />
                        </div>

                        {filtered.map((p) => {
                          const pr = results.filter((r) => r.promptId === p.id);
                          const mc = pr.filter((r) => r.brandMentioned).length;
                          const vis = pr.length ? Math.round(mc / pr.length * 100) : 0;
                          const rks = pr.filter((r) => r.brandMentioned && r.brandRank).map((r) => r.brandRank!);
                          const ap = rks.length ? rks.reduce((s, r) => s + r, 0) / rks.length : null;
                          const mentioned = mc > 0;
                          const cmpMap: Record<string, number> = {};
                          pr.forEach((r) => r.competitorMentions.forEach((c) => { cmpMap[c.name] = (cmpMap[c.name] ?? 0) + 1; }));
                          const topCmps = Object.entries(cmpMap).sort((a,b) => b[1]-a[1]).slice(0,3).map(([n]) => n);
                          const pType = p.category || "";
                          const typeDot = pType.toLowerCase().includes("brand") ? "bg-purple-500" : pType.toLowerCase().includes("competitor") ? "bg-amber-400" : "bg-blue-400";
                          const volBars = Math.min(4, Math.max(1, Math.ceil(vis / 25)));
                          const volColor = vis >= 75 ? "bg-green-500" : vis >= 50 ? "bg-amber-400" : vis >= 25 ? "bg-orange-400" : "bg-red-400";

                          return (
                            <div
                              key={p.id}
                              className="group grid grid-cols-[1fr_80px_60px_100px_70px_40px_32px] gap-x-4 px-5 py-4 border-b border-stone-100 last:border-0 hover:bg-stone-50/70 transition-colors items-center"
                            >
                              {/* Prompt with visibility ring — clickable */}
                              <button onClick={() => { setSelectedPromptId(p.id); setSelectedCitationDomain(null); }} className="flex items-center gap-3 min-w-0 text-left">
                                <div className="relative w-11 h-11 shrink-0">
                                  <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90">
                                    <circle cx="22" cy="22" r="18" fill="none" stroke="#e5e7eb" strokeWidth="3"/>
                                    <circle cx="22" cy="22" r="18" fill="none" stroke={vis >= 80 ? "#22c55e" : vis >= 50 ? "#f59e0b" : "#ef4444"} strokeWidth="3" strokeDasharray={`${vis * 1.131} 113.1`} strokeLinecap="round"/>
                                  </svg>
                                  <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-700">{vis}%</span>
                                </div>
                                <span className="text-sm text-gray-800 font-medium leading-snug line-clamp-2">{p.text}</span>
                              </button>
                              {/* Position */}
                              <div className="text-center">
                                <span className={`text-sm font-bold ${ap && ap <= 2 ? "text-green-600" : ap && ap <= 4 ? "text-amber-500" : "text-gray-500"}`}>
                                  {ap ? `#${ap.toFixed(1)}` : "—"}
                                </span>
                              </div>
                              {/* Volume bars */}
                              <div className="flex items-end justify-center gap-0.5">
                                {[1,2,3,4].map((b) => (
                                  <div key={b} className={`w-1.5 rounded-sm ${b <= volBars ? volColor : "bg-stone-200"}`} style={{ height: `${6 + b * 4}px` }} />
                                ))}
                              </div>
                              {/* Brand favicons */}
                              <div className="flex items-center justify-center">
                                <div className="flex -space-x-1.5">
                                  {topCmps.slice(0,3).map((name) => {
                                    const d = name.includes(".") ? name : name.toLowerCase() + ".com";
                                    return (
                                      // eslint-disable-next-line @next/next/no-img-element
                                      <img key={name} src={`https://www.google.com/s2/favicons?domain=${d}&sz=32`} alt={name} width={20} height={20} className="rounded-full border-2 border-white shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                    );
                                  })}
                                  {topCmps.length > 3 && <div className="w-5 h-5 rounded-full border-2 border-white bg-stone-200 flex items-center justify-center text-[8px] font-bold text-gray-500">+{topCmps.length - 3}</div>}
                                </div>
                              </div>
                              {/* Mentioned */}
                              <div className="text-center">
                                {mentioned
                                  ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/></svg>Yes</span>
                                  : <span className="text-xs font-semibold text-red-400">No</span>
                                }
                              </div>
                              {/* Type dot */}
                              <div className="flex justify-center">
                                <div className={`w-2.5 h-2.5 rounded-full ${typeDot}`} />
                              </div>
                              {/* Delete */}
                              <div className="flex justify-center">
                                <button
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    if (deletingPromptId === p.id) return;
                                    setDeletingPromptId(p.id);
                                    try {
                                      await fetch(`/api/prompts/${p.id}`, { method: "DELETE" });
                                      setBrand((b) => b ? { ...b, trackedPrompts: b.trackedPrompts.filter((x) => x.id !== p.id) } : b);
                                    } finally {
                                      setDeletingPromptId(null);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400"
                                  title="Delete prompt"
                                >
                                  {deletingPromptId === p.id
                                    ? <span className="w-3.5 h-3.5 border border-red-400 border-t-transparent rounded-full animate-spin block" />
                                    : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                  }
                                </button>
                              </div>
                            </div>
                          );
                        })}

                        {filtered.length === 0 && (
                          <p className="text-sm text-gray-400 text-center py-10">No prompts match your search</p>
                        )}
                      </div>

                      {/* Add prompt */}
                      <div className="mt-3 flex gap-2">
                        <input
                          value={newPromptText}
                          onChange={(e) => setNewPromptText(e.target.value)}
                          onKeyDown={async (e) => {
                            if (e.key === "Enter" && newPromptText.trim() && !addingPrompt) {
                              e.preventDefault();
                              setAddingPrompt(true);
                              try {
                                const res = await fetch("/api/prompts", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ brandId: brand.id, text: newPromptText.trim(), category: "Commercial" }),
                                });
                                const data = await res.json();
                                if (data.prompt) {
                                  setBrand((b) => b ? { ...b, trackedPrompts: [...b.trackedPrompts, data.prompt] } : b);
                                  setNewPromptText("");
                                }
                              } finally {
                                setAddingPrompt(false);
                              }
                            }
                          }}
                          placeholder="Add a new prompt…"
                          className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-stone-300"
                        />
                        <button
                          disabled={!newPromptText.trim() || addingPrompt}
                          onClick={async () => {
                            if (!newPromptText.trim() || addingPrompt) return;
                            setAddingPrompt(true);
                            try {
                              const res = await fetch("/api/prompts", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ brandId: brand.id, text: newPromptText.trim(), category: "Commercial" }),
                              });
                              const data = await res.json();
                              if (data.prompt) {
                                setBrand((b) => b ? { ...b, trackedPrompts: [...b.trackedPrompts, data.prompt] } : b);
                                setNewPromptText("");
                              }
                            } finally {
                              setAddingPrompt(false);
                            }
                          }}
                          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          {addingPrompt ? <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>}
                          Add
                        </button>
                      </div>
                    </>
                  );
                })()
              )}
            </>
          )}

          {/* CITATIONS */}
          {activeTab === "citations" && (
            <>
              {/* 3-step onboarding dialog */}
              {showCitationOnboarding && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                  <div className="bg-[#faf7f2] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
                    {/* Header bar */}
                    <div className="flex items-center justify-between px-8 pt-7 pb-0">
                      <h2 className="text-lg font-bold text-gray-900">Get Cited in AI Responses — In 3 Steps</h2>
                      <div className="flex gap-1.5">
                        {[0,1,2].map((i) => (
                          <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === citationOnboardingStep ? "bg-[#c8372d]" : "bg-gray-300"}`} />
                        ))}
                      </div>
                    </div>

                    {/* Step content */}
                    <div className="flex gap-8 px-8 py-8 min-h-[380px] items-center">
                      {/* Left: text */}
                      <div className="flex-1 min-w-0">
                        {citationOnboardingStep === 0 && (
                          <>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">AI Scans the <span className="text-[#c8372d]">Web</span></h3>
                            <p className="text-gray-600 mb-3">AI answers pull from public discussions and citation sources.</p>
                            <p className="text-gray-600 mb-3">If your brand isn't mentioned there, you don't appear.</p>
                            <p className="font-semibold text-gray-800">Check the citation sources &amp; engage.</p>
                          </>
                        )}
                        {citationOnboardingStep === 1 && (
                          <>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">Engage on <span className="text-[#c8372d]">Citation Sources</span></h3>
                            <p className="text-gray-600 mb-3">Post valuable comments on Reddit and other cited sources using your connected account.</p>
                            <p className="font-semibold text-gray-800">This is how your brand enters AI responses.</p>
                          </>
                        )}
                        {citationOnboardingStep === 2 && (
                          <>
                            <h3 className="text-2xl font-bold text-gray-900 mb-4">Get Cited in <span className="text-[#c8372d]">AI Responses</span></h3>
                            <p className="text-gray-600 mb-3">Your engaged content gets ranked, surfaced, and cited — bringing your brand directly into AI responses.</p>
                            <p className="font-semibold text-gray-800">Visibility that compounds.</p>
                          </>
                        )}
                      </div>

                      {/* Right: illustration card */}
                      <div className="w-80 shrink-0">
                        {citationOnboardingStep === 0 && (
                          <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">AI response</p>
                            <div className="bg-[#f5f0e8] rounded-xl px-4 py-3 mb-3">
                              <p className="text-sm font-semibold text-gray-800">No brand presence</p>
                            </div>
                            <div className="flex items-center gap-2 mb-4">
                              <span className="text-[10px] text-gray-500">Citations</span>
                              <div className="flex gap-1">
                                <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[10px] font-bold text-orange-700">C</div>
                                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-[10px] font-bold text-green-700">W</div>
                                <div className="w-6 h-6 rounded-full bg-[#FF4500] flex items-center justify-center">
                                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                                </div>
                              </div>
                            </div>
                            <div className="bg-[#fff5f2] border border-orange-100 rounded-lg px-3 py-2 flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-[#FF4500] flex items-center justify-center shrink-0">
                                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                              </div>
                              <span className="text-xs text-gray-500 flex-1">reddit.com/r/…</span>
                              <span className="text-xs font-medium text-[#c8372d] flex items-center gap-0.5">⚡ Engage</span>
                            </div>
                          </div>
                        )}

                        {citationOnboardingStep === 1 && (
                          <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
                            <div className="bg-[#f5f0e8] rounded-xl p-3 mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-full bg-[#FF4500] flex items-center justify-center">
                                  <svg viewBox="0 0 20 20" className="w-4 h-4 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold text-gray-800">r/subreddit · 3 days ago</p>
                                  <p className="text-[10px] text-gray-500">Kaytosmith</p>
                                </div>
                              </div>
                              <p className="text-sm font-semibold text-gray-800">Looking for alternatives to…</p>
                              <div className="h-1.5 bg-gray-200 rounded mt-1.5 mb-0.5 w-full" />
                              <div className="h-1.5 bg-gray-200 rounded w-3/4" />
                            </div>
                            <div className="border border-[#c8372d]/30 rounded-xl p-3 mb-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <div className="w-5 h-5 rounded-full bg-blue-400" />
                                <span className="text-[11px] font-medium text-gray-700">Your account · <span className="text-[#c8372d]">Post Immediately</span></span>
                              </div>
                              <div className="bg-stone-50 rounded-lg px-2.5 py-2 text-xs text-gray-700 border border-stone-200 mb-2">
                                <span className="text-[#c8372d] font-medium">[{brand.name}]</span> is a good alternative that I&apos;ve been using
                              </div>
                              <button className="w-full text-xs font-semibold bg-[#c8372d] text-white rounded-lg py-1.5">Submit Comment</button>
                            </div>
                          </div>
                        )}

                        {citationOnboardingStep === 2 && (
                          <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
                            <div className="bg-[#f5f0e8] rounded-xl p-3 mb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-6 h-6 rounded-full bg-blue-400" />
                                <span className="text-[11px] font-medium text-gray-700">Username · 8mo ago</span>
                              </div>
                              <p className="text-xs text-gray-700 mb-2"><span className="text-[#c8372d] font-medium">[{brand.name}]</span> is a good alternative that I&apos;ve been using</p>
                              <div className="flex gap-2">
                                <span className="text-[10px] font-semibold bg-blue-500 text-white px-2 py-0.5 rounded-full">↑ 100 Upvotes</span>
                                <span className="text-[10px] font-semibold bg-[#c8372d] text-white px-2 py-0.5 rounded-full">2.3k Views</span>
                              </div>
                              <span className="text-[10px] font-semibold text-gray-600 mt-1 block">■ Ranked</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-px h-8 bg-gray-300 mx-auto" />
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 rounded-full bg-[#FF4500] flex items-center justify-center">
                                <svg viewBox="0 0 20 20" className="w-4 h-4 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                              </div>
                              <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">10x AI Visibility</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-6 h-6 rounded-full bg-orange-100 flex items-center justify-center text-[9px] font-bold text-orange-600">C</div>
                              <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-[9px] font-bold text-green-600">G</div>
                              <div className="flex-1 ml-2 bg-[#f5f0e8] rounded-lg px-3 py-1.5">
                                <p className="text-xs font-semibold text-[#b5820a]">[{brand.name}]</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-8 pb-7 border-t border-stone-200 pt-5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dontShowCitationsOnboarding}
                          onChange={(e) => setDontShowCitationsOnboarding(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-stone-300"
                        />
                        <span className="text-xs text-gray-500">Don&apos;t show it again</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setCitationOnboardingStep((s) => Math.max(0, s - 1))}
                          disabled={citationOnboardingStep === 0}
                          className="text-sm text-gray-400 disabled:opacity-30 hover:text-gray-600 transition-colors"
                        >
                          Previous
                        </button>
                        <button
                          onClick={() => {
                            if (citationOnboardingStep < 2) {
                              setCitationOnboardingStep((s) => s + 1);
                            } else {
                              if (dontShowCitationsOnboarding) localStorage.setItem("citationsOnboardingSeen", "true");
                              setShowCitationOnboarding(false);
                            }
                          }}
                          className="text-sm font-semibold bg-[#c8372d] text-white px-5 py-2 rounded-lg hover:bg-[#b02e25] transition-colors"
                        >
                          {citationOnboardingStep === 2 ? "Get Started" : "Next"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
              ) : !scanned ? (
                <EmptyState label="No citation data" sub="Monitoring starts automatically — check back after your first daily scan" />
              ) : citationDomains.length === 0 ? (
                <EmptyState label="No citations detected" sub="Citations appear when AI engines reference sources in their responses" />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-0.5">Citations</h2>
                  <p className="text-sm text-gray-400 mb-5">Discover the sources AI uses in its responses</p>

                  {/* Engagement Platforms */}
                  <div className="mb-6">
                    <div className="flex items-center gap-1.5 mb-3">
                      <p className="text-sm font-semibold text-gray-800">Engagement Platforms</p>
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/></svg>
                    </div>
                    <p className="text-xs text-gray-400 mb-3">Engage on these platforms to increase your AI visibility</p>
                    <div className="grid grid-cols-4 gap-3">
                      {/* Reddit — live */}
                      <div className="bg-white border-2 border-orange-200 rounded-xl p-4 flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-[#FF4500] flex items-center justify-center shrink-0 shadow-sm">
                            <svg viewBox="0 0 20 20" className="w-5 h-5 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-gray-900">Reddit</span>
                          </div>
                          <span className="ml-auto text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100 whitespace-nowrap">High impact</span>
                        </div>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex-1">
                            <p className="text-[11px] text-gray-500 leading-tight">Instant visibility</p>
                            <p className="text-[11px] text-gray-500 leading-tight">increase</p>
                          </div>
                          <div className="relative w-12 h-12 shrink-0">
                            <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
                              <circle cx="22" cy="22" r="17" fill="none" stroke="#e5e7eb" strokeWidth="3.5"/>
                              <circle cx="22" cy="22" r="17" fill="none" stroke="#14b8a6" strokeWidth="3.5" strokeDasharray={`${75 * 1.068} 106.8`} strokeLinecap="round"/>
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-teal-700">75%</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mb-3">
                          <p className="text-[10px] text-gray-400 mr-0.5">Active & persona based accounts</p>
                          <div className="flex -space-x-1.5">
                            {["#3b82f6","#8b5cf6","#ec4899"].map((c, i) => (
                              <div key={i} className="w-5 h-5 rounded-full border-2 border-white flex items-center justify-center" style={{backgroundColor: c}}>
                                <svg viewBox="0 0 20 20" fill="white" className="w-2.5 h-2.5"><path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"/></svg>
                              </div>
                            ))}
                            <div className="w-5 h-5 rounded-full border-2 border-white bg-orange-400 flex items-center justify-center">
                              <span className="text-[7px] font-bold text-white">+</span>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const redditEntry = citationDomains.find(([d]) => d.includes("reddit.com"));
                            if (redditEntry) {
                              const instances = citationInstances[redditEntry[0]];
                              if (instances?.[0]) {
                                setEngageItem({ url: instances[0].url, promptText: instances[0].promptText, engine: instances[0].engine });
                                setEngageDraft("");
                              }
                            }
                          }}
                          className="mt-auto w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-[#FF4500] text-white rounded-xl py-2.5 hover:bg-[#e03d00] transition-colors shadow-sm"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          Engage
                        </button>
                      </div>

                      {/* Coming soon platforms */}
                      {[
                        { name: "Quora", color: "#b92b27", letter: "Q" },
                        { name: "Facebook", color: "#1877f2", letter: "f" },
                        { name: "YouTube", color: "#ff0000", letter: "▶" },
                      ].map((p) => (
                        <div key={p.name} className="relative bg-white border border-stone-200 rounded-xl p-4 flex flex-col overflow-hidden">
                          {/* Ghost content behind blur */}
                          <div className="flex items-center gap-2 mb-3">
                            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white text-base font-bold shadow-sm" style={{ backgroundColor: p.color }}>{p.letter}</div>
                            <span className="text-sm font-semibold text-gray-900">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-3 mb-3">
                            <div className="flex-1 space-y-1">
                              <div className="h-2 bg-stone-100 rounded w-3/4" />
                              <div className="h-2 bg-stone-100 rounded w-1/2" />
                            </div>
                            <div className="relative w-12 h-12 shrink-0">
                              <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
                                <circle cx="22" cy="22" r="17" fill="none" stroke="#e5e7eb" strokeWidth="3.5"/>
                                <circle cx="22" cy="22" r="17" fill="none" stroke="#d1d5db" strokeWidth="3.5" strokeDasharray={`${60 * 1.068} 106.8`} strokeLinecap="round"/>
                              </svg>
                              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-400">—</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mb-3">
                            <div className="h-2 bg-stone-100 rounded w-2/3" />
                          </div>
                          <div className="mt-auto h-10 bg-stone-100 rounded-xl" />
                          {/* Coming soon overlay */}
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl backdrop-blur-[2px] bg-white/50">
                            <span className="text-xs font-semibold border border-stone-300 bg-white text-gray-600 px-4 py-1.5 rounded-full shadow-sm">Coming soon</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Line chart + Top Cited Domains side by side */}
                  {(() => {
                    const chartColors = ["#ef4444","#f97316","#eab308","#6b7280","#a78bfa","#3b82f6","#10b981","#ec4899","#06b6d4","#8b5cf6"];
                    const allDates = citationHistory[0]?.data.map((d) => d.date) ?? [];
                    const maxCount = Math.max(...citationHistory.flatMap((s) => s.data.map((d) => d.count)), 1);
                    const W = 520, H = 200, padL = 32, padR = 12, padT = 12, padB = 32;
                    const xStep = allDates.length > 1 ? (W - padL - padR) / (allDates.length - 1) : W - padL - padR;
                    const toX = (i: number) => padL + (allDates.length > 1 ? i * xStep : (W - padL - padR) / 2);
                    const toY = (v: number) => padT + (H - padT - padB) * (1 - v / maxCount);
                    // Smooth bezier path between points
                    const toBezierPath = (pts: {x:number;y:number}[]) => {
                      if (pts.length < 2) return "";
                      let d = `M ${pts[0].x} ${pts[0].y}`;
                      for (let i = 1; i < pts.length; i++) {
                        const cp1x = pts[i-1].x + (pts[i].x - pts[i-1].x) * 0.4;
                        const cp1y = pts[i-1].y;
                        const cp2x = pts[i].x - (pts[i].x - pts[i-1].x) * 0.4;
                        const cp2y = pts[i].y;
                        d += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${pts[i].x} ${pts[i].y}`;
                      }
                      return d;
                    };
                    // Y-axis tick values
                    const yTicks = [0, Math.round(maxCount * 0.25), Math.round(maxCount * 0.5), Math.round(maxCount * 0.75), maxCount];
                    const hoverData = citationChartHover !== null
                      ? citationHistory.map((s) => ({ domain: s.domain, count: s.data[citationChartHover!.idx]?.count ?? 0 })).sort((a,b) => b.count - a.count)
                      : null;

                    return (
                      <div className="grid grid-cols-[1fr_300px] gap-4 mb-5">
                        {/* Line / Bar chart */}
                        <div className="bg-white border border-stone-200 rounded-xl p-5">
                          <div className="flex items-start justify-between mb-1">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">Top Citations <span className="text-gray-400 font-normal text-xs ml-1">ⓘ</span></p>
                              <p className="text-xs text-gray-400">Daily citation count for top 10 domains</p>
                            </div>
                            <div className="flex items-center gap-1 border border-stone-200 rounded-lg p-0.5">
                              <button onClick={() => setCitationChartMode("bar")} className={`p-1.5 rounded-md transition-colors ${citationChartMode === "bar" ? "bg-stone-100 text-gray-700" : "text-gray-400 hover:text-gray-600"}`} title="Bar chart">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="8" width="3" height="7"/><rect x="6" y="4" width="3" height="11"/><rect x="11" y="1" width="3" height="14"/></svg>
                              </button>
                              <button onClick={() => setCitationChartMode("line")} className={`p-1.5 rounded-md transition-colors ${citationChartMode === "line" ? "bg-stone-100 text-gray-700" : "text-gray-400 hover:text-gray-600"}`} title="Line chart">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><polyline points="1,12 5,7 9,9 13,3"/></svg>
                              </button>
                            </div>
                          </div>
                          {citationHistory.length === 0 ? (
                            <div className="flex items-center justify-center h-36 text-xs text-gray-400 mt-3">Chart data loads after first few daily scans</div>
                          ) : (
                            <div className="relative mt-3">
                              <svg
                                viewBox={`0 0 ${W} ${H}`}
                                className="w-full"
                                style={{ height: H }}
                                onMouseLeave={() => setCitationChartHover(null)}
                                onMouseMove={(e) => {
                                  if (allDates.length < 2) return;
                                  const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
                                  const relX = (e.clientX - rect.left) / rect.width * W;
                                  let closest = 0, minDist = Infinity;
                                  allDates.forEach((_, i) => { const d = Math.abs(relX - toX(i)); if (d < minDist) { minDist = d; closest = i; } });
                                  setCitationChartHover({ idx: closest, x: toX(closest), y: e.clientY - rect.top });
                                }}
                              >
                                {/* Y gridlines + labels */}
                                {yTicks.map((v) => (
                                  <g key={v}>
                                    <line x1={padL} x2={W - padR} y1={toY(v)} y2={toY(v)} stroke="#f3f4f6" strokeWidth="1"/>
                                    <text x={padL - 4} y={toY(v) + 3} textAnchor="end" fontSize="8" fill="#9ca3af">{v}</text>
                                  </g>
                                ))}

                                {citationChartMode === "line" ? (
                                  citationHistory.map((series, si) => {
                                    const col = chartColors[si % chartColors.length];
                                    if (allDates.length === 1) {
                                      const x = toX(0), y = toY(series.data[0]?.count ?? 0);
                                      return <circle key={si} cx={x} cy={y} r="4" fill={col} />;
                                    }
                                    const pts = series.data.map((d, i) => ({ x: toX(i), y: toY(d.count) }));
                                    return (
                                      <g key={si}>
                                        <path d={toBezierPath(pts)} fill="none" stroke={col} strokeWidth="2" strokeLinecap="round"/>
                                        {citationChartHover && (
                                          <circle cx={toX(citationChartHover.idx)} cy={toY(series.data[citationChartHover.idx]?.count ?? 0)} r="3.5" fill={col} stroke="white" strokeWidth="1.5"/>
                                        )}
                                      </g>
                                    );
                                  })
                                ) : (
                                  allDates.map((_, di) => {
                                    const barW = xStep * 0.6 / (citationHistory.length || 1);
                                    const groupStart = toX(di) - xStep * 0.3;
                                    return citationHistory.map((series, si) => {
                                      const col = chartColors[si % chartColors.length];
                                      const v = series.data[di]?.count ?? 0;
                                      const bx = groupStart + si * barW;
                                      const by = toY(v);
                                      return <rect key={`${di}-${si}`} x={bx} y={by} width={barW - 1} height={H - padB - by} fill={col} rx="1" opacity="0.85"/>;
                                    });
                                  })
                                )}

                                {/* Hover vertical line */}
                                {citationChartHover && allDates.length > 1 && (
                                  <line x1={toX(citationChartHover.idx)} x2={toX(citationChartHover.idx)} y1={padT} y2={H - padB} stroke="#d1d5db" strokeWidth="1" strokeDasharray="3 2"/>
                                )}

                                {/* X labels */}
                                {allDates.map((d, i) => (
                                  <text key={i} x={toX(i)} y={H - 6} textAnchor="middle" fontSize="8" fill={citationChartHover?.idx === i ? "#374151" : "#9ca3af"} fontWeight={citationChartHover?.idx === i ? "600" : "400"}>
                                    {new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                                  </text>
                                ))}
                              </svg>

                              {/* Hover tooltip */}
                              {hoverData && citationChartHover && (
                                <div
                                  className="absolute z-10 bg-white border border-stone-200 rounded-xl shadow-lg p-3 pointer-events-none"
                                  style={{
                                    left: citationChartHover.x / W * 100 > 60 ? "auto" : `calc(${(citationChartHover.x / W) * 100}% + 8px)`,
                                    right: citationChartHover.x / W * 100 > 60 ? `calc(${100 - (citationChartHover.x / W) * 100}% + 8px)` : "auto",
                                    top: 0,
                                  }}
                                >
                                  <p className="text-xs font-semibold text-gray-700 mb-2">{new Date(allDates[citationChartHover.idx]).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>
                                  <div className="space-y-1.5 min-w-[160px]">
                                    {hoverData.filter(d => d.count > 0).map((d, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=16`} alt="" width={14} height={14} className="rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                        <span className="text-xs text-gray-600 flex-1 truncate">{d.domain}</span>
                                        <span className="text-xs font-semibold text-gray-900">{d.count}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {allDates.length === 1 && <p className="text-[10px] text-gray-400 mt-1">More data after your first week of daily scans</p>}
                        </div>

                        {/* Top Cited Domains card */}
                        <div className="bg-white border border-stone-200 rounded-xl p-5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-gray-900">Top Cited Domains <span className="text-gray-400 font-normal text-xs ml-1">ⓘ</span></p>
                          </div>
                          <p className="text-base font-bold text-gray-900 mb-4">{citationDomains.length} Domains</p>
                          <div className="space-y-1">
                            {citationDomains.slice(0, 7).map(([domain, info], i) => {
                              const pct = results.length ? Math.round((info.count / results.length) * 100) : 0;
                              return (
                                <div key={domain} className="flex items-center gap-3 py-2 border-b border-stone-50 last:border-0">
                                  <span className="text-xs text-gray-400 w-5 shrink-0 font-medium">#{i+1}</span>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={28} height={28} className="rounded-md shrink-0 border border-stone-100" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                  <span className="text-xs text-gray-700 truncate flex-1 font-medium">{domain}</span>
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-bold text-gray-900">{pct}%</p>
                                    <p className="text-[10px] text-gray-400">{info.count} citations</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Search + filter bar */}
                  {(() => {
                    const allTypes = ["All", ...Array.from(new Set(citationDomains.map(([,v]) => v.type)))];
                    const allPrompts = ["All", ...brand.trackedPrompts.map((p) => p.text)];
                    const filtered = citationDomains.filter(([domain, info]) => {
                      const matchSearch = !citationSearch || domain.toLowerCase().includes(citationSearch.toLowerCase());
                      const matchType = citationTypeFilter === "All" || info.type === citationTypeFilter;
                      const matchPrompt = citationPromptFilter === "All" || (citationInstances[domain] ?? []).some((x) => x.promptText === citationPromptFilter);
                      return matchSearch && matchType && matchPrompt;
                    });

                    // Sort: Reddit FEATURED first, then by count
                    const redditDomain = filtered.find(([d]) => d.includes("reddit.com"));
                    const rest = filtered.filter(([d]) => !d.includes("reddit.com"));
                    const orderedDomains = redditDomain ? [redditDomain, ...rest] : rest;

                    return (
                      <>
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex items-center gap-2 flex-1 bg-white border border-stone-200 rounded-lg px-3 py-2">
                            <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <input
                              value={citationSearch}
                              onChange={(e) => setCitationSearch(e.target.value)}
                              placeholder="Search citations"
                              className="text-sm flex-1 outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
                            />
                          </div>
                          <select
                            value={citationPromptFilter}
                            onChange={(e) => setCitationPromptFilter(e.target.value)}
                            className="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none"
                          >
                            {allPrompts.map((p) => <option key={p} value={p}>{p === "All" ? "All prompts" : p.length > 30 ? p.slice(0,30)+"…" : p}</option>)}
                          </select>
                          <select
                            value={citationTypeFilter}
                            onChange={(e) => setCitationTypeFilter(e.target.value)}
                            className="text-xs border border-stone-200 rounded-lg px-3 py-2 bg-white text-gray-700 outline-none"
                          >
                            {allTypes.map((t) => <option key={t} value={t}>{t === "All" ? "All domain types" : t}</option>)}
                          </select>
                        </div>

                        {/* Domain table */}
                        <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                          {/* Table header */}
                          <div className="grid grid-cols-[64px_1fr_80px_120px] gap-x-4 px-5 py-3 border-b border-stone-100 bg-stone-50/60">
                            <span className="text-[11px] font-semibold text-gray-500">Rank</span>
                            <span className="text-[11px] font-semibold text-gray-500">Domain</span>
                            <span className="text-[11px] font-semibold text-gray-500 text-right flex items-center justify-end gap-0.5">Citations <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M5 10l3 3 3-3"/></svg></span>
                            <span className="text-[11px] font-semibold text-gray-500 text-right">Details</span>
                          </div>

                          {orderedDomains.length === 0 && (
                            <p className="px-5 py-8 text-sm text-gray-400 text-center">No citations match your filters</p>
                          )}

                          {orderedDomains.map(([domain, info], displayIdx) => {
                            const isReddit = domain.includes("reddit.com");
                            const isExpanded = expandedCitationDomains.has(domain);
                            const instances = citationInstances[domain] ?? [];
                            const originalRank = citationDomains.findIndex(([d]) => d === domain) + 1;

                            return (
                              <div
                                key={domain}
                                className={`border-b border-stone-100 last:border-0 ${isReddit ? "border-l-[3px] border-l-blue-400" : ""}`}
                              >
                                {/* Domain row */}
                                <button
                                  onClick={() => setExpandedCitationDomains((prev) => {
                                    const next = new Set(prev);
                                    next.has(domain) ? next.delete(domain) : next.add(domain);
                                    return next;
                                  })}
                                  className={`w-full grid grid-cols-[64px_1fr_80px_120px] gap-x-4 px-5 py-4 hover:bg-stone-50/70 transition-colors text-left items-center ${isReddit ? "bg-blue-50/20" : ""}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs text-gray-500 font-medium shrink-0">#{originalRank}</span>
                                    {isReddit && <span className="text-[9px] font-bold bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 whitespace-nowrap">🔔 FEATURED</span>}
                                  </div>
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={20} height={20} className="rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                    <span className="text-sm text-gray-800 font-medium truncate">{domain}</span>
                                  </div>
                                  <span className="text-sm font-semibold text-gray-900 text-right">{info.count}</span>
                                  <div className="flex items-center justify-end gap-2">
                                    {isReddit ? (
                                      <span className="text-xs text-[#c8372d] font-medium">Engagement opportunities</span>
                                    ) : (
                                      <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-[#c8372d] hover:underline">Learn more ↗</a>
                                    )}
                                    <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                                  </div>
                                </button>

                                {/* Expanded URL rows */}
                                {isExpanded && (
                                  <div className="bg-stone-50/60 border-t border-stone-100">
                                    {instances.length === 0 ? (
                                      <p className="px-6 py-3 text-xs text-gray-400">No individual URLs available</p>
                                    ) : (
                                      instances.map((item, i) => {
                                        const itemIsReddit = item.url.includes("reddit.com");
                                        const urlDisplay = item.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "");
                                        const promptSnippet = item.promptText.length > 45 ? item.promptText.slice(0, 45) + "…" : item.promptText;
                                        return (
                                          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-6 py-2.5 border-b border-stone-100/60 last:border-0 items-center">
                                            <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-600 hover:underline truncate" title={item.url}>{urlDisplay}</a>
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${SOURCE_TYPE_COLORS[getSourceType(domain)] ?? "bg-gray-100 text-gray-600"}`}>{getSourceType(domain)}</span>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <span className={`w-1.5 h-1.5 rounded-full ${ENGINE_COLORS[item.engine as AIEngine] ?? "bg-gray-300"}`} />
                                              <span className="text-xs text-gray-500">{ENGINE_LABELS[item.engine as AIEngine] ?? item.engine}</span>
                                            </div>
                                            <span className="text-xs text-gray-400 shrink-0 max-w-[140px] truncate hidden lg:block" title={item.promptText}>{promptSnippet}</span>
                                            {itemIsReddit ? (
                                              <button onClick={() => { setEngageItem({ url: item.url, promptText: item.promptText, engine: item.engine }); setEngageDraft(""); }} className="shrink-0 text-xs font-medium px-3 py-1 rounded-lg bg-[#FF4500] text-white hover:bg-[#e03d00] transition-colors">Engage</button>
                                            ) : (
                                              <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-xs font-medium px-3 py-1 rounded-lg border border-stone-200 text-gray-500 hover:bg-stone-100 transition-colors">View →</a>
                                            )}
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </>
              )}
            </>
          )}

          {/* COMPETITORS */}
          {activeTab === "competitors" && (
            <>
              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
              ) : !scanned ? (
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
                      <div key={name} className={`flex items-center gap-3 mb-3 ${isBrand ? "pt-3 border-t border-gray-100 mt-1" : ""}`}>
                        <span className={`text-sm w-40 truncate ${isBrand ? "font-semibold text-gray-900" : "text-gray-600"}`}>{name}</span>
                        <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${isBrand ? "bg-red-500" : "bg-gray-300"}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className={`text-sm font-medium w-10 text-right ${isBrand ? "text-red-600" : "text-gray-500"}`}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* RESEARCH */}
          {activeTab === "gaps" && (
            <>
              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
              ) : !scanned ? (
                <EmptyState label="No research data" sub="Run a scan to discover gaps where competitors appear but you don't" />
              ) : gaps.length === 0 ? (
                <div className="bg-white border border-stone-200 rounded-xl p-8 text-center">
                  <p className="text-sm text-gray-500">No gaps — your brand appeared in all scanned prompts.</p>
                </div>
              ) : (
                <>
                  <div className="mb-5">
                    <h2 className="text-xl font-bold text-gray-900">Research</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{gaps.length} queries where {brand.name} isn&apos;t mentioned</p>
                  </div>
                  <div className="space-y-3">
                    {gaps.map((gap, i) => (
                      <div key={i} className="bg-white border border-stone-200 rounded-xl p-4">
                        <p className="text-sm font-medium text-gray-800 mb-2">{gap.promptText}</p>
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {gap.engines.map((e) => (
                            <span key={e} className="text-xs bg-red-50 text-red-500 px-2 py-0.5 rounded-full">Not in {ENGINE_LABELS[e as AIEngine]}</span>
                          ))}
                          {gap.topCompetitor && (
                            <span className="text-xs text-gray-400">· <span className="font-medium text-gray-600">{gap.topCompetitor}</span> appears instead</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-gray-400 flex-1">Publishing an article that answers this query will teach AI engines to recommend {brand.name} for it.</p>
                          {(() => {
                            const existing = savedArticles.find((a) => a.keyword?.toLowerCase() === gap.promptText.toLowerCase());
                            const params = new URLSearchParams({ gapPrompt: gap.promptText, brand: brand.name, niche: brand.niche, brandId: brand.id ?? "", engines: encodeURIComponent(JSON.stringify(gap.engines)), ...(gap.topCompetitor ? { competitor: gap.topCompetitor } : {}) });
                            if (existing) {
                              const cacheKey = `article:${existing.keyword || existing.title}:${brand.name}`;
                              return (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[existing.status] ?? "bg-gray-100 text-gray-600"}`}>{existing.status}</span>
                                  <button
                                    onClick={() => {
                                      if (existing.content) sessionStorage.setItem(cacheKey, JSON.stringify({ article: existing.content, title: existing.title, wordCount: existing.wordCount }));
                                      window.open(`/article?${params}`, "_blank");
                                    }}
                                    className="text-xs font-medium border border-gray-200 text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
                                  >
                                    View article ↗
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                onClick={() => window.open(`/article?${params}`, "_blank")}
                                className="shrink-0 text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                              >
                                Write article →
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* KEYWORDS */}
          {activeTab === "keywords" && (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Keywords</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Tracked prompts &amp; visibility opportunities for {brand.domain}</p>
                </div>
                <button
                  onClick={() => navTo("gaps")}
                  className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  + Add keyword
                </button>
              </div>

              {brand.trackedPrompts.length === 0 ? (
                <EmptyState label="No keywords tracked" sub="Add prompts during setup to track keyword visibility" />
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-5">
                    <StatCard label="Keywords" value={brand.trackedPrompts.length} sub="tracked prompts" />
                    <StatCard label="With gaps" value={gaps.length} sub="need articles" />
                    <StatCard label="Avg visibility" value={overallScore !== null ? `${overallScore}%` : "—"} sub="across engines" />
                    <StatCard label="Engines" value={selectedEngines.length} sub="being tracked" />
                  </div>

                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-3">
                      <input
                        value={keywordSearch}
                        onChange={(e) => setKeywordSearch(e.target.value)}
                        placeholder="Search keywords…"
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
                      />
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-stone-100">
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Prompt / Keyword</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Visibility</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Competing with</th>
                          <th className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {keywordRows.map((row) => (
                          <tr key={row.promptId} className="hover:bg-stone-50/50">
                            <td className="px-5 py-3 text-sm text-gray-800 max-w-xs">
                              <span className="line-clamp-1">{row.text}</span>
                            </td>
                            <td className="px-5 py-3">
                              {row.vis !== null ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-red-400 rounded-full" style={{ width: `${row.vis}%` }} />
                                  </div>
                                  <span className="text-xs font-medium text-gray-700">{row.vis}%</span>
                                </div>
                              ) : <span className="text-xs text-gray-400">No scan yet</span>}
                            </td>
                            <td className="px-5 py-3">
                              {row.hasGap ? (
                                <span className="text-xs font-medium bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Gap</span>
                              ) : row.vis !== null ? (
                                <span className="text-xs font-medium bg-green-50 text-green-700 px-2 py-0.5 rounded-full">Covered</span>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500">{row.topCompetitor ?? "—"}</td>
                            <td className="px-5 py-3 text-right">
                              {row.hasGap && (
                                <button
                                  onClick={() => {
                                    const params = new URLSearchParams({ gapPrompt: row.text, brand: brand.name, niche: brand.niche, brandId: brand.id ?? "", engines: encodeURIComponent(JSON.stringify(gaps.find(g => g.promptText === row.text)?.engines ?? [])) });
                                    window.open(`/article?${params}`, "_blank");
                                  }}
                                  className="text-xs font-medium text-gray-500 hover:text-gray-900 border border-gray-200 hover:border-gray-400 px-2.5 py-1 rounded-lg transition-colors"
                                >
                                  + Article
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {/* ARTICLES */}
          {activeTab === "articles" && (
            <div className="flex gap-5 h-full">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Articles</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{savedArticles.length} pieces{publishedCount > 0 ? ` · ${publishedCount} published` : ""}{draftCount > 0 ? ` · ${draftCount} in draft` : ""}</p>
                  </div>
                  <button onClick={() => navTo("gaps")} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors">From research</button>
                </div>

                {savedArticles.length > 0 && (
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <StatCard label="Published" value={publishedCount} sub="+0 this month" />
                    <StatCard label="In Draft" value={draftCount} sub={draftCount === 1 ? "1 ready for review" : ""} />
                    <StatCard label="Avg SEO Score" value={avgSeoScore ?? "—"} sub={`${savedArticles.filter(a => a.seoScore > 0).length} scored`} />
                    <StatCard label="Last Published" value={savedArticles.filter(a => a.status === "published").length > 0 ? "Recently" : "—"} />
                  </div>
                )}

                {savedArticles.length > 0 && (
                  <div className="flex gap-1 mb-3">
                    {(["all", "draft", "review", "scheduled", "published"] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => setArticleFilter(f)}
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors capitalize ${articleFilter === f ? "bg-red-600 text-white" : "bg-white border border-gray-200 text-gray-600 hover:border-gray-400"}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}

                {loadingArticles ? (
                  <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
                ) : filteredArticles.length === 0 ? (
                  <div className="bg-white border border-dashed border-stone-200 rounded-xl p-12 text-center">
                    <p className="text-sm font-medium text-gray-500 mb-1">No articles yet</p>
                    <p className="text-xs text-gray-400 mb-4">Articles you generate from research gaps appear here</p>
                    <button
                      onClick={() => navTo("gaps")}
                      className="text-xs font-medium bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      Go to Research →
                    </button>
                  </div>
                ) : (
                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-stone-100">
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Title</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">SEO</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {filteredArticles.map((a) => (
                          <tr key={a.id} className={`hover:bg-stone-50/50 cursor-pointer ${selectedArticle?.id === a.id ? "bg-stone-50" : ""}`} onClick={() => { setSelectedArticle(a); setShowSchedulePicker(false); }}>
                            <td className="px-5 py-3">
                              <p className="text-sm font-medium text-gray-800 line-clamp-1">{a.title}</p>
                              <p className="text-[10px] text-gray-400 mt-0.5 font-mono">{a.keyword}</p>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[a.status] ?? "bg-gray-100 text-gray-600"}`}>{a.status}</span>
                            </td>
                            <td className="px-5 py-3 text-sm font-medium text-gray-700">{a.seoScore > 0 ? a.seoScore : "—"}</td>
                            <td className="px-5 py-3 text-xs text-gray-400">{new Date(a.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {selectedArticle && (
                <div className="w-72 shrink-0 bg-white border border-stone-200 rounded-xl p-5 flex flex-col gap-4 self-start sticky top-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Article</p>
                    <button onClick={() => setSelectedArticle(null)} className="text-gray-300 hover:text-gray-500 text-lg leading-none">×</button>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-2">{selectedArticle.title}</h3>
                    <div className="flex gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[selectedArticle.status] ?? "bg-gray-100 text-gray-600"}`}>{selectedArticle.status}</span>
                      {selectedArticle.wordCount > 0 && <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{selectedArticle.wordCount} words</span>}
                      {selectedArticle.seoScore > 0 && <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded font-medium">SEO {selectedArticle.seoScore}</span>}
                    </div>
                  </div>

                  {selectedArticle.content && (
                    <div className="bg-stone-50 rounded-lg p-3">
                      <p className="text-xs text-gray-500 leading-relaxed line-clamp-5">{selectedArticle.content.replace(/^#+ .+\n+/m, "").replace(/[#*_`]/g, "").substring(0, 240)}…</p>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => {
                        const params = new URLSearchParams({ gapPrompt: selectedArticle.keyword || selectedArticle.title, brand: brand.name, niche: brand.niche, brandId: brand.id ?? "", articleId: selectedArticle.id });
                        const cacheKey = `article:${selectedArticle.keyword || selectedArticle.title}:${brand.name}`;
                        if (selectedArticle.content) sessionStorage.setItem(cacheKey, JSON.stringify({ article: selectedArticle.content, title: selectedArticle.title, wordCount: selectedArticle.wordCount }));
                        window.open(`/article?${params}`, "_blank");
                      }}
                      className="w-full text-xs font-medium bg-gray-900 text-white rounded-lg py-2.5 hover:bg-gray-700 transition-colors"
                    >
                      Open full article ↗
                    </button>

                    {publishingChannels.length > 0 && selectedArticle.status !== "published" && (
                      <button
                        onClick={() => { setPublishArticleId(selectedArticle.id); setPublishResult(null); setShowPublishModal(true); }}
                        className="w-full text-xs font-medium border border-gray-200 text-gray-700 rounded-lg py-2.5 hover:bg-gray-50 transition-colors"
                      >
                        ⚡ Publish now
                      </button>
                    )}

                    {selectedArticle.status !== "scheduled" && selectedArticle.status !== "published" && (
                      showSchedulePicker ? (
                        <div className="flex flex-col gap-2">
                          <input
                            type="datetime-local"
                            value={scheduleDate}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                            className="w-full border border-stone-200 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-red-400"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setShowSchedulePicker(false)} className="flex-1 text-xs border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors text-gray-500">Cancel</button>
                            <button
                              disabled={!scheduleDate}
                              onClick={() => scheduleArticle(selectedArticle.id, scheduleDate)}
                              className="flex-1 text-xs font-medium bg-gray-900 text-white rounded-lg py-2 hover:bg-gray-700 disabled:opacity-40 transition-colors"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setScheduleDate(""); setShowSchedulePicker(true); }}
                          className="w-full text-xs font-medium border border-gray-200 text-gray-700 rounded-lg py-2.5 hover:bg-gray-50 transition-colors"
                        >
                          📅 Schedule
                        </button>
                      )
                    )}

                    {selectedArticle.status !== "published" && !showSchedulePicker && (
                      <button
                        onClick={() => updateArticleStatus(selectedArticle.id, "published")}
                        className="w-full text-xs font-medium border border-emerald-200 text-emerald-700 rounded-lg py-2.5 hover:bg-emerald-50 transition-colors"
                      >
                        ✓ Mark as published
                      </button>
                    )}

                    {selectedArticle.status !== "draft" && selectedArticle.status !== "published" && !showSchedulePicker && (
                      <button
                        onClick={() => updateArticleStatus(selectedArticle.id, "draft")}
                        className="w-full text-xs border border-gray-100 rounded-lg py-2 hover:bg-gray-50 transition-colors text-gray-400"
                      >
                        Back to draft
                      </button>
                    )}

                    {!showSchedulePicker && (
                      <button
                        onClick={() => { if (confirm("Delete this article?")) deleteArticle(selectedArticle.id); }}
                        className="w-full text-xs text-red-400 hover:text-red-600 py-1 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SOCIAL */}
          {activeTab === "social" && (
            <div>
              <div className="flex items-start justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Social</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Monitor Reddit for keyword-relevant conversations</p>
                </div>
                {redditConnected ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      u/{redditUsername}
                    </div>
                    <button onClick={disconnectReddit} className="text-xs text-gray-400 hover:text-red-500 transition-colors">Disconnect</button>
                  </div>
                ) : (
                  <a
                    href={`/api/reddit/auth?brandId=${brand.id}`}
                    className="flex items-center gap-2 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M20 10c0-5.523-4.477-10-10-10S0 4.477 0 10c0 5.522 4.478 10 10 10 5.523 0 10-4.478 10-10zm-7.432 4.434a4.91 4.91 0 01-2.568.712 4.91 4.91 0 01-2.568-.712.312.312 0 01.345-.518c.596.394 1.374.618 2.223.618s1.627-.224 2.223-.618a.312.312 0 01.345.518zm.138-2.506a.937.937 0 110-1.874.937.937 0 010 1.874zm-5.412 0a.937.937 0 110-1.874.937.937 0 010 1.874zm8.354-1.962a1.25 1.25 0 00-2.12-.896 6.166 6.166 0 00-3.124-.846l.6-2.375 1.741.41a.937.937 0 101.017-1.08l-1.955-.46a.313.313 0 00-.37.218l-.683 2.712a6.172 6.172 0 00-3.094.843 1.25 1.25 0 10-1.388 2.016 2.47 2.47 0 000 .305c0 1.875 2.187 3.398 4.888 3.398s4.888-1.523 4.888-3.398c0-.104-.006-.206-.017-.305.383-.23.617-.644.617-1.112z"/></svg>
                    Connect Reddit
                  </a>
                )}
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Reddit keywords</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Keywords we watch for relevant conversations</p>
                  </div>
                  <button onClick={syncReddit} disabled={syncing || socialKeywords.length === 0} className="flex items-center gap-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors">
                    {syncing && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {syncing ? "Syncing…" : "Sync Reddit"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 mb-3">
                  {socialKeywords.map((k) => (
                    <span key={k.id} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1 rounded-full">
                      {k.keyword}
                      <button onClick={() => removeKeyword(k.id)} className="text-blue-400 hover:text-blue-700 ml-0.5">×</button>
                    </span>
                  ))}
                  {socialKeywords.length === 0 && <span className="text-xs text-gray-400">No keywords yet — add one below</span>}
                </div>
                <div className="flex gap-2">
                  <input value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addKeyword(); } }} placeholder="Add keyword (e.g. AI visibility tool)" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent" />
                  <button onClick={addKeyword} className="px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Add</button>
                </div>
              </div>

              {redditThreads.length === 0 ? (
                <div className="bg-white border border-dashed border-stone-200 rounded-xl p-10 text-center">
                  <p className="text-sm text-gray-500 mb-1">No threads found yet</p>
                  <p className="text-xs text-gray-400">Add keywords above and click &quot;Sync Reddit&quot; to find relevant conversations</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400 mb-2">{redditThreads.length} threads · {newThreadCount} new</p>
                  {redditThreads.map((thread) => (
                    <div key={thread.id} className="bg-white border border-stone-200 rounded-xl p-4 hover:border-blue-200 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-blue-600">r/{thread.subreddit}</span>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs bg-stone-100 text-stone-600 px-1.5 py-0.5 rounded">{thread.keyword}</span>
                            {thread.status === "new" && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                          </div>
                          <p className="text-sm font-medium text-gray-800 truncate mb-1">{thread.title}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            <span>↑ {thread.score}</span>
                            <span>{thread.numComments} comments</span>
                            {thread.redditCreatedAt && <span>{new Date(thread.redditCreatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <a href={thread.url} target="_blank" rel="noopener noreferrer" className="text-xs text-gray-400 hover:text-gray-600">View ↗</a>
                          <button onClick={() => draftReplyForThread(thread)} className="text-xs font-medium bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
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

          {/* AGENT */}
          {activeTab === "agent" && (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="px-6 pt-5 pb-2 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-red-600 text-lg">✳</span>
                  <span className="font-semibold text-gray-900">GROG</span>
                  <span className="text-xs text-gray-400">· live tracking data</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
                {agentMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <span className="text-red-600 mr-2 mt-0.5 shrink-0">✳</span>
                    )}
                    <div
                      className={`max-w-lg text-sm leading-relaxed rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-gray-900 text-white"
                          : "bg-transparent text-gray-800"
                      }`}
                    >
                      {msg.content.split("**").map((part, j) =>
                        j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
                      )}
                    </div>
                  </div>
                ))}
                {agentLoading && (
                  <div className="flex items-center gap-2">
                    <span className="text-red-600">✳</span>
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot" style={{ animationDelay: "200ms" }} />
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full typing-dot" style={{ animationDelay: "400ms" }} />
                    </div>
                  </div>
                )}
                <div ref={agentEndRef} />
              </div>

              <div className="px-6 pb-5 shrink-0">
                <div className="bg-white border border-stone-200 rounded-2xl shadow-sm">
                  <textarea
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); } }}
                    placeholder="Ask GROG about your AI visibility…"
                    rows={1}
                    className="w-full px-4 pt-3 pb-1 text-sm text-gray-800 placeholder-gray-400 resize-none outline-none rounded-t-2xl"
                  />
                  <div className="flex items-center justify-between px-4 pb-3">
                    <span className="text-xs text-gray-400">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full inline-block mr-1" />
                      GROG · reads your live data
                    </span>
                    <button
                      onClick={sendAgentMessage}
                      disabled={!agentInput.trim() || agentLoading}
                      className="w-7 h-7 bg-gray-900 disabled:opacity-30 text-white rounded-lg flex items-center justify-center transition-opacity"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* PUBLISHING */}
          {activeTab === "publishing" && (() => {
            const activeChannels = publishingChannels.filter((c) => c.status === "active");
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const publishedThisMonth = publishingLog.filter((e) => e.status === "published" && new Date(e.created_at) >= monthStart).length;
            const upcoming = savedArticles.filter((a) => a.status === "scheduled" && a.createdAt).slice(0, 5);
            return (
              <>
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Publishing</h2>
                    <p className="text-sm text-gray-400 mt-0.5">Distribution status across {activeChannels.length} channel{activeChannels.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-5">
                  <StatCard label="Published / Mo" value={publishedThisMonth} sub={`${publishingLog.filter(e => e.status === "published").length} total`} />
                  <StatCard label="Syndications" value={publishingLog.filter(e => e.status === "published").length} sub="across all channels" />
                  <StatCard label="Channels Active" value={`${activeChannels.length}/${publishingChannels.length}`} sub={`${publishingChannels.filter(c => c.status === "paused").length} paused`} />
                  <StatCard label="Failed" value={publishingLog.filter(e => e.status === "failed").length} sub="delivery errors" />
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-gray-900">Channels · {publishingChannels.length} connected</p>
                    <button onClick={() => setShowAddChannel(true)} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors">+ Add channel</button>
                  </div>
                  {publishingChannels.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-gray-400 mb-3">No channels yet</p>
                      <button onClick={() => setShowAddChannel(true)} className="text-xs font-medium bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">Add your first channel →</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3">
                      {publishingChannels.map((ch) => (
                        <div key={ch.id} className="border border-stone-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-base">{CHANNEL_ICONS[ch.type] ?? "🔗"}</span>
                            <span className="text-sm font-semibold text-gray-900">{ch.name}</span>
                            <button onClick={() => toggleChannel(ch.id, ch.status)} className="ml-auto text-[10px] text-gray-400 hover:text-gray-600">
                              {ch.status === "active" ? "Pause" : "Resume"}
                            </button>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${ch.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-700"}`}>{ch.status === "active" ? "Active" : "Paused"}</span>
                          <p className="text-[10px] text-gray-400 mt-2 truncate">{ch.url}</p>
                          <p className="text-[10px] text-gray-400">Last: {ch.last_published_at ? timeAgo(ch.last_published_at) + " ago" : "—"}</p>
                          <button onClick={() => deleteChannel(ch.id)} className="mt-2 text-[10px] text-red-400 hover:text-red-600">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <p className="text-sm font-semibold text-gray-900">Activity log</p>
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                      <span className="text-xs text-gray-400">real-time</span>
                    </div>
                    {publishingLog.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center">No activity yet — publish an article to see the log</p>
                    ) : (
                      <div className="space-y-3">
                        {publishingLog.slice(0, 10).map((entry) => (
                          <div key={entry.id} className="flex items-start gap-3">
                            <span className="text-[10px] text-gray-400 w-6 shrink-0 mt-0.5">{timeAgo(entry.created_at)}</span>
                            <span className="text-xs font-medium text-blue-600 w-20 shrink-0 truncate">{entry.publishing_channels?.name ?? "—"}</span>
                            <span className="text-xs text-gray-600 flex-1 truncate">{entry.article_title ?? "—"}</span>
                            <span className={`text-[10px] font-medium shrink-0 ${entry.status === "published" ? "text-green-600" : entry.status === "failed" ? "text-red-500" : "text-gray-500"}`}>{entry.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-stone-200 rounded-xl p-5">
                    <p className="text-sm font-semibold text-gray-900 mb-4">Upcoming · scheduled articles</p>
                    {upcoming.length === 0 ? (
                      <p className="text-xs text-gray-400 py-4 text-center">No scheduled articles — set an article&apos;s status to &quot;scheduled&quot; to see it here</p>
                    ) : (
                      <div className="space-y-3">
                        {upcoming.map((item) => {
                          const ch = publishingChannels.find((c) => c.id === item.brandId);
                          return (
                            <div key={item.id} className="flex items-start gap-3">
                              <span className="text-xs text-gray-500 flex-1 truncate">{item.title}</span>
                              {ch && <span className="text-xs font-medium text-blue-600 shrink-0">{ch.name}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}

          {/* SCHEDULE */}
          {activeTab === "schedule" && (() => {
            const now = new Date();
            const year = now.getFullYear();
            const month = now.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            const monthLabel = now.toLocaleDateString("en-US", { month: "long", year: "numeric" });

            const publishedDays = new Set(
              publishingLog.filter((e) => e.status === "published").map((e) => {
                const d = new Date(e.created_at);
                return d.getFullYear() === year && d.getMonth() === month ? d.getDate() : -1;
              }).filter((d) => d > 0)
            );
            const failedDays = new Set(
              publishingLog.filter((e) => e.status === "failed").map((e) => {
                const d = new Date(e.created_at);
                return d.getFullYear() === year && d.getMonth() === month ? d.getDate() : -1;
              }).filter((d) => d > 0)
            );
            const scheduledDays = new Set(
              savedArticles.filter((a) => a.status === "scheduled" && a.createdAt).map((a) => {
                const d = new Date(a.createdAt);
                return d.getFullYear() === year && d.getMonth() === month ? d.getDate() : -1;
              }).filter((d) => d > 0)
            );

            const pipeline = savedArticles.filter((a) => ["review", "scheduled", "writing"].includes(a.status));
            const publishedThisMonth = publishingLog.filter((e) => {
              const d = new Date(e.created_at);
              return e.status === "published" && d.getFullYear() === year && d.getMonth() === month;
            }).length;

            return (
              <>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Schedule</h2>
                    <p className="text-sm text-gray-400 mt-0.5">Content pipeline, scheduling &amp; publishing calendar</p>
                  </div>
                  <button onClick={() => navTo("articles")} className="text-xs border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:border-gray-400 transition-colors">Manage articles</button>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-5">
                  <StatCard label="In Pipeline" value={pipeline.length} sub="queued + review" />
                  <StatCard label="Published / Mo" value={publishedThisMonth} sub="this month" />
                  <StatCard label="Scheduled" value={savedArticles.filter(a => a.status === "scheduled").length} sub="upcoming slots" />
                  <StatCard label="Total Articles" value={savedArticles.length} sub="all time" />
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-gray-900">Content pipeline · {pipeline.length} items</p>
                    <button onClick={() => navTo("articles")} className="text-xs text-gray-400 hover:text-gray-600">View all</button>
                  </div>
                  {pipeline.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No content in pipeline — generate articles from Research gaps</p>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {pipeline.map((item) => (
                        <div key={item.id} className="border border-stone-200 rounded-xl p-4 shrink-0 w-52">
                          <p className="text-[10px] text-gray-400 font-mono mb-1 truncate">{item.keyword || "—"}</p>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${STATUS_COLORS[item.status] ?? "bg-gray-100 text-gray-600"}`}>{item.status}</span>
                          <p className="text-sm font-medium text-gray-800 mt-2 leading-snug line-clamp-2">{item.title}</p>
                          <p className="text-xs text-gray-400 mt-1">{new Date(item.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-4">Publishing calendar · {monthLabel}</p>
                  <div className="grid grid-cols-7 gap-1 text-center mb-2">
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                      <div key={d} className="text-[10px] font-semibold text-gray-400 uppercase">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: daysInMonth }, (_, i) => {
                      const day = i + 1;
                      const isPublished = publishedDays.has(day);
                      const isScheduled = scheduledDays.has(day);
                      const isFailed = failedDays.has(day);
                      const isToday = day === now.getDate();
                      return (
                        <div key={day} className={`rounded-lg p-1.5 min-h-[44px] text-xs ${isPublished ? "bg-green-500 text-white" : isFailed ? "bg-red-500 text-white" : isScheduled ? "bg-gray-900 text-white" : "bg-gray-50 text-gray-500"}`}>
                          <span className={isToday ? "font-bold" : ""}>{day}</span>
                          {isPublished && <div className="text-[9px] mt-0.5 opacity-90">Published</div>}
                          {isScheduled && !isPublished && <div className="text-[9px] mt-0.5 opacity-90">Scheduled</div>}
                          {isFailed && <div className="text-[9px] mt-0.5 opacity-90">Failed</div>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-4 mt-3">
                    {[["bg-gray-900", "Scheduled"], ["bg-green-500", "Published"], ["bg-red-500", "Failed"]].map(([color, label]) => (
                      <div key={label} className="flex items-center gap-1.5">
                        <div className={`w-2.5 h-2.5 rounded ${color}`} />
                        <span className="text-[10px] text-gray-500">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}

          {/* BRANDS */}
          {activeTab === "brands" && (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Brands</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Your brand profile plus every competitor we track for AI visibility</p>
                </div>
                <button className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">+ New brand</button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <StatCard label="Brands Tracked" value={1 + brand.competitors.length} sub="incl. your brand" />
                <StatCard label="Competitors" value={brand.competitors.length} sub="tracked rivals" />
                <StatCard label="Aliases" value="—" sub="naming variants" />
              </div>

              <div className="bg-white border border-stone-200 rounded-xl p-5 mb-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm font-semibold text-gray-900">Own brand</p>
                  <button onClick={() => router.push("/setup")} className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1 rounded-lg transition-colors">Edit</button>
                </div>
                <div className="flex items-center gap-4 p-4 border border-stone-100 rounded-xl">
                  <div className="w-12 h-12 rounded-xl bg-gray-900 text-white flex items-center justify-center text-xl font-bold shrink-0">{brandInitial}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900">{brand.name}</p>
                    <p className="text-sm text-red-600">{brand.domain}</p>
                  </div>
                  <div className="text-xs text-gray-400 text-right">
                    <p>{brand.niche}</p>
                  </div>
                </div>
              </div>

              {brand.competitors.length > 0 && (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-100">
                    <p className="text-sm font-semibold text-gray-900">Tracked brands · {brand.competitors.length} competitors</p>
                  </div>
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-stone-100">
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Brand</th>
                        <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Type</th>
                        <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Share of Voice</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {brand.competitors.map((name) => {
                        const mentions = results.filter((r) => r.competitorMentions.some((c) => c.name === name)).length;
                        const pct = results.length > 0 ? Math.round((mentions / results.length) * 100) : null;
                        return (
                          <tr key={name} className="hover:bg-stone-50/50">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-sm font-bold text-gray-600">{name[0]?.toUpperCase()}</div>
                                <span className="text-sm font-medium text-gray-800">{name}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Competitor</span>
                            </td>
                            <td className="px-5 py-3 text-sm font-medium text-gray-700 text-right">{pct !== null ? `${pct}%` : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}

          {/* ALERTS */}
          {activeTab === "alerts" && (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">Alerts</h2>
                  <p className="text-sm text-gray-400 mt-0.5">Webhook, Slack, Discord and email destinations plus a live delivery log</p>
                </div>
                <button onClick={() => setShowAddAlert(true)} className="text-xs font-medium bg-gray-900 text-white px-3 py-1.5 rounded-lg hover:bg-gray-700 transition-colors">+ New destination</button>
              </div>

              <div className="grid grid-cols-4 gap-3 mb-5">
                <StatCard label="Destinations" value={alertDestinations.length} sub="channels wired" />
                <StatCard label="Active" value={alertDestinations.filter(d => d.status === "active").length} sub="enabled" />
                <StatCard label="Recent Deliveries" value={alertDeliveries.length} sub="last 20" />
                <StatCard label="Failed" value={alertDeliveries.filter(d => d.status === "failed").length} sub="need attention" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-stone-100">
                    <p className="text-sm font-semibold text-gray-900">Destinations · {alertDestinations.length}</p>
                  </div>
                  {alertDestinations.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-gray-400 mb-3">No destinations yet</p>
                      <button onClick={() => setShowAddAlert(true)} className="text-xs font-medium bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors">Add Slack or webhook →</button>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-stone-100">
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Destination</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Kind</th>
                          <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Status</th>
                          <th className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {alertDestinations.map((dest) => (
                          <tr key={dest.id} className="hover:bg-stone-50/50">
                            <td className="px-5 py-3 text-sm font-medium text-gray-800">{dest.name}</td>
                            <td className="px-5 py-3">
                              <span className="text-[10px] font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{dest.kind}</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => toggleAlertDestination(dest.id, dest.status)} className={`text-[10px] font-medium px-2 py-0.5 rounded ${dest.status === "active" ? "bg-green-50 text-green-700" : "bg-gray-100 text-gray-700"}`}>{dest.status === "active" ? "Active" : "Paused"}</button>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => deleteAlertDestination(dest.id)} className="text-[10px] text-red-400 hover:text-red-600">Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5">
                  <p className="text-sm font-semibold text-gray-900 mb-4">Recent deliveries</p>
                  {alertDeliveries.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center">No deliveries yet — alerts fire when scans detect significant changes</p>
                  ) : (
                    <div className="space-y-3">
                      {alertDeliveries.map((d) => (
                        <div key={d.id} className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-gray-600">{d.alert_destinations?.kind ?? "—"} · {d.event_type}</p>
                            {d.error_detail && <p className="text-[10px] text-red-500 mt-0.5">{d.error_detail}</p>}
                          </div>
                          <span className="text-[10px] text-gray-400 shrink-0">{timeAgo(d.created_at)}</span>
                          <span className={`text-[10px] font-medium shrink-0 ${d.status === "succeeded" ? "text-green-600" : "text-red-500"}`}>{d.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* New Article Modal */}
      {showNewArticleModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowNewArticleModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h3 className="text-base font-bold text-gray-900">New article</h3>
              <button onClick={() => setShowNewArticleModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">What do you want to write about?</label>
              <textarea
                autoFocus
                rows={3}
                value={newArticleTopic}
                onChange={(e) => setNewArticleTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && newArticleTopic.trim()) {
                    setShowNewArticleModal(false);
                    const params = new URLSearchParams({ gapPrompt: newArticleTopic.trim(), brand: brand.name, niche: brand.niche, brandId: brand.id ?? "" });
                    window.open(`/article?${params}`, "_blank");
                  }
                }}
                placeholder={`e.g. "best ${brand.niche} tools for startups"`}
                className="w-full border border-stone-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent resize-none"
              />
              <p className="text-[10px] text-gray-400 mt-1.5">Tip: phrase it like a question someone would ask an AI</p>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setShowNewArticleModal(false)} className="flex-1 text-sm border border-gray-200 rounded-lg py-2.5 hover:bg-gray-50 transition-colors">Cancel</button>
              <button
                disabled={!newArticleTopic.trim()}
                onClick={() => {
                  setShowNewArticleModal(false);
                  const params = new URLSearchParams({ gapPrompt: newArticleTopic.trim(), brand: brand.name, niche: brand.niche, brandId: brand.id ?? "" });
                  window.open(`/article?${params}`, "_blank");
                }}
                className="flex-1 text-sm bg-gray-900 text-white rounded-lg py-2.5 hover:bg-gray-700 disabled:opacity-40 transition-colors font-medium"
              >
                Generate →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Channel Modal */}
      {showAddChannel && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddChannel(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-gray-900">Add publishing channel</h3>
                <button onClick={() => setShowAddChannel(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Channel type</label>
                  <select value={newChannel.type} onChange={(e) => setNewChannel((p) => ({ ...p, type: e.target.value, url: "", apiKey: "" }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400">
                    <option value="webhook">Webhook — send JSON to any URL</option>
                    <option value="discord">Discord — post to a channel</option>
                    <option value="wordpress">WordPress — publish directly to your blog</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Name</label>
                  <input value={newChannel.name} onChange={(e) => setNewChannel((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Company blog" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                {newChannel.type === "webhook" && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Webhook URL</label>
                    <input value={newChannel.url} onChange={(e) => setNewChannel((p) => ({ ...p, url: e.target.value }))} placeholder="https://hooks.example.com/..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                    <p className="text-[10px] text-gray-400 mt-1">RankOnGeo will POST the article as JSON to this URL. Use <span className="font-mono">webhook.site</span> to test.</p>
                  </div>
                )}
                {newChannel.type === "discord" && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Discord webhook URL</label>
                    <input value={newChannel.url} onChange={(e) => setNewChannel((p) => ({ ...p, url: e.target.value }))} placeholder="https://discord.com/api/webhooks/..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                    <p className="text-[10px] text-gray-400 mt-1">In Discord: channel Settings → Integrations → Webhooks → New Webhook → Copy URL</p>
                  </div>
                )}
                {newChannel.type === "wordpress" && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">WordPress site URL</label>
                      <input value={newChannel.url} onChange={(e) => setNewChannel((p) => ({ ...p, url: e.target.value }))} placeholder="https://yourblog.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 block mb-1">Application password</label>
                      <input type="password" value={newChannel.apiKey} onChange={(e) => setNewChannel((p) => ({ ...p, apiKey: e.target.value }))} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                      <p className="text-[10px] text-gray-400 mt-1">WP Admin → Users → Edit your user → Application Passwords → Generate</p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowAddChannel(false)} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={addChannel} disabled={addingChannel || !newChannel.name || !newChannel.url} className="flex-1 text-sm font-medium bg-gray-900 text-white rounded-lg py-2 hover:bg-gray-700 disabled:opacity-50 transition-colors">
                  {addingChannel ? "Adding…" : "Add channel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Now Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { if (!publishing) { setShowPublishModal(false); setPublishResult(null); } }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-gray-900">Publish article</h3>
                <button onClick={() => { setShowPublishModal(false); setPublishResult(null); }} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              {publishResult ? (
                <div className={`rounded-xl p-4 mb-5 ${publishResult.success ? "bg-green-50 border border-green-100" : "bg-red-50 border border-red-100"}`}>
                  <p className={`text-sm font-medium ${publishResult.success ? "text-green-700" : "text-red-700"}`}>{publishResult.success ? "Published successfully!" : "Publish failed"}</p>
                  {publishResult.error && <p className="text-xs text-red-600 mt-1">{publishResult.error}</p>}
                </div>
              ) : (
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Article</label>
                    <select value={publishArticleId} onChange={(e) => setPublishArticleId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400">
                      <option value="">Select article…</option>
                      {savedArticles.filter(a => a.status !== "published").map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Channel</label>
                    {publishingChannels.length === 0 ? (
                      <p className="text-xs text-gray-400">No channels — <button onClick={() => { setShowPublishModal(false); setShowAddChannel(true); }} className="text-red-600 underline">add one first</button></p>
                    ) : (
                      <select value={publishChannelId} onChange={(e) => setPublishChannelId(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400">
                        <option value="">Select channel…</option>
                        {publishingChannels.filter(c => c.status === "active").map((c) => (
                          <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => { setShowPublishModal(false); setPublishResult(null); }} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">
                  {publishResult ? "Close" : "Cancel"}
                </button>
                {!publishResult && (
                  <button onClick={publishNow} disabled={publishing || !publishArticleId || !publishChannelId} className="flex-1 text-sm font-medium bg-gray-900 text-white rounded-lg py-2 hover:bg-gray-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {publishing && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                    {publishing ? "Publishing…" : "⚡ Publish"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Alert Destination Modal */}
      {showAddAlert && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddAlert(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Add alert destination</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Get notified when your visibility changes, drops, or you gain new mentions</p>
                </div>
                <button onClick={() => setShowAddAlert(false)} className="text-gray-300 hover:text-gray-500 text-xl leading-none ml-4 shrink-0">×</button>
              </div>

              <div className="space-y-4">
                {/* Kind selector — clickable cards */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Where to send alerts</p>
                  <div className="grid grid-cols-4 gap-2">
                    {([
                      { value: "discord", label: "Discord", icon: (
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03z"/></svg>
                      )},
                      { value: "slack", label: "Slack", icon: (
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z"/></svg>
                      )},
                      { value: "webhook", label: "Webhook", icon: (
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" strokeLinecap="round" strokeLinejoin="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )},
                      { value: "email", label: "Email", icon: (
                        <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" strokeLinecap="round" strokeLinejoin="round"/><polyline points="22,6 12,13 2,6" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      )},
                    ] as { value: string; label: string; icon: React.ReactNode }[]).map(({ value, label, icon }) => {
                      const active = newAlert.kind === value;
                      return (
                        <button
                          key={value}
                          onClick={() => setNewAlert((p) => ({ ...p, kind: value }))}
                          className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all ${
                            active
                              ? "border-gray-900 bg-gray-900 text-white"
                              : "border-stone-200 text-gray-500 hover:border-gray-400 hover:text-gray-700"
                          }`}
                        >
                          {icon}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Discord guide */}
                {newAlert.kind === "discord" && (
                  <div className="bg-[#5865f2]/5 border border-[#5865f2]/20 rounded-xl p-4">
                    <p className="text-xs font-semibold text-[#5865f2] mb-2">How to get a Discord webhook URL</p>
                    <ol className="space-y-1.5 text-xs text-gray-600">
                      <li className="flex gap-2"><span className="text-[#5865f2] font-semibold shrink-0">1.</span>Open your Discord server → right-click the channel you want alerts in</li>
                      <li className="flex gap-2"><span className="text-[#5865f2] font-semibold shrink-0">2.</span>Click <span className="font-medium">Edit Channel</span> → <span className="font-medium">Integrations</span> → <span className="font-medium">Webhooks</span></li>
                      <li className="flex gap-2"><span className="text-[#5865f2] font-semibold shrink-0">3.</span>Click <span className="font-medium">New Webhook</span>, give it a name, then click <span className="font-medium">Copy Webhook URL</span></li>
                      <li className="flex gap-2"><span className="text-[#5865f2] font-semibold shrink-0">4.</span>Paste the URL below — it starts with <span className="font-mono bg-[#5865f2]/10 px-1 rounded">discord.com/api/webhooks/…</span></li>
                    </ol>
                  </div>
                )}

                {/* Slack guide */}
                {newAlert.kind === "slack" && (
                  <div className="bg-[#4a154b]/5 border border-[#4a154b]/15 rounded-xl p-4">
                    <p className="text-xs font-semibold text-[#4a154b] mb-2">How to get a Slack webhook URL</p>
                    <ol className="space-y-1.5 text-xs text-gray-600">
                      <li className="flex gap-2"><span className="text-[#4a154b] font-semibold shrink-0">1.</span>Go to <span className="font-mono bg-[#4a154b]/10 px-1 rounded">api.slack.com/apps</span> → Create New App → From Scratch</li>
                      <li className="flex gap-2"><span className="text-[#4a154b] font-semibold shrink-0">2.</span>Enable <span className="font-medium">Incoming Webhooks</span> → Add New Webhook to Workspace</li>
                      <li className="flex gap-2"><span className="text-[#4a154b] font-semibold shrink-0">3.</span>Pick a channel, then copy the webhook URL that starts with <span className="font-mono bg-[#4a154b]/10 px-1 rounded">hooks.slack.com/…</span></li>
                    </ol>
                  </div>
                )}

                {/* Name field */}
                <div>
                  <label className="text-xs font-semibold text-gray-500 block mb-1.5">Nickname</label>
                  <input
                    value={newAlert.name}
                    onChange={(e) => setNewAlert((p) => ({ ...p, name: e.target.value }))}
                    placeholder={newAlert.kind === "discord" ? "e.g. #alerts channel" : newAlert.kind === "slack" ? "e.g. #eng-team" : newAlert.kind === "email" ? "e.g. Me" : "e.g. My webhook"}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 transition-colors"
                  />
                </div>

                {/* URL / email field */}
                {newAlert.kind !== "email" ? (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Webhook URL</label>
                    <input
                      value={newAlert.url}
                      onChange={(e) => setNewAlert((p) => ({ ...p, url: e.target.value }))}
                      placeholder={newAlert.kind === "discord" ? "https://discord.com/api/webhooks/…" : newAlert.kind === "slack" ? "https://hooks.slack.com/services/…" : "https://…"}
                      className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-gray-900 placeholder:text-gray-400 font-mono outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 transition-colors"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-gray-500 block mb-1.5">Email address</label>
                    <input
                      type="email"
                      value={newAlert.email}
                      onChange={(e) => setNewAlert((p) => ({ ...p, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 transition-colors"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowAddAlert(false)} className="flex-1 text-sm border border-stone-200 rounded-xl py-2.5 hover:bg-stone-50 transition-colors text-gray-600">Cancel</button>
                <button onClick={addAlertDestination} disabled={addingAlert || !newAlert.name} className="flex-1 text-sm font-semibold bg-gray-900 text-white rounded-xl py-2.5 hover:bg-gray-700 disabled:opacity-40 transition-colors">
                  {addingAlert ? "Adding…" : "Add destination"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thread reply modal */}
      {activeThread && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setActiveThread(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-blue-600">r/{activeThread.subreddit}</span>
                    <span className="text-xs text-gray-400">↑ {activeThread.score} · {activeThread.numComments} comments</span>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">{activeThread.title}</h3>
                </div>
                <button onClick={() => setActiveThread(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
              </div>

              {activeThread.body && (
                <div className="bg-gray-50 rounded-lg px-4 py-3 mb-4">
                  <p className="text-xs text-gray-600 leading-relaxed line-clamp-4">{activeThread.body}</p>
                </div>
              )}

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">AI draft reply</p>
                  <button onClick={async () => { setDraftingReply(true); setDraftReply(""); const res = await fetch("/api/reddit/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: activeThread.id, brandId: brand?.id }) }); const d = await res.json(); setDraftReply(d.reply ?? ""); setDraftingReply(false); }} className="text-xs text-blue-600 hover:underline">Regenerate</button>
                </div>

                {draftingReply ? (
                  <div className="flex items-center gap-2 py-6 justify-center">
                    <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-gray-500">Drafting reply…</span>
                  </div>
                ) : draftReply ? (
                  <div>
                    <textarea value={draftReply} onChange={(e) => setDraftReply(e.target.value)} rows={5} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => navigator.clipboard.writeText(draftReply)} className="flex-1 text-sm font-medium border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Copy</button>
                      {redditConnected ? (
                        <button
                          onClick={postReply}
                          disabled={postingReply}
                          className="flex-1 text-sm font-medium bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg py-2 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {postingReply ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                          {postingReply ? "Posting…" : "Post on Reddit"}
                        </button>
                      ) : (
                        <a href={activeThread.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm font-medium bg-blue-600 text-white text-center rounded-lg py-2 hover:bg-blue-700 transition-colors">Open thread ↗</a>
                      )}
                    </div>
                    {!redditConnected && (
                      <p className="text-[10px] text-gray-400 mt-2 text-center">
                        <a href={`/api/reddit/auth?brandId=${brand.id}`} className="text-orange-500 hover:underline font-medium">Connect Reddit</a> to post without copy-pasting
                      </p>
                    )}
                  </div>
                ) : (
                  <button onClick={() => draftReplyForThread(activeThread)} className="w-full text-sm font-medium bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors">Generate draft</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ENGAGE PANEL */}
      {engageItem && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setEngageItem(null)} />
          <div className="w-[420px] h-full bg-white shadow-2xl flex flex-col overflow-hidden border-l border-stone-200">
            {/* Header */}
            <div className="px-5 py-4 border-b border-stone-100 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-[#FF4500] flex items-center justify-center shrink-0">
                <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
                  <circle cx="10" cy="10" r="10" fill="white" fillOpacity="0.2"/>
                  <path fill="white" d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Engage on Reddit</p>
                <p className="text-xs text-gray-400">Draft a reply to influence this citation</p>
              </div>
              <button onClick={() => setEngageItem(null)} className="ml-auto text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Thread context */}
            <div className="px-5 py-4 border-b border-stone-100 bg-stone-50/50">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Thread</p>
              <a
                href={engageItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 group"
              >
                <span className="text-xs text-blue-600 group-hover:underline break-all leading-relaxed">
                  {engageItem.url.replace(/^https?:\/\/(www\.)?/, "")}
                </span>
                <svg className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-gray-400">Cited by</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${ENGINE_COLORS[engageItem.engine as AIEngine] ?? "bg-gray-300"}`} />
                  <span className="text-[10px] font-medium text-gray-600">{ENGINE_LABELS[engageItem.engine as AIEngine] ?? engageItem.engine}</span>
                </div>
                <span className="text-[10px] text-gray-400">for prompt:</span>
                <span className="text-[10px] text-gray-600 italic truncate max-w-[140px]">{engageItem.promptText.slice(0, 50)}{engageItem.promptText.length > 50 ? "…" : ""}</span>
              </div>
            </div>

            {/* Draft area */}
            <div className="flex-1 flex flex-col px-5 py-4 gap-3 overflow-y-auto">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Reply draft</p>
                <button
                  onClick={async () => {
                    setEngageGenerating(true);
                    try {
                      const res = await fetch("/api/agent", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          messages: [{
                            role: "user",
                            content: `Write a short, helpful Reddit comment (2-3 sentences) that naturally and authentically mentions ${brand.name} in the context of this thread. The thread appeared when someone searched: "${engageItem.promptText}". Keep it genuine and conversational — not promotional. Just reply with the comment text, no preamble.`,
                          }],
                          scanContext: { brandName: brand.name, domain: brand.domain, niche: brand.niche },
                        }),
                      });
                      if (res.ok) {
                        const d = await res.json();
                        setEngageDraft(d.reply ?? "");
                      }
                    } catch {}
                    setEngageGenerating(false);
                  }}
                  disabled={engageGenerating}
                  className="flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark disabled:opacity-50 transition-colors"
                >
                  {engageGenerating ? (
                    <><span className="w-3 h-3 border border-brand border-t-transparent rounded-full animate-spin" /> Generating…</>
                  ) : (
                    <><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg> AI suggest</>
                  )}
                </button>
              </div>
              <textarea
                value={engageDraft}
                onChange={(e) => setEngageDraft(e.target.value)}
                placeholder="Write your reply here, or click AI suggest to generate one…"
                rows={8}
                className="w-full text-sm text-gray-800 placeholder:text-gray-400 border border-stone-200 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40 bg-white"
              />
              {engageDraft && (
                <p className="text-xs text-gray-400">{engageDraft.trim().split(/\s+/).length} words · edit freely before posting</p>
              )}
            </div>

            {/* Footer actions */}
            <div className="px-5 py-4 border-t border-stone-100 flex gap-2">
              <button
                onClick={() => {
                  if (engageDraft) {
                    navigator.clipboard.writeText(engageDraft);
                    setEngageCopied(true);
                    setTimeout(() => setEngageCopied(false), 2000);
                  }
                }}
                disabled={!engageDraft}
                className="flex-1 text-sm font-medium border border-stone-200 text-gray-700 py-2.5 rounded-lg hover:bg-stone-50 disabled:opacity-40 transition-colors"
              >
                {engageCopied ? "Copied!" : "Copy text"}
              </button>
              <a
                href={engageItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 text-sm font-medium bg-[#FF4500] text-white text-center py-2.5 rounded-lg hover:bg-[#e03d00] transition-colors"
              >
                Open Reddit →
              </a>
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
