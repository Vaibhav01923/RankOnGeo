"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AIEngine, BrandData, GapItem, RedditThread, ScanResult, SocialKeyword, VisibilityScore } from "@/lib/types";
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
  const [userEmail, setUserEmail] = useState("");

  // Agent state
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentInitialized, setAgentInitialized] = useState(false);
  const agentEndRef = useRef<HTMLDivElement>(null);

  // Articles state
  const [savedArticles, setSavedArticles] = useState<SavedArticle[]>([]);
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
            if (d.results?.length) { setResults(d.results); setScanned(true); }
          }).finally(() => setLoadingResults(false));
          fetch(`/api/keywords?brandId=${id}`).then((r) => r.json()).then((d) => setSocialKeywords(d.keywords ?? []));
          fetch(`/api/reddit/threads?brandId=${id}`).then((r) => r.json()).then((d) => setRedditThreads(d.threads ?? []));
          fetch(`/api/articles?brandId=${id}`).then((r) => r.json()).then((d) => setSavedArticles((d.articles ?? []).map(mapArticleFromDb)));
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

  useEffect(() => {
    if (activeTab === "agent" && !agentInitialized && brand) {
      setAgentInitialized(true);
      const greeting = overallScore !== null
        ? `Based on your latest scan across ${brand.trackedPrompts.length} prompts, **${brand.name}** holds **${overallScore}% visibility** with the biggest opportunities on ${gaps.length > 0 ? `"${gaps[0].promptText}"` : "comparison queries"}. Ask about gaps, competitors, or what to write next — I have your live tracking data.`
        : `Hi! I'm Pulse, your AI visibility analyst for **${brand.name}** (${brand.domain}). Run a scan first to unlock live data insights, or ask me anything about AI visibility strategy.`;
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
      await fetch("/api/reddit/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id }) });
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

  async function runScan() {
    if (!brand) return;
    setScanning(true);
    setError("");
    try {
      const res = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brandId: brand.id, engines: selectedEngines }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Scan failed");
      const newResults: ScanResult[] = data.results;
      setResults(newResults);
      if (data.scores) setScores(data.scores);
      if (data.overallScore !== undefined) setOverallScore(data.overallScore);
      setGaps(computeGaps(newResults, brand));
      setScanned(true);
      if (brand.id) fetch(`/api/history?brandId=${brand.id}`).then((r) => r.json()).then((d) => setScanHistory(d.runs ?? []));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally { setScanning(false); }
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

  function toggleEngine(engine: AIEngine) {
    setSelectedEngines((prev) => prev.includes(engine) ? prev.filter((e) => e !== engine) : [...prev, engine]);
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
  const citationDomains = (() => {
    const map: Record<string, { count: number; engines: Set<string>; type: string }> = {};
    results.forEach((r) => {
      r.citations.forEach((url) => {
        const domain = url.replace(/^https?:\/\//, "").split("/")[0].replace(/^www\./, "");
        if (!domain) return;
        const isBrand = domain.includes(brand.domain.replace(/^www\./, ""));
        const type = isBrand ? "Owned" : getSourceType(domain);
        if (!map[domain]) map[domain] = { count: 0, engines: new Set(), type };
        map[domain].count++;
        map[domain].engines.add(r.engine);
      });
    });
    return Object.entries(map).sort((a, b) => b[1].count - a[1].count);
  })();

  const totalCitations = results.reduce((s, r) => s + r.citations.length, 0);

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

          <div className="flex items-center gap-2">
            {(activeTab === "overview" || activeTab === "history" || activeTab === "results" || activeTab === "citations" || activeTab === "competitors" || activeTab === "gaps") && (
              <div className="flex items-center gap-1">
                {AVAILABLE_ENGINES.map((engine) => (
                  <button
                    key={engine}
                    onClick={() => toggleEngine(engine)}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selectedEngines.includes(engine) ? "border-red-300 bg-red-50 text-red-700" : "border-gray-200 text-gray-400 hover:border-gray-300"
                    }`}
                  >
                    {ENGINE_LABELS[engine]}
                  </button>
                ))}
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
            {(activeTab === "overview" || activeTab === "history" || activeTab === "results" || activeTab === "citations" || activeTab === "competitors" || activeTab === "gaps") && (
              <button
                onClick={runScan}
                disabled={scanning || selectedEngines.length === 0}
                className="flex items-center gap-1.5 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                {scanning && <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {scanning ? "Scanning…" : scanned ? "+ Re-scan" : "+ Run scan"}
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
              <p className="text-sm font-medium text-gray-700">Submitting prompts to AI engines…</p>
              <p className="text-xs text-gray-400 mt-1">Running {brand.trackedPrompts.length} prompts × {selectedEngines.length} engines</p>
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
                  <h2 className="text-xl font-bold text-gray-900 mb-5">Engines</h2>
                  <div className="space-y-3">
                    {scanHistory.map((run) => (
                      <div key={run.id} className="bg-white border border-stone-200 rounded-xl p-4 flex items-center gap-4">
                        <div className="text-2xl font-bold text-gray-900 w-16">{run.overall_score}%</div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            {run.visibility_scores?.map((s) => (
                              <span key={s.engine} className="text-xs text-gray-500">{ENGINE_LABELS[s.engine as AIEngine]}: <span className="font-medium text-gray-700">{s.score}%</span></span>
                            ))}
                          </div>
                          <p className="text-xs text-gray-400">{new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <div className="flex gap-1">
                          {run.engines.map((e) => <div key={e} className={`w-2 h-2 rounded-full ${ENGINE_COLORS[e as AIEngine] ?? "bg-gray-300"}`} />)}
                        </div>
                      </div>
                    ))}
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
                            <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">Mentioned{r.brandRank ? ` #${r.brandRank}` : ""}</span>
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
                </>
              )}
            </>
          )}

          {/* CITATIONS */}
          {activeTab === "citations" && (
            <>
              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-stone-300 border-t-stone-600 rounded-full animate-spin" /></div>
              ) : !scanned ? (
                <EmptyState label="No citation data" sub="Run a scan to see where AI engines are citing your brand" />
              ) : totalCitations === 0 ? (
                <EmptyState label="No citations detected" sub="Citations appear when AI engines reference sources in their responses" />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-1">Citations</h2>
                  <p className="text-sm text-gray-400 mb-5">Sources AI engines cited when mentioning {brand.name}</p>

                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <StatCard label="Total Citations" value={totalCitations} sub={`avg ${Math.round(totalCitations / Math.max(results.length, 1))} per response`} />
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">By source type</p>
                      <div className="space-y-2">
                        {Object.entries(sourceTypeCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type, count]) => (
                          <div key={type} className="flex items-center gap-2">
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded w-16 text-center ${SOURCE_TYPE_COLORS[type] ?? "bg-gray-100 text-gray-600"}`}>{type}</span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full bg-red-400 rounded-full" style={{ width: `${Math.round((count / totalCitations) * 100)}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-6 text-right">{count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Top citing sources</p>
                      <div className="space-y-2">
                        {citationDomains.slice(0, 4).map(([domain, info]) => (
                          <div key={domain} className="flex items-center justify-between gap-2">
                            <span className="text-xs text-gray-700 truncate flex-1">{domain}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${SOURCE_TYPE_COLORS[info.type] ?? "bg-gray-100 text-gray-600"}`}>{info.type}</span>
                            <span className="text-xs font-medium text-gray-900 w-4 text-right shrink-0">{info.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">All citing sources · {citationDomains.length}</p>
                    </div>
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-stone-100">
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Source</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Type</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Engines</th>
                          <th className="px-5 py-3 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Citations</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {citationDomains.map(([domain, info]) => (
                          <tr key={domain} className="hover:bg-stone-50/50">
                            <td className="px-5 py-3 text-sm text-gray-800">{domain}</td>
                            <td className="px-5 py-3">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${SOURCE_TYPE_COLORS[info.type] ?? "bg-gray-100 text-gray-600"}`}>{info.type}</span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex gap-1">
                                {[...info.engines].map((e) => (
                                  <span key={e} className={`text-[10px] px-1.5 py-0.5 rounded ${ENGINE_BADGE_COLORS[e] ?? "bg-gray-100 text-gray-600"}`}>{ENGINE_LABELS[e as AIEngine] ?? e}</span>
                                ))}
                              </div>
                            </td>
                            <td className="px-5 py-3 text-sm font-medium text-gray-900 text-right">{info.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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

                {filteredArticles.length === 0 ? (
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
                        const params = new URLSearchParams({ gapPrompt: selectedArticle.keyword || selectedArticle.title, brand: brand.name, niche: brand.niche, brandId: brand.id ?? "" });
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
              <div className="mb-5">
                <h2 className="text-xl font-bold text-gray-900">Social</h2>
                <p className="text-sm text-gray-400 mt-0.5">Monitor Reddit for keyword-relevant conversations</p>
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
                  <span className="font-semibold text-gray-900">Pulse</span>
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
                    placeholder="Ask Pulse about your AI visibility…"
                    rows={1}
                    className="w-full px-4 pt-3 pb-1 text-sm text-gray-800 placeholder-gray-400 resize-none outline-none rounded-t-2xl"
                  />
                  <div className="flex items-center justify-between px-4 pb-3">
                    <span className="text-xs text-gray-400">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full inline-block mr-1" />
                      Pulse · reads your live data
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
                  <select value={newChannel.type} onChange={(e) => setNewChannel((p) => ({ ...p, type: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400">
                    <option value="webhook">Webhook (generic JSON POST)</option>
                    <option value="discord">Discord webhook</option>
                    <option value="wordpress">WordPress (REST API)</option>
                    <option value="webflow">Webflow (manual)</option>
                    <option value="framer">Framer (manual)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Name</label>
                  <input value={newChannel.name} onChange={(e) => setNewChannel((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Company blog" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">{newChannel.type === "wordpress" ? "WordPress site URL" : "Webhook URL"}</label>
                  <input value={newChannel.url} onChange={(e) => setNewChannel((p) => ({ ...p, url: e.target.value }))} placeholder={newChannel.type === "wordpress" ? "https://yourblog.com" : "https://hooks.example.com/..."} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                {newChannel.type === "wordpress" && (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Application password <span className="text-gray-400">(Users → Edit → App Passwords)</span></label>
                    <input type="password" value={newChannel.apiKey} onChange={(e) => setNewChannel((p) => ({ ...p, apiKey: e.target.value }))} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                )}
                {(newChannel.type === "webflow" || newChannel.type === "framer") && (
                  <p className="text-xs text-gray-500 bg-stone-50 rounded-lg px-3 py-2">Manual channel — you&apos;ll copy article content and paste it into your CMS. We track the log here.</p>
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
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-gray-900">Add alert destination</h3>
                <button onClick={() => setShowAddAlert(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Kind</label>
                  <select value={newAlert.kind} onChange={(e) => setNewAlert((p) => ({ ...p, kind: e.target.value }))} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400">
                    <option value="slack">Slack (incoming webhook)</option>
                    <option value="discord">Discord webhook</option>
                    <option value="webhook">Generic webhook</option>
                    <option value="email">Email</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Name</label>
                  <input value={newAlert.name} onChange={(e) => setNewAlert((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Eng team Slack" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                {newAlert.kind !== "email" ? (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Webhook URL</label>
                    <input value={newAlert.url} onChange={(e) => setNewAlert((p) => ({ ...p, url: e.target.value }))} placeholder="https://hooks.slack.com/..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-medium text-gray-500 block mb-1">Email address</label>
                    <input type="email" value={newAlert.email} onChange={(e) => setNewAlert((p) => ({ ...p, email: e.target.value }))} placeholder="team@company.com" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowAddAlert(false)} className="flex-1 text-sm border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Cancel</button>
                <button onClick={addAlertDestination} disabled={addingAlert || !newAlert.name} className="flex-1 text-sm font-medium bg-gray-900 text-white rounded-lg py-2 hover:bg-gray-700 disabled:opacity-50 transition-colors">
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
                      <button onClick={() => navigator.clipboard.writeText(draftReply)} className="flex-1 text-sm font-medium border border-gray-200 rounded-lg py-2 hover:bg-gray-50 transition-colors">Copy reply</button>
                      <a href={activeThread.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm font-medium bg-blue-600 text-white text-center rounded-lg py-2 hover:bg-blue-700 transition-colors">Post on Reddit ↗</a>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => draftReplyForThread(activeThread)} className="w-full text-sm font-medium bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors">Generate draft</button>
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
