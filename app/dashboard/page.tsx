"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AdminFeedback, AdminTask, AIEngine, BrandData, EngageTask, GapItem, RedditServiceType, RedditThread, ScanResult, SocialKeyword, VisibilityScore } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PricingCards } from "@/app/_components/PricingCards";
import { promptLimitForPlan } from "@/lib/plan-limits";

const ENGINE_LABELS: Record<AIEngine, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google: "Google AI",
  grok: "Grok",
};

const REDDIT_SERVICE_META: Record<RedditServiceType, { label: string; target: "post" | "comment"; creditsPerUnit: number; min: number; max: number; caveat?: string }> = {
  post_upvote: { label: "Upvotes", target: "post", creditsPerUnit: 0.5, min: 5, max: 1000 },
  post_downvote: {
    label: "Downvotes", target: "post", creditsPerUnit: 0.5, min: 5, max: 1000,
    caveat: "Only works on posts less than 24 hours old — on older posts the vote count may not visibly change, but it still limits the post's reach.",
  },
  comment_upvote: { label: "Upvotes", target: "comment", creditsPerUnit: 1, min: 5, max: 1000, caveat: "Only works on comments less than 24 hours old." },
  comment_downvote: { label: "Downvotes", target: "comment", creditsPerUnit: 1, min: 5, max: 1000, caveat: "Only works on comments less than 24 hours old." },
  custom_comments: { label: "Post a new comment", target: "post", creditsPerUnit: 5, min: 1, max: 1 },
};
const REDDIT_TARGET_SERVICES: Record<"post" | "comment", RedditServiceType[]> = {
  post: ["post_upvote", "post_downvote", "custom_comments"],
  comment: ["comment_upvote", "comment_downvote"],
};

const BRAND_LIMITS: Record<string, number> = { starter: 1, growth: 3, enterprise: 10 };
const FREE_BRAND_LIMIT = 1;

const TASK_STATUS_BADGE: Record<string, { label: string; className: string; dotClassName: string }> = {
  queued: { label: "Queued — high demand", className: "bg-[var(--rust-wash)]/10 text-[var(--rust-deep)] border-[var(--rust)]/25", dotClassName: "bg-[var(--rust-wash)]/100 animate-pulse" },
  pending: { label: "Pending", className: "bg-[var(--rust-wash)]/10 text-[var(--rust-deep)] border-[var(--rust)]/25", dotClassName: "bg-[var(--rust-wash)]/100 animate-pulse" },
  running: { label: "Running", className: "bg-blue-500/10 text-blue-700 border-blue-500/25", dotClassName: "bg-blue-500 animate-pulse" },
  completed: { label: "Completed", className: "bg-[var(--rust)]/10 text-[var(--rust)] border-[var(--rust)]/25", dotClassName: "bg-[var(--rust)]/100" },
  failed: { label: "Failed — refunded", className: "bg-red-500/10 text-red-700 border-red-500/25", dotClassName: "bg-red-600" },
  cancelled: { label: "Cancelled", className: "bg-[var(--line)] text-[var(--ink-soft)] border-[var(--line)]", dotClassName: "bg-[var(--ink-faint)]" },
};

/* Signal theme — raw hex approximations of the scoped oklch tokens
   (--rust, --rust-deep, --olive, --ink, --ink-soft, --cream), needed
   wherever a color must be a literal hex (inline SVG stroke/fill attrs
   can't resolve CSS custom properties reliably across engines). Keep
   these in sync with the --rust/--olive values on the dashboard root. */
const RUST_HEX = "#b1552e";
const RUST_DEEP_HEX = "#8f4322";
const OLIVE_HEX = "#6f7f3f";
const INK_HEX = "#302821";
const INK_SOFT_HEX = "#6b5f52";
const INK_FAINT_HEX = "#96897a";
const CREAM_HEX = "#f6f2e9";

/* One harmonized engine palette, tuned for contrast on the cream Signal
   surface — distinct hues per engine, rust/olive reserved as the
   product's own accent colors so engines don't collide with them. */
const ENGINE_COLORS: Record<AIEngine, string> = {
  chatgpt: "bg-[#4f8a5b]",
  claude: "bg-[#a8791f]",
  gemini: "bg-[#3f6fa8]",
  perplexity: "bg-[#2f8f96]",
  google: "bg-[var(--olive)]",
  grok: "bg-[#6b6358]",
};

const ENGINE_ICONS: Record<AIEngine, string> = {
  chatgpt: "/engines/chatgpt.png",
  claude: "/engines/claude.png",
  gemini: "/engines/gemini.png",
  perplexity: "/engines/perplexity.svg",
  google: "/engines/google.png",
  grok: "/engines/grok.png",
};

type EngagePlatform = "reddit" | "linkedin" | "other";

const ENGAGE_PLATFORMS: Record<EngagePlatform, { label: string; bg: string; hoverBg: string; text: string }> = {
  reddit: { label: "Reddit", bg: "bg-[#FF4500]", hoverBg: "hover:bg-[#e03d00]", text: "text-[#FF4500]" },
  linkedin: { label: "LinkedIn", bg: "bg-[#0A66C2]", hoverBg: "hover:bg-[#004182]", text: "text-[#0A66C2]" },
  other: { label: "this source", bg: "bg-[var(--line-soft)]", hoverBg: "hover:bg-[var(--line)]", text: "text-[var(--ink-soft)]" },
};

function getEngagePlatform(url: string): EngagePlatform {
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("linkedin.com")) return "linkedin";
  return "other";
}

function EngineIcon({ engine, size = 20 }: { engine: AIEngine; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={ENGINE_ICONS[engine]}
      alt={ENGINE_LABELS[engine]}
      width={size}
      height={size}
      className="rounded-full object-contain bg-white border border-white/20"
      style={{ width: size, height: size }}
    />
  );
}

const ENGINE_TEXT_COLORS: Record<AIEngine, string> = {
  chatgpt: "text-[#4f8a5b]",
  claude: "text-[#a8791f]",
  gemini: "text-[#3f6fa8]",
  perplexity: "text-[#2f8f96]",
  google: "text-[var(--olive)]",
  grok: "text-[#6b6358]",
};

const ENGINE_BADGE_COLORS: Record<string, string> = {
  chatgpt: "bg-[#4f8a5b]/10 text-[#4f8a5b] border border-[#4f8a5b]/25",
  claude: "bg-[#a8791f]/10 text-[#a8791f] border border-[#a8791f]/25",
  gemini: "bg-[#3f6fa8]/10 text-[#3f6fa8] border border-[#3f6fa8]/25",
  perplexity: "bg-[#2f8f96]/10 text-[#2f8f96] border border-[#2f8f96]/25",
  google: "bg-[var(--olive-wash)] text-[var(--olive)] border border-[var(--olive)]/25",
  grok: "bg-[var(--line-soft)] text-[#6b6358] border border-[var(--line)]",
};

const AVAILABLE_ENGINES: AIEngine[] = ["chatgpt", "claude", "gemini", "perplexity", "grok", "google"];

type Tab =
  | "overview" | "history" | "results" | "citations" | "competitors"
  | "webAnalytics" | "llmAnalytics"
  | "gaps" | "articles" | "tasks"
  | "publishing"
  | "alerts"
  | "agent" | "admin" | "feedback";

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  history: "Engines",
  results: "Prompts",
  citations: "Citations",
  competitors: "Competitors",
  webAnalytics: "Web Analytics",
  llmAnalytics: "LLM Analytics",
  gaps: "Research",
  articles: "Articles",

  tasks: "Tasks",
  publishing: "Publishing",

  alerts: "Alerts",
  agent: "Agent",
  admin: "Admin",
  feedback: "Feedback",
};

type BotBreakdown = { botName: string; count: number };
type NamedCount = { label: string; count: number };
type WebAnalyticsData = {
  domain: string;
  siteKey: string;
  isFree: boolean;
  stats: { liveVisitors: number; visitors: number; pageviews: number; avgDurationSeconds: number; bounceRate: number };
  live: { pages: NamedCount[]; referrers: NamedCount[] };
  topReferrers: NamedCount[];
};
type LlmAnalyticsData = {
  domain: string;
  siteKey: string;
  isFree: boolean;
  stats: { liveBots: number; botPageviews: number };
  breakdown: BotBreakdown[];
  live: { pages: NamedCount[]; bots: NamedCount[] };
};

const BOT_NAME_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  perplexity: "Perplexity",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  other: "Other",
};

const FEEDBACK_CATEGORIES: { value: string; label: string; description: string }[] = [
  { value: "feature_request", label: "Feature Request", description: "Suggest a new feature" },
  { value: "bug_report", label: "Bug Report", description: "Report a bug or issue" },
  { value: "improvement", label: "Improvement", description: "Suggest an improvement" },
  { value: "other", label: "Other", description: "General feedback" },
];

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
type ChatSession = { id: string; title: string; created_at: string; updated_at: string };

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
  Owned: "bg-blue-500/10 text-blue-700",
  Editorial: "bg-[var(--line-soft)] text-[var(--ink-soft)]",
  Review: "bg-[var(--rust-wash)] text-[var(--rust-deep)]",
  Reddit: "bg-orange-500/10 text-orange-700",
  Wiki: "bg-[var(--olive-wash)] text-[var(--olive)]",
  Social: "bg-purple-500/10 text-purple-700",
  News: "bg-sky-500/10 text-sky-700",
};

function computeGaps(results: ScanResult[], brand: BrandData): GapItem[] {
  const promptIds = [...new Set(results.map((r) => r.promptId))];
  const gaps: GapItem[] = [];
  for (const promptId of promptIds) {
    const promptResults = results.filter((r) => r.promptId === promptId);
    const promptText = promptResults[0]?.promptText ?? "";
    // Rows with an empty response mean the engine had no answer surface at all
    // (e.g. no Google AI Overview) — that's not a gap the brand can fill.
    const missingEngines = promptResults.filter((r) => !r.brandMentioned && r.response.trim()).map((r) => r.engine);
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
        <polyline points={points} fill="none" stroke={RUST_HEX} strokeWidth="1.5" strokeLinejoin="round" strokeOpacity="0.5" />
        {scores.map((s, i) => (
          <circle key={i} cx={(i / (scores.length - 1)) * width} cy={height - (s / max) * height} r="2.5" fill={RUST_HEX} fillOpacity="0.6" />
        ))}
      </svg>
    </div>
  );
}

function taskMatchesFilter(t: EngageTask, filter: "pending" | "completed" | "failed"): boolean {
  if (filter === "pending") return t.status === "pending" || t.status === "queued" || t.status === "running";
  if (filter === "completed") return t.status === "completed";
  return t.status === "failed" || t.status === "cancelled";
}

function mapEngageTask(t: Record<string, unknown>): EngageTask {
  return {
    id: t.id as string,
    brandId: t.brand_id as string,
    url: t.url as string,
    promptText: (t.prompt_text as string) ?? null,
    engine: (t.engine as string) ?? null,
    replyText: (t.reply_text as string) ?? null,
    upvotesOrdered: (t.upvotes_ordered as number) ?? 0,
    deliverySpeed: t.delivery_speed as string,
    serviceType: (t.service_type as RedditServiceType) ?? "post_upvote",
    creditsCharged: Number(t.credits_charged ?? 0),
    providerOrderId: (t.provider_order_id as string | null) ?? null,
    status: t.status as EngageTask["status"],
    createdAt: t.created_at as string,
    completedAt: (t.completed_at as string) ?? null,
  };
}

function EmptyState({ label, sub }: { label: string; sub: string }) {
  return (
    <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-2xl p-12 text-center">
      <p className="text-sm font-medium text-[var(--ink-soft)] mb-1">{label}</p>
      <p className="text-xs text-[var(--ink-faint)]">{sub}</p>
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-5">
      <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-[0.14em] mb-1.5">{label}</p>
      <p className="font-signal-mono text-3xl font-semibold text-[var(--ink)]">{value}</p>
      {sub && <p className="text-xs text-[var(--ink-faint)] mt-1">{sub}</p>}
    </div>
  );
}

function NavItem({ label, active, onClick, badge }: { label: string; active: boolean; onClick: () => void; badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-[10px] text-sm transition-colors text-left ${
        active
          ? "bg-[var(--rust-wash)] text-[var(--rust-deep)] font-semibold"
          : "text-[var(--ink-soft)] hover:text-[var(--ink)] hover:bg-[var(--line-soft)] font-medium"
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${active ? "bg-[var(--rust)]" : "bg-transparent"}`} />
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto text-[10px] font-semibold bg-[var(--rust)] text-[var(--surface)] px-1.5 py-0.5 rounded-full">{badge}</span>
      )}
    </button>
  );
}

/* Free-tier gating: wrap any value/section that should be blurred-and-locked
   behind an upgrade prompt. `onUnlock` is always the same openPaywall()
   handler passed down from the dashboard root — clicking anywhere on a
   blurred area opens the pricing modal instead of whatever it would
   normally do (pointer-events-none on the blurred content itself is what
   suppresses the real nested buttons/links).

   IMPORTANT: children must be DECOY content, never real values. The CSS blur
   is cosmetic — anyone can strip the filter in devtools and read the DOM
   underneath. Use decoyPct/decoyPick for stable fake values, or
   LockedSkeleton for whole sections. */
function decoyHash(seed: string | number): number {
  const s = String(seed);
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
const decoyPct = (seed: string | number) => 35 + (decoyHash(seed) % 48);
function decoyPick<T>(seed: string | number, options: readonly T[]): T {
  return options[decoyHash(seed) % options.length];
}
const DECOY_COMPETITORS = ["acmecorp.com", "northstar.io", "brightpath.co", "orbitlabs.dev"] as const;

function LockedSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3 p-5">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 rounded-lg bg-[var(--line-soft)]" style={{ width: `${88 - (i % 3) * 14}%` }} />
      ))}
    </div>
  );
}

/* Full-width locked list row — used where a real table/list row would leak. */
function BlurRow({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="relative cursor-pointer" onClick={onUnlock}>
      <div className="pointer-events-none select-none blur-[5px] px-6 py-2.5">
        <div className="h-6 rounded-lg bg-[var(--line-soft)]" />
      </div>
    </div>
  );
}

function BlurInline({ children, onUnlock }: { children: React.ReactNode; onUnlock: () => void }) {
  return (
    <div className="relative inline-block cursor-pointer align-middle" onClick={onUnlock}>
      <div className="pointer-events-none select-none inline-block blur-[5px]">{children}</div>
    </div>
  );
}

function BlurBlock({ children, onUnlock, label = "Upgrade to unlock" }: { children: React.ReactNode; onUnlock: () => void; label?: string }) {
  return (
    <div className="relative cursor-pointer" onClick={onUnlock}>
      <div className="pointer-events-none select-none blur-[5px]">{children}</div>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-semibold text-[var(--rust-deep)] bg-[var(--surface)] border border-[var(--rust)]/30 rounded-full px-3.5 py-1.5 shadow-sm whitespace-nowrap">{label}</span>
      </div>
    </div>
  );
}

function PaywallModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-6" onClick={onClose}>
      <div className="relative w-full max-w-5xl bg-[var(--cream)] rounded-3xl p-8 my-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-5 right-5 text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className="text-center mb-6">
          <h2 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Upgrade to unlock this</h2>
          <p className="text-sm text-[var(--ink-soft)]">Pick a plan to see full visibility scores and start engaging on citations.</p>
        </div>
        <PricingCards compact />
      </div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-[var(--line-soft)] text-[var(--ink-soft)]",
  review: "bg-[var(--rust-wash)] text-[var(--rust-deep)]",
  published: "bg-[var(--olive-wash)] text-[var(--olive)]",
  scheduled: "bg-blue-500/10 text-blue-700",
  writing: "bg-purple-500/10 text-purple-700",
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
  const [allBrands, setAllBrands] = useState<{ id: string; name: string; domain: string }[]>([]);
  const [loadingBrand, setLoadingBrand] = useState(true);
  const [loadingResults, setLoadingResults] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [scores, setScores] = useState<VisibilityScore[]>([]);
  const [gaps, setGaps] = useState<GapItem[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [scanned, setScanned] = useState(false);
  const [selectedEngines] = useState<AIEngine[]>(["chatgpt", "gemini", "google"]);
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

  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTasks, setAdminTasks] = useState<AdminTask[]>([]);
  const [adminSelectedEmail, setAdminSelectedEmail] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminView, setAdminView] = useState<"tasks" | "feedback">("tasks");
  const [adminFeedback, setAdminFeedback] = useState<AdminFeedback[]>([]);
  const [adminFeedbackLoaded, setAdminFeedbackLoaded] = useState(false);
  const [adminFeedbackLoading, setAdminFeedbackLoading] = useState(false);

  // Agent state
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentInput, setAgentInput] = useState("");
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentInitialized, setAgentInitialized] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [expandedCitationDomains, setExpandedCitationDomains] = useState<Set<string>>(new Set());
  const [engageItem, setEngageItem] = useState<{ url: string; promptText: string; engine: string } | null>(null);
  const [engageDraft, setEngageDraft] = useState("");
  const [engageGenerating, setEngageGenerating] = useState(false);
  const [engageCopied, setEngageCopied] = useState(false);
  const [taskSubmitting, setTaskSubmitting] = useState(false);
  const [taskSubmitted, setTaskSubmitted] = useState(false);
  const [engageTasks, setEngageTasks] = useState<EngageTask[]>([]);
  const [credits, setCredits] = useState<{ plan: string | null; balance: number } | null>(null);
  // Default true (fail-safe: blur first) so free-tier data never flashes unblurred
  // before the /api/credits fetch resolves.
  const [isFreeTier, setIsFreeTier] = useState(true);
  const [confirmingSubscription, setConfirmingSubscription] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const openPaywall = () => setShowPaywallModal(true);
  const [showBuyCreditsModal, setShowBuyCreditsModal] = useState(false);
  const [buyCreditsQty, setBuyCreditsQty] = useState(50);
  const [buyCreditsSubmitting, setBuyCreditsSubmitting] = useState(false);
  const [analyticsUsage, setAnalyticsUsage] = useState<{ quota: number; totalEvents: number; overageEvents: number; creditsCharged: number; ingestionPaused: boolean } | null>(null);
  const [deleteBrandTarget, setDeleteBrandTarget] = useState<{ id: string; name: string; domain: string } | null>(null);
  const [deleteBrandConfirmText, setDeleteBrandConfirmText] = useState("");
  const [deletingBrand, setDeletingBrand] = useState(false);

  const deleteBrand = () => {
    if (!deleteBrandTarget) return;
    const target = deleteBrandTarget;
    setDeletingBrand(true);
    fetch(`/api/brand?id=${target.id}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((d) => {
        if (!d.success) return;
        // Deleting a brand other than the currently active one — just drop it
        // from the switcher, no need to navigate away.
        if (brand && target.id !== brand.id) {
          setAllBrands((prev) => prev.filter((b) => b.id !== target.id));
          setDeleteBrandTarget(null);
          return;
        }
        const remaining = allBrands.filter((b) => b.id !== target.id);
        window.location.href = remaining.length ? `/dashboard?brandId=${remaining[0].id}` : "/setup";
      })
      .finally(() => setDeletingBrand(false));
  };

  const buyCredits = () => {
    setBuyCreditsSubmitting(true);
    fetch("/api/dodo/credits-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity: buyCreditsQty, cancelPath: window.location.pathname + window.location.search }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.url) window.location.href = d.url; })
      .finally(() => setBuyCreditsSubmitting(false));
  };

  // Shared Web+LLM Analytics monthly-usage widget, shown on both tabs since
  // the quota (and any overage) is combined across both event types.
  const renderAnalyticsUsageBar = () => {
    if (!analyticsUsage) return null;
    const { quota, totalEvents, overageEvents, creditsCharged, ingestionPaused } = analyticsUsage;
    const pct = quota > 0 ? Math.min(100, Math.round((totalEvents / quota) * 100)) : 0;
    return (
      <div className="panel rounded-xl px-5 py-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-[var(--ink)]">Monthly usage</p>
          <p className="text-xs text-[var(--ink-faint)]">
            {totalEvents.toLocaleString()} / {quota.toLocaleString()} events
            {overageEvents > 0 && ` · +${overageEvents.toLocaleString()} over (${creditsCharged} credits)`}
          </p>
        </div>
        <div className="h-1.5 rounded-full bg-[var(--line-soft)] overflow-hidden">
          <div className={`h-full rounded-full ${overageEvents > 0 ? "bg-[var(--rust)]" : "bg-[var(--ink-faint)]"}`} style={{ width: `${pct}%` }} />
        </div>
        {ingestionPaused && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--rust-wash)] px-3 py-2">
            <p className="text-xs text-[var(--rust-deep)] font-medium">Analytics tracking is paused — out of credits to cover this month&apos;s overage.</p>
            <button onClick={() => setShowBuyCreditsModal(true)} className="text-xs font-semibold text-[var(--rust-deep)] underline shrink-0">Buy credits</button>
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);
  const [taskFilter, setTaskFilter] = useState<"pending" | "completed" | "failed">("pending");

  // Standalone Reddit-order form (Tasks tab) — independent of the Citations Engage Panel
  const [redditOrderUrl, setRedditOrderUrl] = useState("");
  const [redditOrderService, setRedditOrderService] = useState<RedditServiceType>("post_upvote");
  const [redditOrderQty, setRedditOrderQty] = useState(10);
  const [redditOrderSpeed, setRedditOrderSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [redditOrderComment, setRedditOrderComment] = useState("");
  const [redditOrderSubmitting, setRedditOrderSubmitting] = useState(false);
  const [redditOrderError, setRedditOrderError] = useState("");
  const [redditOrderSuccess, setRedditOrderSuccess] = useState("");
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
  const [citationsStale, setCitationsStale] = useState(false);
  const [refreshingCitations, setRefreshingCitations] = useState(false);
  // Prompts tab state
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedCitationDomain, setSelectedCitationDomain] = useState<string | null>(null);

  // Browser back button exits prompt detail view instead of leaving the page
  useEffect(() => {
    const handler = () => {
      setSelectedPromptId((cur) => { if (cur) { setSelectedCitationDomain(null); return null; } return cur; });
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  const [selectedResponseResult, setSelectedResponseResult] = useState<ScanResult | null>(null);
  const [promptSearch, setPromptSearch] = useState("");
  const [promptStatusFilter, setPromptStatusFilter] = useState<"active" | "paused">("active");
  const [newPromptText, setNewPromptText] = useState("");
  const [togglingPromptId, setTogglingPromptId] = useState<string | null>(null);
  const [suggestingPrompts, setSuggestingPrompts] = useState(false);
  const [promptSuggestions, setPromptSuggestions] = useState<{ id: string; text: string; category: string }[]>([]);
  const [promptSuggestionsLoaded, setPromptSuggestionsLoaded] = useState(false);
  const [addingSuggestionText, setAddingSuggestionText] = useState<string | null>(null);
  const [editingCompetitors, setEditingCompetitors] = useState(false);
  const [competitorDraft, setCompetitorDraft] = useState<string[]>([]);
  const [newCompetitorInput, setNewCompetitorInput] = useState("");
  const [savingCompetitors, setSavingCompetitors] = useState(false);
  const [suggestedCompetitors, setSuggestedCompetitors] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [addingPrompt, setAddingPrompt] = useState(false);
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
  const agentEndRef = useRef<HTMLDivElement>(null);
  const agentMessagesRef = useRef<AgentMessage[]>([]);
  agentMessagesRef.current = agentMessages;

  // Load chat history from DB when brand loads
  useEffect(() => {
    if (!brand?.id) return;
    fetch(`/api/agent/chats?brandId=${brand.id}`)
      .then((r) => r.json())
      .then((d) => { if (d.chats) setChatSessions(d.chats); })
      .catch(() => {});
  }, [brand?.id]);

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

  // Feedback state
  const [feedbackSubmissions, setFeedbackSubmissions] = useState<{ id: string; category: string; title: string; description: string; created_at: string }[]>([]);
  const [feedbackLoaded, setFeedbackLoaded] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState("");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackDescription, setFeedbackDescription] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackError, setFeedbackError] = useState("");

  // Web/LLM analytics state
  const [webAnalyticsData, setWebAnalyticsData] = useState<WebAnalyticsData | null>(null);
  const [webAnalyticsLoaded, setWebAnalyticsLoaded] = useState(false);
  const [webAnalyticsFetching, setWebAnalyticsFetching] = useState(false);
  const [webAnalyticsRefreshKey, setWebAnalyticsRefreshKey] = useState(0);
  const [llmAnalyticsData, setLlmAnalyticsData] = useState<LlmAnalyticsData | null>(null);
  const [llmAnalyticsLoaded, setLlmAnalyticsLoaded] = useState(false);
  const [llmAnalyticsFetching, setLlmAnalyticsFetching] = useState(false);
  const [llmAnalyticsRefreshKey, setLlmAnalyticsRefreshKey] = useState(0);
  const [sendingTestEvent, setSendingTestEvent] = useState(false);
  const [testEventError, setTestEventError] = useState("");
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [webAnalyticsDays, setWebAnalyticsDays] = useState(30);
  const [llmAnalyticsDays, setLlmAnalyticsDays] = useState(30);
  const [websiteIdModal, setWebsiteIdModal] = useState<"web" | "bot" | null>(null);
  const [copiedWebsiteId, setCopiedWebsiteId] = useState(false);
  const [webDetailsExpanded, setWebDetailsExpanded] = useState(true);
  const [llmDetailsExpanded, setLlmDetailsExpanded] = useState(true);

  useEffect(() => {
    const savedTab = sessionStorage.getItem("dashTab");
    if (savedTab) setActiveTab(savedTab as Tab);

    createSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data: { user } }) => setUserEmail(user?.email ?? ""));

    fetch("/api/admin/check").then((r) => r.json()).then((d) => setIsAdmin(!!d.isAdmin));

    fetch("/api/reddit/connection").then((r) => r.json()).then((d) => {
      setRedditConnected(d.connected);
      setRedditUsername(d.username);
    });

    const fetchCredits = () =>
      fetch("/api/credits").then((r) => r.json()).then((d) => {
        if (typeof d.balance === "number") setCredits({ plan: d.plan ?? null, balance: d.balance });
        setIsFreeTier(!!d.isFree);
        return d;
      });

    fetchCredits().then((d) => {
      // Dodo's webhook that activates the plan has repeatedly failed to arrive
      // on the first real attempt, so don't just wait on it — actively ask
      // Dodo directly whether this user has an active subscription on every
      // tick, which self-heals immediately instead of depending on webhook
      // retries or the slower reconcile-dodo-subscriptions cron (every 10min).
      if (searchParams.get("subscription") === "success" && d.isFree) {
        setConfirmingSubscription(true);
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          fetch("/api/dodo/reconcile-me", { method: "POST" })
            .then((r) => r.json())
            .catch(() => null)
            .then(() => fetchCredits())
            .then((d2) => {
              if (!d2.isFree || attempts >= 10) {
                clearInterval(poll);
                setConfirmingSubscription(false);
              }
            });
        }, 3000);
      }

      // Credit top-ups are granted by Dodo automatically on successful
      // payment (same as plan credits) — just refresh a few times so the
      // sidebar balance updates without a manual reload.
      if (searchParams.get("credits") === "success") {
        let attempts = 0;
        const poll = setInterval(() => {
          attempts++;
          fetchCredits().finally(() => { if (attempts >= 5) clearInterval(poll); });
        }, 2000);
      }
    });


    const brandId = searchParams.get("brandId");

    fetch("/api/brands").then((r) => r.json()).then((d) => setAllBrands(d.brands ?? []));

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
          fetch(`/api/tasks?brandId=${id}`).then((r) => r.json()).then((d) => setEngageTasks((d.tasks ?? []).map(mapEngageTask)));
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
          // A scan just finished somewhere (scheduled run, another tab/device).
          // If it's the one this session is already watching, runScan's own
          // poll resolves it live and clears this flag right after; otherwise
          // surface a manual refresh prompt on the Citations tab.
          setCitationsStale(true);
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

  // Load all tasks for admin when tab opens
  useEffect(() => {
    if (activeTab !== "admin" || !isAdmin || adminTasks.length > 0) return;
    setAdminLoading(true);
    fetch("/api/admin/tasks")
      .then((r) => r.json())
      .then((d) => { if (d.tasks) setAdminTasks(d.tasks); })
      .finally(() => setAdminLoading(false));
  }, [activeTab, isAdmin]);

  // Load all feedback submissions for admin when the Feedback sub-view opens
  useEffect(() => {
    if (activeTab !== "admin" || !isAdmin || adminView !== "feedback" || adminFeedbackLoaded) return;
    setAdminFeedbackLoading(true);
    fetch("/api/admin/feedback")
      .then((r) => r.json())
      .then((d) => setAdminFeedback(d.submissions ?? []))
      .finally(() => { setAdminFeedbackLoading(false); setAdminFeedbackLoaded(true); });
  }, [activeTab, isAdmin, adminView, adminFeedbackLoaded]);

  // Load this user's past feedback submissions when the tab opens
  useEffect(() => {
    if (activeTab !== "feedback" || feedbackLoaded) return;
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((d) => setFeedbackSubmissions(d.submissions ?? []))
      .finally(() => setFeedbackLoaded(true));
  }, [activeTab, feedbackLoaded]);

  // Load persisted discovery-prompt suggestions when the Prompts tab opens —
  // a pure DB read after the first-ever visit, no LLM call.
  useEffect(() => {
    if (activeTab !== "results" || !brand || promptSuggestionsLoaded) return;
    loadPromptSuggestions();
  }, [activeTab, brand, promptSuggestionsLoaded]);

  // Load web analytics when the tab opens, the date range changes, or a test event was sent
  useEffect(() => {
    if (activeTab !== "webAnalytics" || !brand) return;
    setWebAnalyticsFetching(true);
    fetch(`/api/analytics/web?brandId=${brand.id}&days=${webAnalyticsDays}`)
      .then((r) => r.json())
      .then((d) => { if (d.stats) setWebAnalyticsData(d); })
      .finally(() => { setWebAnalyticsLoaded(true); setWebAnalyticsFetching(false); });
  }, [activeTab, brand, webAnalyticsDays, webAnalyticsRefreshKey]);

  // Load LLM (AI bot) analytics when the tab opens, the date range changes, or a test event was sent
  useEffect(() => {
    if (activeTab !== "llmAnalytics" || !brand) return;
    setLlmAnalyticsFetching(true);
    fetch(`/api/analytics/bot?brandId=${brand.id}&days=${llmAnalyticsDays}`)
      .then((r) => r.json())
      .then((d) => { if (d.stats) setLlmAnalyticsData(d); })
      .finally(() => { setLlmAnalyticsLoaded(true); setLlmAnalyticsFetching(false); });
  }, [activeTab, brand, llmAnalyticsDays, llmAnalyticsRefreshKey]);

  // Combined Web+LLM Analytics usage-vs-quota, shown on both analytics tabs
  useEffect(() => {
    if ((activeTab !== "webAnalytics" && activeTab !== "llmAnalytics") || !brand) return;
    fetch(`/api/analytics/usage?brandId=${brand.id}`)
      .then((r) => r.json())
      .then((d) => { if (typeof d.quota === "number") setAnalyticsUsage(d); });
  }, [activeTab, brand, webAnalyticsRefreshKey, llmAnalyticsRefreshKey]);

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
    const promptIds = brand.trackedPrompts.filter((p) => p.status !== "paused").map((p) => p.id);
    const total = promptIds.length * selectedEngines.length;
    setScanProgress({ done: 0, total });

    try {
      // Fire the scan — returns immediately with a scanRunId
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, engines: selectedEngines, promptIds }),
      });
      const triggerData = await res.json();
      if (!res.ok || !triggerData.scanRunId) throw new Error(triggerData.error ?? "Failed to start scan");

      const { scanRunId } = triggerData;
      const seen = new Set<string>();
      const accumulated: ScanResult[] = [];

      // Poll every 2.5s for results written by Inngest
      await new Promise<void>((resolve, reject) => {
        const TIMEOUT = 20 * 60 * 1000; // 20 min hard stop
        const deadline = setTimeout(() => { clearInterval(poll); reject(new Error("Scan timed out")); }, TIMEOUT);

        const poll = setInterval(async () => {
          try {
            const statusRes = await fetch(`/api/scan/results?brandId=${brand.id}&runId=${scanRunId}`);
            if (!statusRes.ok) return;
            const { results: fresh, scores: finalScores, overallScore: finalScore, completed } = await statusRes.json();

            // Accumulate only new results
            let added = false;
            for (const r of (fresh ?? []) as ScanResult[]) {
              const key = `${r.promptId}::${r.engine}`;
              if (!seen.has(key)) {
                seen.add(key);
                accumulated.push(r);
                added = true;
              }
            }
            if (added) {
              setResults([...accumulated]);
              setScanned(true);
              setScanProgress({ done: accumulated.length, total });
            }

            if (completed) {
              clearInterval(poll);
              clearTimeout(deadline);
              if (finalScores?.length) setScores(finalScores);
              if (finalScore !== undefined) setOverallScore(finalScore);
              setGaps(computeGaps(accumulated, brand));
              if (brand.id) fetch(`/api/history?brandId=${brand.id}`).then((r) => r.json()).then((d) => setScanHistory(d.runs ?? []));
              setCitationsStale(false);
              resolve();
            }
          } catch (e) {
            console.error("[poll] error:", e);
          }
        }, 2500);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }

  async function saveOrUpdateChat(msgs: AgentMessage[], currentChatId: string | null): Promise<string | null> {
    if (!brand?.id) return currentChatId;
    const userMsgs = msgs.filter((m) => m.role === "user");
    if (!userMsgs.length) return currentChatId;
    const title = userMsgs[0].content.slice(0, 45) + (userMsgs[0].content.length > 45 ? "…" : "");
    try {
      if (!currentChatId) {
        const res = await fetch("/api/agent/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ brandId: brand.id, title, messages: msgs }),
        });
        if (!res.ok) return null;
        const d = await res.json();
        return d.id as string;
      } else {
        await fetch(`/api/agent/chats/${currentChatId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: msgs, title }),
        });
        return currentChatId;
      }
    } catch { return currentChatId; }
  }

  function startNewChat() {
    setActiveChatId(null);
    setAgentMessages([]);
    setAgentInitialized(false);
  }

  async function loadChatSession(session: ChatSession) {
    const res = await fetch(`/api/agent/chats/${session.id}`);
    if (!res.ok) return;
    const d = await res.json();
    setActiveChatId(session.id);
    setAgentMessages(d.chat?.messages ?? []);
    setAgentInitialized(true);
  }

  async function sendAgentMessage() {
    if (!agentInput.trim() || agentLoading || !brand) return;
    const userMsg: AgentMessage = { role: "user", content: agentInput.trim() };
    const newMessages = [...agentMessages, userMsg];
    setAgentMessages(newMessages);
    setAgentInput("");
    setAgentLoading(true);

    // Build per-prompt breakdown for richer context
    const promptBreakdown = brand.trackedPrompts.map((p) => {
      const pr = results.filter((r) => r.promptId === p.id);
      return {
        text: p.text,
        chatgpt: pr.find((r) => r.engine === "chatgpt")?.brandMentioned ?? null,
        gemini: pr.find((r) => r.engine === "gemini")?.brandMentioned ?? null,
        google: pr.find((r) => r.engine === "google")?.brandMentioned ?? null,
      };
    });

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages.slice(-20),
          scanContext: {
            brandName: brand.name,
            domain: brand.domain,
            niche: brand.niche,
            overallScore,
            scores,
            gaps,
            totalPrompts: brand.trackedPrompts.length,
            competitors: brand.competitors,
            promptBreakdown,
          },
        }),
      });

      if (!res.ok) throw new Error("Agent failed");
      const d = await res.json();
      const finalMessages: AgentMessage[] = [...newMessages, { role: "assistant", content: d.reply }];
      setAgentMessages(finalMessages);

      // Auto-save after each reply
      if (brand?.id) {
        const savedId = await saveOrUpdateChat(finalMessages, activeChatId);
        if (savedId) {
          if (!activeChatId) {
            setActiveChatId(savedId);
            const title = userMsg.content.slice(0, 45) + (userMsg.content.length > 45 ? "…" : "");
            const now = new Date().toISOString();
            setChatSessions((prev) => [{ id: savedId, title, created_at: now, updated_at: now }, ...prev].slice(0, 30));
          }
        }
      }
    } catch {
      setAgentMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't reach the server. Try again in a moment." }]);
    } finally {
      setAgentLoading(false);
    }
  }

  function navTo(tab: Tab) {
    setActiveTab(tab);
    setSidebarOpen(false);
    sessionStorage.setItem("dashTab", tab);
  }

  async function togglePromptStatus(p: { id: string; status?: string }) {
    if (togglingPromptId) return;
    setTogglingPromptId(p.id);
    const next = p.status === "paused" ? "active" : "paused";
    try {
      const res = await fetch(`/api/prompts/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (res.status === 402) { openPaywall(); return; }
      const data = await res.json();
      if (data.prompt) {
        setBrand((b) => b ? {
          ...b,
          trackedPrompts: b.trackedPrompts.map((x) =>
            x.id === p.id ? { ...x, status: data.prompt.status, cadence: data.prompt.cadence ?? x.cadence } : x
          ),
        } : b);
      }
    } finally {
      setTogglingPromptId(null);
    }
  }

  async function refreshCitations() {
    if (!brand || refreshingCitations) return;
    setRefreshingCitations(true);
    try {
      const d = await fetch(`/api/scan/results?brandId=${brand.id}`).then((r) => r.json());
      if (d.results?.length) {
        setResults(d.results);
        setScanned(true);
        if (d.scores?.length) setScores(d.scores);
        if (d.overallScore !== undefined) setOverallScore(d.overallScore);
      }
      setCitationsStale(false);
    } finally {
      setRefreshingCitations(false);
    }
  }

  async function sendTestEvent(type: "web" | "bot") {
    if (!brand || sendingTestEvent) return;
    setSendingTestEvent(true);
    setTestEventError("");
    try {
      const res = await fetch("/api/analytics/test-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, type }),
      });
      if (res.ok) {
        if (type === "web") setWebAnalyticsRefreshKey((k) => k + 1);
        else setLlmAnalyticsRefreshKey((k) => k + 1);
      } else {
        const d = await res.json().catch(() => ({}));
        setTestEventError(d.error ?? "Failed to send test event");
      }
    } finally {
      setSendingTestEvent(false);
    }
  }

  async function submitFeedback() {
    if (feedbackSubmitting) return;
    setFeedbackError("");
    if (!feedbackCategory) { setFeedbackError("Select a category"); return; }
    if (!feedbackTitle.trim()) { setFeedbackError("Title is required"); return; }
    if (!feedbackDescription.trim()) { setFeedbackError("Description is required"); return; }

    setFeedbackSubmitting(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: feedbackCategory, title: feedbackTitle.trim(), description: feedbackDescription.trim() }),
      });
      const d = await res.json();
      if (res.ok && d.submission) {
        setFeedbackSubmissions((prev) => [d.submission, ...prev]);
        setFeedbackCategory("");
        setFeedbackTitle("");
        setFeedbackDescription("");
      } else {
        setFeedbackError(d.error ?? "Failed to submit feedback. Try again.");
      }
    } catch {
      setFeedbackError("Failed to submit feedback. Try again.");
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  // Loads whatever's already persisted (or lazily generates the first-ever
  // batch server-side) — no LLM call on repeat visits.
  async function loadPromptSuggestions() {
    if (!brand) return;
    try {
      const res = await fetch(`/api/prompts/suggest?brandId=${brand.id}`);
      const data = await res.json();
      setPromptSuggestions(data.suggestions ?? []);
    } finally {
      setPromptSuggestionsLoaded(true);
    }
  }

  // Explicit "Suggest new ones" — replaces the whole persisted batch.
  async function regeneratePromptSuggestions() {
    if (!brand || suggestingPrompts) return;
    setSuggestingPrompts(true);
    try {
      const res = await fetch("/api/prompts/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id }),
      });
      const data = await res.json();
      setPromptSuggestions(data.suggestions ?? []);
    } finally {
      setSuggestingPrompts(false);
    }
  }

  async function addManualPrompt() {
    if (!brand || !newPromptText.trim() || addingPrompt) return;
    setAddingPrompt(true);
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, text: newPromptText.trim(), category: "Commercial" }),
      });
      if (res.status === 402) { openPaywall(); return; }
      const data = await res.json();
      if (data.prompt) {
        setBrand((b) => b ? { ...b, trackedPrompts: [...b.trackedPrompts, data.prompt] } : b);
        setNewPromptText("");
      }
    } finally {
      setAddingPrompt(false);
    }
  }

  async function addSuggestedPrompt(s: { id: string; text: string; category: string }) {
    if (!brand || addingSuggestionText) return;
    setAddingSuggestionText(s.text);
    try {
      const res = await fetch("/api/prompts/suggest/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, suggestionId: s.id, text: s.text, category: s.category }),
      });
      if (res.status === 402) { openPaywall(); return; }
      const data = await res.json();
      if (data.prompt) {
        setBrand((b) => b ? { ...b, trackedPrompts: [...b.trackedPrompts, data.prompt] } : b);
        // Swap the accepted suggestion for its backfilled replacement (if the
        // model produced one) so the pool stays at a steady size instead of shrinking.
        setPromptSuggestions((prev) => {
          const withoutAccepted = prev.filter((x) => x.id !== s.id);
          return data.replacement ? [...withoutAccepted, data.replacement] : withoutAccepted;
        });
      }
    } finally {
      setAddingSuggestionText(null);
    }
  }

  async function submitRedditOrder() {
    if (isFreeTier) { openPaywall(); return; }
    setRedditOrderError("");
    setRedditOrderSuccess("");

    if (!/^https?:\/\/(www\.)?reddit\.com\//i.test(redditOrderUrl.trim())) {
      setRedditOrderError("Enter a valid reddit.com link");
      return;
    }
    if (redditOrderService === "custom_comments" && !redditOrderComment.trim()) {
      setRedditOrderError("Enter the comment text to post");
      return;
    }

    setRedditOrderSubmitting(true);
    try {
      const res = await fetch("/api/reddit-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: brand?.id,
          url: redditOrderUrl.trim(),
          serviceType: redditOrderService,
          quantity: redditOrderService === "custom_comments" ? undefined : redditOrderQty,
          commentText: redditOrderService === "custom_comments" ? redditOrderComment.trim() : undefined,
          speed: redditOrderSpeed,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        if (d.task) setEngageTasks((prev) => [mapEngageTask(d.task), ...prev]);
        const spent = REDDIT_SERVICE_META[redditOrderService].creditsPerUnit * (redditOrderService === "custom_comments" ? 1 : redditOrderQty);
        setCredits((prev) => (prev ? { ...prev, balance: prev.balance - spent } : prev));
        setRedditOrderSuccess(d.queued ? "High demand for this link right now — we'll submit your order automatically." : "Order submitted.");
        setRedditOrderUrl("");
        setRedditOrderComment("");
      } else {
        setRedditOrderError(d.error ?? "Failed to submit order");
      }
    } catch {
      setRedditOrderError("Failed to submit order. Try again.");
    } finally {
      setRedditOrderSubmitting(false);
    }
  }

  async function signOut() {
    await createSupabaseBrowserClient().auth.signOut();
    router.push("/auth");
  }

  if (loadingBrand) {
    return (
      <div className="min-h-screen bg-[var(--cream)] flex items-center justify-center">
        <span className="w-7 h-7 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!brand) return null;

  const newThreadCount = redditThreads.filter((t) => t.status === "new").length;
  const brandInitial = brand.name[0]?.toUpperCase() ?? "B";

  // Citations derived data
  const engagedUrls = new Set(engageTasks.map((t) => t.url));
  const redditOrderTarget: "post" | "comment" = REDDIT_SERVICE_META[redditOrderService].target;
  const CITATION_BLOCKED = [
    "google.com", "googleapis.com", "googleusercontent.com",
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

  // Same "engagement opportunity" definition as the Citations tab's per-row
  // Engage button: a Reddit citation URL that hasn't already got a task.
  const engagementOpportunityCount = new Set(
    Object.values(citationInstances)
      .flat()
      .filter((item) => getEngagePlatform(item.url) === "reddit" && !engagedUrls.has(item.url))
      .map((item) => item.url)
  ).size;

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
    <div
      className="dashboard-signal flex h-screen overflow-hidden bg-[var(--cream)] text-[var(--ink)]"
      style={signalVars}
    >
      {/* Sidebar — fixed off-canvas drawer below lg, static column at lg+ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[264px] flex flex-col border-r border-[var(--line)] bg-[var(--cream)] px-2 transition-transform duration-200 ease-out motion-reduce:transition-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        } lg:static lg:z-auto lg:translate-x-0 lg:bg-transparent lg:shrink-0 lg:transition-none`}
      >
        <div className="px-3 py-5 flex items-center gap-2 shrink-0">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="10" cy="12.5" r="1.7" fill="var(--rust)" />
            <path d="M6.3 9.3a5.2 5.2 0 0 1 7.4 0" stroke="var(--rust)" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M3.6 6.5a9.2 9.2 0 0 1 12.8 0" stroke="var(--rust)" strokeWidth="1.6" strokeLinecap="round" opacity="0.5" />
          </svg>
          <span className="font-semibold text-[15px] tracking-tight text-[var(--ink)]">RankOnGeo</span>
          <span className="ml-auto text-[10px] font-semibold bg-[var(--line-soft)] text-[var(--ink-faint)] px-1.5 py-0.5 rounded">v2.0</span>
        </div>

        <div className="mx-1 mb-6 shrink-0 relative">
          <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-[1.2px] px-2 mb-1.5">Tracking</p>
          <button
            onClick={() => setShowBrandDropdown((v) => !v)}
            className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-[10px] px-2.5 py-2 flex items-center gap-2 hover:bg-[var(--line-soft)] transition-colors"
          >
            <div className="w-5 h-5 rounded-[6px] bg-[var(--rust-wash)] text-[var(--rust-deep)] flex items-center justify-center text-[11px] font-bold shrink-0">{brandInitial}</div>
            <div className="text-left min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[var(--ink)] truncate leading-tight">{brand.name}</p>
              <p className="text-[10.5px] text-[var(--ink-faint)] leading-tight truncate">{brand.domain}</p>
            </div>
            <svg className={`w-2.5 h-2.5 text-[var(--ink-faint)] shrink-0 transition-transform duration-150 ${showBrandDropdown ? "rotate-180" : ""}`} fill="none" viewBox="0 0 10 10" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.3} d="M2.5 4L5 6.5L7.5 4" />
            </svg>
          </button>

          {showBrandDropdown && (() => {
            const brandLimit = isAdmin ? Infinity : credits?.plan ? BRAND_LIMITS[credits.plan] ?? FREE_BRAND_LIMIT : FREE_BRAND_LIMIT;
            const atLimit = allBrands.length >= brandLimit;
            return (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowBrandDropdown(false)} />
              <div className="absolute left-0 right-0 top-full mt-1.5 z-20 bg-[var(--surface)] rounded-xl shadow-lg border border-[var(--line)] overflow-hidden max-h-80 overflow-y-auto">
                {allBrands.map((b) => {
                  const isCurrent = b.id === brand.id;
                  return (
                    <div
                      key={b.id}
                      className={`w-full px-3 py-2.5 flex items-center gap-3 transition-colors ${isCurrent ? "bg-[var(--line-soft)]" : "hover:bg-[var(--line-soft)]"}`}
                    >
                      <button
                        onClick={() => {
                          setShowBrandDropdown(false);
                          if (!isCurrent) window.location.href = `/dashboard?brandId=${b.id}`;
                        }}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <div className="w-7 h-7 rounded-lg bg-[var(--rust-wash)] text-[var(--rust-deep)] flex items-center justify-center text-xs font-bold shrink-0">{b.name[0]?.toUpperCase() ?? "B"}</div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[var(--ink)] truncate">{b.name}</p>
                          <p className="text-[9px] text-[var(--ink-faint)] truncate">{isCurrent ? "Current brand" : b.domain}</p>
                        </div>
                      </button>
                      {isCurrent && <div className="w-1.5 h-1.5 rounded-full bg-[var(--olive)] shrink-0" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteBrandConfirmText("");
                          setDeleteBrandTarget({ id: b.id, name: b.name, domain: b.domain });
                        }}
                        title="Delete this brand"
                        className="shrink-0 p-1 rounded-md text-[var(--ink-faint)] hover:text-red-600 hover:bg-red-500/10 transition-colors"
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
                <button
                  onClick={() => {
                    setShowBrandDropdown(false);
                    if (atLimit) { openPaywall(); return; }
                    router.push("/setup");
                  }}
                  className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-[var(--line-soft)] transition-colors group border-t border-[var(--line)]"
                >
                  <div className="w-7 h-7 rounded-lg border-2 border-dashed border-[var(--line)] flex items-center justify-center shrink-0 transition-colors">
                    <svg className="w-3.5 h-3.5 text-[var(--ink-faint)] group-hover:text-[var(--ink-soft)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <span className="text-xs font-medium text-[var(--ink-soft)] group-hover:text-[var(--ink)] transition-colors">{atLimit ? "Upgrade to add another brand" : "Add another brand"}</span>
                </button>
              </div>
            </>
            );
          })()}
        </div>

        <nav className="flex-1 px-1 overflow-y-auto space-y-5">
          <div>
            <NavItem label="Agent" active={activeTab === "agent"} onClick={() => navTo("agent")} />
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest px-3 mb-1.5">Measure</p>
            <div className="space-y-0.5">
              <NavItem label="Overview" active={activeTab === "overview"} onClick={() => navTo("overview")} />
              <NavItem label="Engines" active={activeTab === "history"} onClick={() => navTo("history")} />
              <NavItem label="Prompts" active={activeTab === "results"} onClick={() => navTo("results")} />
              <NavItem label="Citations" active={activeTab === "citations"} onClick={() => navTo("citations")} badge={engagementOpportunityCount || undefined} />
              <NavItem label="Competitors" active={activeTab === "competitors"} onClick={() => navTo("competitors")} />
              <NavItem label="Web Analytics" active={activeTab === "webAnalytics"} onClick={() => navTo("webAnalytics")} />
              <NavItem label="LLM Analytics" active={activeTab === "llmAnalytics"} onClick={() => navTo("llmAnalytics")} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest px-3 mb-1.5">Create</p>
            <div className="space-y-0.5">
              <NavItem label="Research" active={activeTab === "gaps"} onClick={() => navTo("gaps")} badge={gaps.length || undefined} />
              <NavItem label="Articles" active={activeTab === "articles"} onClick={() => navTo("articles")} badge={draftCount || undefined} />
              <NavItem label="Tasks" active={activeTab === "tasks"} onClick={() => navTo("tasks")} badge={engageTasks.filter(t => t.status === "pending" || t.status === "queued" || t.status === "running").length || undefined} />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest px-3 mb-1.5">Distribute</p>
            <div className="space-y-0.5">
              <NavItem label="Publishing" active={activeTab === "publishing"} onClick={() => navTo("publishing")} />

            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest px-3 mb-1.5">On Page</p>
            <div className="space-y-0.5">
              <NavItem label="Alerts" active={activeTab === "alerts"} onClick={() => navTo("alerts")} />
              <NavItem label="Feedback" active={activeTab === "feedback"} onClick={() => navTo("feedback")} />
            </div>
          </div>

          {isAdmin && (
            <div>
              <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest px-3 mb-1.5">Admin</p>
              <div className="space-y-0.5">
                <NavItem label="Admin" active={activeTab === "admin"} onClick={() => navTo("admin")} badge={adminTasks.filter(t => t.status === "pending").length || undefined} />
                <NavItem label="Blog Studio" active={false} onClick={() => { window.location.href = "/admin/blog"; }} />
              </div>
            </div>
          )}
        </nav>

        <div className="mx-1 mb-3 mt-3 shrink-0 pt-3 border-t border-[var(--line)]">
          {credits && (
            <button
              onClick={() => setShowBuyCreditsModal(true)}
              className="mb-2 w-full flex items-center justify-between rounded-[10px] bg-[var(--rust-wash)] px-3 py-2 hover:bg-[var(--rust-wash)]/70 transition-colors"
              title="Buy more credits"
            >
              <span className="text-xs font-medium text-[var(--rust-deep)]">Credits</span>
              <span className="flex items-center gap-1.5">
                <span className="font-signal-mono text-xs font-bold text-[var(--rust-deep)]">{credits.balance}</span>
                <svg className="w-3 h-3 text-[var(--rust-deep)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </span>
            </button>
          )}
          <div className="rounded-[10px] px-2 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[var(--rust-wash)] text-[var(--rust-deep)] flex items-center justify-center text-xs font-bold shrink-0">
              {userEmail[0]?.toUpperCase() ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-[var(--ink-soft)] truncate">{userEmail || brand.domain}</p>
              <p className="text-[10px] text-[var(--ink-faint)]">Workspace</p>
            </div>
            <button onClick={signOut} title="Sign out" className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)] transition-colors shrink-0">
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
        <div className="bg-[var(--surface)]/70 backdrop-blur-sm border-b border-[var(--line)] px-4 sm:px-6 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden shrink-0 -ml-1 p-1.5 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="w-5 h-5 rounded bg-[var(--rust-wash)] text-[var(--rust-deep)] flex items-center justify-center text-[10px] font-bold shrink-0">{brandInitial}</div>
            <span className="font-medium text-[var(--ink-soft)] truncate">{brand.domain}</span>
            <span className="text-[var(--ink-faint)] mx-0.5 hidden sm:inline">/</span>
            <span className="text-[var(--ink-faint)] hidden sm:inline whitespace-nowrap">{TAB_LABELS[activeTab]}</span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {selectedEngines.length > 0 && (
              <div className="hidden xl:flex items-center gap-1">
                {selectedEngines.map((e) => (
                  <span
                    key={e}
                    className="cursor-default rounded-full px-2 py-0.5 text-[10px] font-medium text-[var(--ink-soft)] border border-[var(--line)]"
                  >
                    {ENGINE_LABELS[e]}
                  </span>
                ))}
              </div>
            )}
            {/* "Next check in" countdown — shown once scanned, hidden during scan or non-scan tabs */}
            {scanned && !scanning && activeTab !== "tasks" && activeTab !== "articles" && activeTab !== "publishing" && activeTab !== "alerts" && activeTab !== "agent" && activeTab !== "admin" && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--ink-faint)] border border-[var(--line)] rounded-lg px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--olive)] animate-pulse" />
                Next check in: <span className="font-medium text-[var(--ink-soft)]">{nextCheckIn}</span>
              </div>
            )}
            {/* Scan button — hidden on tabs where it doesn't apply */}
            {!scanning && !loadingResults && activeTab !== "tasks" && activeTab !== "articles" && activeTab !== "publishing" && activeTab !== "alerts" && activeTab !== "agent" && activeTab !== "admin" && (
              <button
                onClick={runScan}
                disabled={selectedEngines.length === 0}
                className="flex items-center gap-1.5 bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] px-4 py-1.5 rounded-full text-sm font-semibold transition-colors shadow-[0_8px_20px_-8px_oklch(0.56_0.15_38_/_55%)] whitespace-nowrap"
              >
                {scanned ? "Re-scan" : "Start monitoring"}
              </button>
            )}
            {scanning && (
              <div className="flex items-center gap-1.5 text-xs text-[var(--ink-soft)] border border-[var(--line)] rounded-lg px-3 py-1.5">
                <span className="w-3 h-3 border-2 border-[var(--line)] border-t-transparent rounded-full animate-spin" />
                {scanned ? "Scanning…" : "Running initial scan…"}
              </div>
            )}
            {activeTab === "articles" && (
              <button
                onClick={() => { setNewArticleTopic(""); setShowNewArticleModal(true); }}
                className="flex items-center gap-1.5 bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] px-4 py-1.5 rounded-full text-sm font-semibold transition-colors"
              >
                + New article
              </button>
            )}
            {activeTab === "publishing" && (
              <button onClick={() => { setPublishResult(null); setShowPublishModal(true); }} className="flex items-center gap-1.5 bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] px-4 py-1.5 rounded-full text-sm font-semibold transition-colors">
                ⚡ Publish now
              </button>
            )}
            {activeTab === "agent" && (
              <button
                onClick={startNewChat}
                className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)] px-3 py-1.5 rounded-lg transition-colors"
              >
                + New chat
              </button>
            )}
          </div>
        </div>

        {/* Scrollable content */}
        <div className={`flex-1 overflow-y-auto ${activeTab === "agent" ? "flex flex-col" : "px-4 py-5 sm:px-6 sm:py-6"}`}>
          {error && (
            <div className="px-6 pt-4">
              <div className="bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3 text-sm text-red-700 mb-5">{error}</div>
            </div>
          )}

          {scanning && activeTab !== "agent" && (
            <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl p-8 text-center mb-5">
              <div className="w-7 h-7 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm font-medium text-[var(--ink-soft)]">Scanning AI engines…</p>
              {scanProgress ? (
                <div className="mt-2 w-48 mx-auto">
                  <div className="flex justify-between text-xs text-[var(--ink-faint)] mb-1">
                    <span>{scanProgress.done} of {scanProgress.total} done</span>
                    <span>{Math.round((scanProgress.done / scanProgress.total) * 100)}%</span>
                  </div>
                  <div className="h-1.5 bg-[var(--line-soft)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--rust)] rounded-full transition-all duration-300"
                      style={{ width: `${Math.round((scanProgress.done / scanProgress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--ink-faint)] mt-1">Starting up…</p>
              )}
            </div>
          )}

          {/* OVERVIEW */}
          {activeTab === "overview" && (
            <>
              {!scanned && !scanning && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
              ) : !scanned && !scanning ? (
                <EmptyState label="No scan data yet" sub={`${brand.trackedPrompts.length} prompts ready — click "+ Run scan" to start`} />
              ) : scanned && (
                <div className="flex flex-col gap-6">
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold tracking-[1.4px] uppercase text-[var(--rust)]">Overview</span>
                      <h1 className="font-signal-serif text-[40px] leading-none text-[var(--ink)]">AI Visibility</h1>
                      {overallScore !== null && (
                        <p className="text-[15px] text-[var(--ink-soft)]">
                          Visibility up to {isFreeTier ? <BlurInline onUnlock={openPaywall}>{decoyPct(brand.id ?? brand.name)}%</BlurInline> : `${overallScore}%`} composite, across {scores.map((s) => ENGINE_LABELS[s.engine]).join(", ")}.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-3.5 bg-[var(--surface)] border border-[var(--line)] rounded-[20px] p-7">
                    {(() => {
                      const shownScore = isFreeTier ? decoyPct(brand.id ?? brand.name) : overallScore ?? 0;
                      const ring = (
                        <div className="relative w-[164px] h-[164px]">
                          <svg width="164" height="164" viewBox="0 0 180 180" style={{ transform: "rotate(-90deg)" }}>
                            <circle cx="90" cy="90" r="78" fill="none" stroke="var(--line)" strokeWidth="14" />
                            <circle
                              cx="90" cy="90" r="78" fill="none" stroke="var(--rust)" strokeWidth="14" strokeLinecap="round"
                              strokeDasharray={`${(shownScore / 100) * (2 * Math.PI * 78)} ${2 * Math.PI * 78}`}
                            />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                            <span className="font-signal-serif text-[44px] leading-none text-[var(--ink)]">{shownScore}%</span>
                            <span className="text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-faint)]">Composite</span>
                          </div>
                        </div>
                      );
                      return isFreeTier ? <BlurBlock onUnlock={openPaywall}>{ring}</BlurBlock> : ring;
                    })()}
                    <span className="text-[13px] text-[var(--ink-soft)]">Composite visibility across {scores.length} AI engine{scores.length === 1 ? "" : "s"}</span>
                    <MiniTrendChart runs={scanHistory} />
                  </div>

                  <div className={`grid gap-5 grid-cols-1 ${scores.length === 3 ? "sm:grid-cols-3" : scores.length === 2 ? "sm:grid-cols-2" : ""}`}>
                    {scores.map((s) => (
                      <div key={s.engine} className="flex flex-col gap-2.5 bg-[var(--surface)] border border-[var(--line)] rounded-[20px] px-6 py-5.5">
                        <span className="text-[13px] font-semibold text-[var(--ink)]">{ENGINE_LABELS[s.engine]}</span>
                        {isFreeTier ? (
                          <BlurInline onUnlock={openPaywall}>
                            <span className="font-signal-mono text-[34px] font-semibold text-[var(--ink)]">{decoyPct(s.engine)}%</span>
                          </BlurInline>
                        ) : (
                          <span className="font-signal-mono text-[34px] font-semibold text-[var(--ink)]">{s.score}%</span>
                        )}
                        {isFreeTier ? (
                          <BlurInline onUnlock={openPaywall}>
                            <span className="text-[12.5px] text-[var(--ink-faint)]">{decoyHash(s.engine) % (s.totalPrompts + 1)}/{s.totalPrompts} prompts · avg #{(1 + (decoyHash(s.engine) % 30) / 10).toFixed(1)}</span>
                          </BlurInline>
                        ) : (
                          <span className="text-[12.5px] text-[var(--ink-faint)]">{s.mentionCount}/{s.totalPrompts} prompts{s.avgRank ? ` · avg #${s.avgRank.toFixed(1)}` : ""}</span>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col bg-[var(--surface)] border border-[var(--line)] rounded-[20px] overflow-hidden">
                    <div className="flex items-center justify-between px-7 py-5 border-b border-[var(--line)]">
                      <span className="text-[15px] font-semibold text-[var(--ink)]">Tracked prompts</span>
                      <span className="font-signal-mono text-xs text-[var(--ink-faint)]">{brand.trackedPrompts.length} total</span>
                    </div>
                    {(() => {
                      const scannedIds = new Set(results.map((r) => r.promptId));
                      const rows = brand.trackedPrompts.filter((p) => scannedIds.has(p.id));
                      if (rows.length === 0) return <div className="px-7 py-6 text-sm text-[var(--ink-faint)]">No scanned prompts yet.</div>;
                      return rows.map((p, i) => {
                        const promptResults = results.filter((r) => r.promptId === p.id);
                        const mentioned = promptResults.filter((r) => r.brandMentioned).length;
                        const visibilityPct = promptResults.length > 0 ? Math.round((mentioned / promptResults.length) * 100) : 0;
                        return (
                          <div key={p.id} className="flex items-center gap-3.5 px-7 py-3 border-b border-[var(--line-soft)] last:border-b-0 hover:bg-[var(--cream)] transition-colors">
                            <span className="font-signal-mono text-xs text-[var(--ink-faint)] w-6 shrink-0">{i + 1}</span>
                            <span className="flex-1 text-sm font-medium text-[var(--ink)] truncate">{p.text}</span>
                            {scores.map((s) => {
                              const r = promptResults.find((res) => res.engine === s.engine);
                              const realDisplay = r?.brandMentioned ? (r.brandRank ? `#${r.brandRank}` : "✓") : "—";
                              const display = isFreeTier ? decoyPick(p.id + s.engine, ["#1", "#2", "✓", "—"] as const) : realDisplay;
                              const mentionedShown = isFreeTier ? display !== "—" : !!r?.brandMentioned;
                              const mark = <span className="font-signal-mono text-[11.5px] font-bold" style={{ color: mentionedShown ? "var(--rust)" : "var(--ink-faint)" }}>{display}</span>;
                              return (
                                <div key={s.engine} className="flex items-center gap-1.5 w-16 shrink-0">
                                  <EngineIcon engine={s.engine} size={14} />
                                  {isFreeTier ? <BlurInline onUnlock={openPaywall}>{mark}</BlurInline> : mark}
                                </div>
                              );
                            })}
                            {isFreeTier ? (
                              <BlurInline onUnlock={openPaywall}>
                                <span className="font-signal-mono text-[13px] font-semibold text-[var(--ink)] w-10 text-right shrink-0 inline-block">{decoyPct(p.id)}%</span>
                              </BlurInline>
                            ) : (
                              <span className="font-signal-mono text-[13px] font-semibold text-[var(--ink)] w-10 text-right shrink-0">{visibilityPct}%</span>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
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
                  <h2 className="text-xl font-bold text-[var(--ink)] mb-1">Engines</h2>
                  <p className="text-sm text-[var(--ink-faint)] mb-5">Overall AI visibility over time — hover for details</p>

                  {(() => {
                    const engineBody = (
                  <>
                  {/* Chart */}
                  {(() => {
                    const runs = [...scanHistory].reverse();
                    const W = 600, H = 160, PAD = { t: 12, r: 16, b: 28, l: 36 };
                    const iW = W - PAD.l - PAD.r, iH = H - PAD.t - PAD.b;
                    const xOf = (i: number) => PAD.l + (runs.length === 1 ? iW / 2 : (i / (runs.length - 1)) * iW);
                    const yOf = (v: number) => PAD.t + iH - (v / 100) * iH;
                    const ENGINE_HEX: Record<string, string> = { chatgpt: "#4f8a5b", claude: "#a8791f", gemini: "#3f6fa8", perplexity: "#2f8f96", google: OLIVE_HEX, grok: "#6b6358" };
                    const hovered = hoveredScanIdx !== null ? runs[hoveredScanIdx] : null;

                    return (
                      <div className="panel rounded-xl p-5 mb-5">
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
                                <line x1={PAD.l} y1={yOf(pct)} x2={W - PAD.r} y2={yOf(pct)} stroke="rgba(48,40,33,0.07)" strokeWidth="1" />
                                <text x={PAD.l - 4} y={yOf(pct) + 4} textAnchor="end" fontSize="9" fill="#96897a">{pct}%</text>
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
                                fill="rgba(177,85,46,0.07)"
                              />
                            )}

                            {/* Composite line */}
                            <polyline
                              points={runs.map((r, i) => `${xOf(i)},${yOf(r.overall_score)}`).join(" ")}
                              fill="none"
                              stroke="#b1552e"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              style={{ filter: "drop-shadow(0 0 6px rgba(177,85,46,0.45))" }}
                            />

                            {/* Hover crosshair */}
                            {hoveredScanIdx !== null && (
                              <line x1={xOf(hoveredScanIdx)} y1={PAD.t} x2={xOf(hoveredScanIdx)} y2={H - PAD.b} stroke="#d0cac3" strokeWidth="1" strokeDasharray="3 2" />
                            )}

                            {/* Dots */}
                            {runs.map((r, i) => (
                              <circle key={i} cx={xOf(i)} cy={yOf(r.overall_score)} r={hoveredScanIdx === i ? 4 : 3} fill="#b1552e" />
                            ))}

                            {/* X-axis labels */}
                            {runs.map((r, i) => {
                              if (runs.length > 6 && i % 2 !== 0) return null;
                              return (
                                <text key={i} x={xOf(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#96897a">
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
                              className="absolute z-10 panel rounded-xl shadow-lg px-3.5 py-3 text-xs pointer-events-none"
                              style={{ top: 8, left: Math.min(Math.max((hoveredScanIdx / Math.max(runs.length - 1, 1)) * 100, 5), 70) + "%", transform: "translateX(-50%)", minWidth: 160 }}
                            >
                              <p className="font-semibold text-[var(--ink)]/80 mb-2">
                                {new Date(hovered.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                              </p>
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-[var(--ink-soft)]">Overall</span>
                                <span className="font-bold text-[var(--rust)] ml-auto">{hovered.overall_score}%</span>
                              </div>
                              {hovered.visibility_scores?.map((s) => (
                                <div key={s.engine} className="flex items-center gap-2 mb-1">
                                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ENGINE_HEX[s.engine] ?? "#888" }} />
                                  <span className="text-[var(--ink-faint)]">{ENGINE_LABELS[s.engine as AIEngine]}</span>
                                  <span className="font-medium text-[var(--ink-soft)] ml-auto">{s.score}%</span>
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
                      <div key={run.id} className="panel rounded-xl px-5 py-4 flex items-center gap-4">
                        {isScanning ? (
                          <div className="w-14 shrink-0 flex items-center">
                            <span className="w-5 h-5 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" />
                          </div>
                        ) : (
                          <div className="font-serif text-2xl font-[400] text-[var(--ink)] w-14 shrink-0">{run.overall_score}%</div>
                        )}
                        <div className="flex-1 min-w-0">
                          {isScanning ? (
                            <p className="text-xs font-medium text-[var(--rust)] mb-1">Scanning in progress…</p>
                          ) : (
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mb-1">
                              {run.visibility_scores?.map((s) => (
                                <span key={s.engine} className="text-xs text-[var(--ink-soft)]">
                                  {ENGINE_LABELS[s.engine as AIEngine]}: <span className="font-semibold text-[var(--ink)]/90">{s.score}%</span>
                                </span>
                              ))}
                            </div>
                          )}
                          <p className="text-xs text-[var(--ink-faint)]">{new Date(run.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          {run.engines.map((e) => <div key={e} className={`w-2 h-2 rounded-full ${ENGINE_COLORS[e as AIEngine] ?? "bg-[var(--line)]"}`} />)}
                        </div>
                      </div>
                    )})}
                  </div>
                  </>
                    );
                    return isFreeTier ? <BlurBlock onUnlock={openPaywall}><LockedSkeleton rows={5} /></BlurBlock> : engineBody;
                  })()}
                </>
              )}
            </>
          )}

          {/* PROMPTS */}
          {activeTab === "results" && (
            <>
              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
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
                const typeColor = promptType.includes("brand") ? "bg-purple-100 text-purple-700" : promptType.includes("competitor") ? "bg-[var(--rust-wash)]/15 text-[var(--rust-deep)]" : "bg-blue-100 text-blue-700";

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
                    <button onClick={() => history.back()} className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]/80 hover:text-[var(--ink)] mb-5 transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                      Back to Prompts
                    </button>

                    {/* PROMPT card */}
                    <div className="panel rounded-2xl p-6 mb-4">
                      <div className="flex flex-col md:flex-row gap-6">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-bold text-[var(--ink-faint)] uppercase tracking-widest mb-3">Prompt</p>
                          <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center gap-1.5 text-xs font-medium bg-[var(--rust)]/10 text-[var(--rust)] px-2.5 py-1 rounded-full border border-[var(--rust)]/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-[var(--rust)]/100" />Active
                            </span>
                            <span className="flex items-center gap-1.5 text-xs text-[var(--ink-soft)]">🌐 Global</span>
                          </div>
                          <h2 className="text-xl font-bold text-[var(--ink)] mb-3">{prompt.text}</h2>
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
                          <div className="bg-[var(--line-soft)] rounded-xl p-3 text-center min-w-[80px]">
                            <p className="text-lg font-bold text-[var(--rust)]">#{avgPos?.toFixed(1) ?? "—"}</p>
                            <p className="text-[10px] text-[var(--ink-faint)] mt-0.5">Avg. Position</p>
                          </div>
                          <div className="bg-[var(--line-soft)] rounded-xl p-3 text-center min-w-[80px]">
                            <div className="flex items-center justify-center gap-0.5 mb-0.5">
                              {[1,2,3,4].map((b) => (
                                <div key={b} className={`w-1.5 rounded-sm ${b <= Math.ceil(visibility/25) ? "h-4 bg-[var(--rust)]/100" : "h-4 bg-[var(--line)]"}`} style={{height: `${8 + b * 3}px`}} />
                              ))}
                            </div>
                            <p className="text-[10px] text-[var(--ink-faint)]">Volume</p>
                          </div>
                          <div className="bg-[var(--line-soft)] rounded-xl p-3 text-center min-w-[80px]">
                            <div className="relative w-12 h-12 mx-auto mb-1">
                              <svg viewBox="0 0 44 44" className="w-12 h-12 -rotate-90">
                                <circle cx="22" cy="22" r="17" fill="none" stroke="rgba(48,40,33,0.1)" strokeWidth="3.5"/>
                                <circle cx="22" cy="22" r="17" fill="none" stroke="#b1552e" strokeWidth="3.5" strokeDasharray={`${visibility * 1.068} 106.8`} strokeLinecap="round"/>
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <svg className="w-3 h-3 text-[var(--ink-soft)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
                              </div>
                            </div>
                            <p className="text-[10px] font-semibold text-[var(--ink)]/80">Visibility</p>
                            <p className="text-[10px] text-[var(--rust)] font-bold">{visibility}% <span className="text-[var(--ink-faint)] font-normal">in last 7d</span></p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* LLM Visibility Score + Top Brands */}
                    <div className="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4 mb-4">
                      {/* Area chart */}
                      <div className="panel rounded-2xl p-6">
                        <p className="text-sm font-semibold text-[var(--ink)] mb-0.5">LLM Visibility Score <span className="text-[var(--ink-faint)] font-normal text-xs ml-1">ⓘ</span></p>
                        <p className="text-xs text-[var(--ink-faint)] mb-4">Percentage of AI responses that mention your brand for this prompt</p>
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <span className="font-serif text-4xl font-[400] text-[var(--ink)]">{visibility}%</span>
                            <span className="ml-2 text-xs font-medium bg-[var(--line)] text-[var(--ink-soft)] px-2 py-0.5 rounded-full">vs previous day</span>
                          </div>
                          <div className="text-right">
                            <p className="font-serif text-xl font-[400] text-[var(--ink)]">#{avgPos?.toFixed(1) ?? "—"}</p>
                            <p className="text-xs text-[var(--ink-faint)]">Your rank</p>
                          </div>
                        </div>
                        <svg viewBox={`0 0 ${W2} ${H2}`} className="w-full" style={{ height: H2 }}>
                          <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#b1552e" stopOpacity="0.15"/>
                              <stop offset="100%" stopColor="#b1552e" stopOpacity="0.01"/>
                            </linearGradient>
                          </defs>
                          {[0, 25, 50, 75, 100].map((v) => (
                            <g key={v}>
                              <line x1={pL} x2={W2 - pR} y1={ty2(v)} y2={ty2(v)} stroke="rgba(48,40,33,0.06)" strokeWidth="1"/>
                              <text x={pL - 6} y={ty2(v) + 4} textAnchor="end" fontSize="9" fill="#96897a">{v}%</text>
                            </g>
                          ))}
                          <path d={fillPath} fill="url(#areaGrad)"/>
                          <path d={areaPath} fill="none" stroke="#b1552e" strokeWidth="2.5" strokeLinecap="round"/>
                          {chartDates.map((d, i) => (
                            <text key={i} x={tx2(i)} y={H2 - 8} textAnchor="middle" fontSize="9" fill="#96897a">{d}</text>
                          ))}
                        </svg>
                      </div>

                      {/* Top Brands */}
                      <div className="panel rounded-2xl p-5 overflow-hidden">
                        <p className="text-sm font-semibold text-[var(--ink)] mb-0.5">Top Brands <span className="text-[var(--ink-faint)] font-normal text-xs ml-1">ⓘ</span></p>
                        <p className="text-xs text-[var(--ink-faint)] mb-3">Brands appearing in AI responses for this prompt</p>
                        <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 px-2 py-1.5 border-b border-[var(--line)] bg-[var(--line-soft)] rounded-lg mb-1">
                          <span className="text-[10px] font-semibold text-[var(--ink-faint)] w-5">Rank</span>
                          <span className="text-[10px] font-semibold text-[var(--ink-faint)]"></span>
                          <span className="text-[10px] font-semibold text-[var(--ink-faint)] text-right">Sources</span>
                          <span className="w-12" />
                        </div>
                        <div className="space-y-1 overflow-y-auto max-h-[320px]">
                          {topBrands.slice(0, 8).map((b, i) => {
                            return (
                              <div key={b.name} className={`grid grid-cols-[auto_1fr_auto_auto] gap-x-2 px-2 py-2.5 rounded-xl items-center ${b.isOwn ? "bg-[var(--rust-wash)]/10/60 border border-[var(--rust)]/25" : "hover:bg-[var(--line-soft)]"}`}>
                                <span className="text-xs font-semibold text-[var(--ink-soft)] w-5">{i + 1}</span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={`https://logo.clearbit.com/${b.domain}`} alt="" width={22} height={22} className="rounded shrink-0" onError={(e) => { const el = e.target as HTMLImageElement; el.src = `https://www.google.com/s2/favicons?domain=${b.domain}&sz=32`; el.onerror = () => { el.style.display = "none"; }; }} />
                                    <span className="text-xs font-semibold text-[var(--ink)]/90 truncate">{b.name}</span>
                                  </div>
                                  <div className="flex items-center gap-2 ml-7">
                                    <span className="text-[10px] text-[var(--ink-soft)]">●{b.visibility}% Visibility</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`text-xs font-bold ${i === 0 ? "text-[var(--rust)]" : i < 3 ? "text-[var(--rust-deep)]" : "text-[var(--ink-faint)]"}`}>#{b.avgPos?.toFixed(1) ?? "—"}</p>
                                  <p className="text-[9px] text-[var(--ink-faint)]">Avg. Position</p>
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
                      <div className="panel rounded-2xl p-5 mb-4">
                        <p className="text-sm font-semibold text-[var(--ink)] mb-0.5">Recent Responses for Your Prompt</p>
                        <p className="text-xs text-[var(--ink-faint)] mb-4">Latest AI responses when this specific prompt was used</p>
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-[var(--line)]">
                                <th className="text-left text-[10px] font-semibold text-[var(--ink-faint)] pb-2 pr-3 w-8">LLM</th>
                                <th className="text-left text-[10px] font-semibold text-[var(--ink-faint)] pb-2 pr-3">Response</th>
                                <th className="text-left text-[10px] font-semibold text-[var(--ink-faint)] pb-2 pr-3 w-16">Position</th>
                                <th className="text-left text-[10px] font-semibold text-[var(--ink-faint)] pb-2 pr-3 w-20">Mentioned?</th>
                                <th className="text-left text-[10px] font-semibold text-[var(--ink-faint)] pb-2 pr-3 w-24">Citations</th>
                                <th className="text-left text-[10px] font-semibold text-[var(--ink-faint)] pb-2 w-20">Created</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-line">
                              {promptResults.map((r, i) => {
                                const ago = (() => {
                                  const diff = Date.now() - new Date(r.scannedAt).getTime();
                                  const h = Math.floor(diff / 3600000);
                                  const d = Math.floor(h / 24);
                                  return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : "just now";
                                })();
                                return (
                                  <tr key={i} className="hover:bg-[var(--line-soft)] cursor-pointer" onClick={() => setSelectedResponseResult(r)}>
                                    <td className="py-3 pr-3">
                                      <EngineIcon engine={r.engine} size={24} />
                                    </td>
                                    <td className="py-3 pr-3 max-w-xs">
                                      {r.response.trim() ? (
                                        <span className="text-[var(--ink)]/80 line-clamp-2 leading-snug">{r.response.slice(0, 140)}{r.response.length > 140 ? "…" : ""}</span>
                                      ) : (
                                        <span className="italic text-[var(--ink-faint)] leading-snug">
                                          {r.engine === "google" ? "No AI Overview appeared for this query on this scan" : "No response captured on this scan"}
                                        </span>
                                      )}
                                    </td>
                                    <td className="py-3 pr-3">
                                      <span className={`font-bold ${r.brandRank ? "text-[var(--rust)]" : "text-[var(--ink-faint)]"}`}>{r.brandRank ? `#${r.brandRank}` : "—"}</span>
                                    </td>
                                    <td className="py-3 pr-3">
                                      {r.brandMentioned
                                        ? <span className="inline-flex items-center gap-1 bg-[var(--rust)]/10 text-[var(--rust)] border border-[var(--rust)]/20 px-2 py-0.5 rounded-full text-[10px] font-semibold">✓ Yes</span>
                                        : r.response.trim()
                                          ? <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-700 border border-red-500/25 px-2 py-0.5 rounded-full text-[10px] font-semibold">✗ No</span>
                                          : <span className="inline-flex items-center gap-1 bg-[var(--line)] text-[var(--ink-faint)] border border-[var(--line)] px-2 py-0.5 rounded-full text-[10px] font-semibold">n/a</span>
                                      }
                                    </td>
                                    <td className="py-3 pr-3">
                                      <div className="flex items-center gap-1 flex-nowrap">
                                        {r.citations.slice(0, 2).map((url, ci) => {
                                          try {
                                            const d = new URL(url).hostname.replace(/^www\./, "");
                                            // eslint-disable-next-line @next/next/no-img-element
                                            return <img key={ci} src={`https://www.google.com/s2/favicons?domain=${d}&sz=16`} alt={d} width={14} height={14} className="rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />;
                                          } catch { return null; }
                                        })}
                                        {r.citations.length > 2 && <span className="text-[10px] text-[var(--ink-faint)] shrink-0">+{r.citations.length - 2}</span>}
                                        {r.citations.length === 0 && <span className="text-[var(--ink-faint)]/70">—</span>}
                                      </div>
                                    </td>
                                    <td className="py-3 text-[var(--ink-faint)]">{ago}</td>
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
                            <button onClick={() => setSelectedResponseResult(null)} className="text-[var(--ink-faint)] hover:text-white transition-colors text-lg leading-none">×</button>
                          </div>
                          <div className="bg-[#1a1a1a] rounded-xl px-4 py-3 mb-4">
                            <p className="text-xs text-[var(--ink-faint)] mb-1">Prompt</p>
                            <p className="text-sm text-white">{selectedResponseResult.promptText}</p>
                          </div>
                          <div className="prose prose-invert prose-sm max-w-none text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">{selectedResponseResult.response}</div>
                        </div>
                      </div>
                    )}

                    {/* Top Citations split view */}
                    {sortedCitDomains.length > 0 && (
                      <div className="panel rounded-2xl p-5">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <p className="text-sm font-semibold text-[var(--ink)]">Top Citations <span className="text-[var(--ink-faint)] font-normal text-xs ml-1">ⓘ</span></p>
                            <p className="text-xs text-[var(--ink-faint)]">Check the citation sources and engage</p>
                          </div>
                          <button onClick={() => navTo("citations")} className="text-xs font-semibold border border-[var(--line)] px-3 py-1.5 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors">View all</button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                          {/* Left: domain list */}
                          <div className="space-y-1.5">
                            {sortedCitDomains.map(([domain, info], i) => (
                              <button
                                key={domain}
                                onClick={() => setSelectedCitationDomain(domain === activeDomain ? null : domain)}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${domain === activeDomain ? "border-[var(--line)] bg-[var(--line-soft)]" : "border-[var(--line)] hover:bg-[var(--line-soft)]"}`}
                              >
                                <span className="text-xs text-[var(--ink-faint)] font-medium w-5 shrink-0">#{i+1}</span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={24} height={24} className="rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                <span className="text-sm text-[var(--ink)]/90 font-medium truncate flex-1">{domain}</span>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold text-[var(--ink)]">{info.count}</p>
                                  <p className="text-[10px] text-[var(--ink-faint)]">Citations</p>
                                </div>
                              </button>
                            ))}
                          </div>

                          {/* Right: URL detail panel */}
                          <div>
                            {!activeDomain ? (
                              <div className="flex flex-col items-center justify-center h-full text-center py-8 border border-dashed border-[var(--line)] rounded-xl">
                                <div className="w-12 h-4 bg-[var(--line)] rounded mb-2 mx-auto" />
                                <div className="w-24 h-2 bg-[var(--line)] rounded mb-1 mx-auto" />
                                <div className="w-16 h-2 bg-[var(--line)] rounded mb-4 mx-auto" />
                                <p className="text-xs text-[var(--ink-faint)] leading-relaxed">Select a citation source from left panel<br/>to see the engage-able links.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {citDomains[activeDomain].urls.map((item, i) => {
                                  const isReddit = item.url.includes("reddit.com");
                                  const urlShort = item.url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60) + (item.url.length > 75 ? "…" : "");
                                  const urlDomain = new URL(item.url).hostname.replace(/^www\./, "");
                                  const impact = isReddit ? "High impact" : citDomains[activeDomain].count >= 3 ? "Medium impact" : "Low impact";
                                  const impactColor = impact === "High impact" ? "bg-[var(--rust)]/15 text-[var(--rust)]" : impact === "Medium impact" ? "bg-[var(--rust-wash)]/15 text-[var(--rust-deep)]" : "bg-red-500/15 text-red-700";
                                  return (
                                    <div key={i} className="border border-[var(--line)] rounded-xl p-3">
                                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full mb-2 inline-block ${impactColor}`}>{impact}</span>
                                      <div className="flex items-start gap-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`https://www.google.com/s2/favicons?domain=${urlDomain}&sz=16`} alt="" width={14} height={14} className="rounded mt-0.5 shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                        <div className="flex-1 min-w-0">
                                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--ink)]/80 hover:text-blue-700 font-medium leading-snug flex items-center gap-1">
                                            <span className="truncate">{urlShort}</span>
                                            <svg className="w-3 h-3 shrink-0 text-[var(--ink-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/></svg>
                                          </a>
                                          <p className="text-[10px] text-[var(--ink-faint)]">{urlDomain}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                          <p className="text-xs font-bold text-[var(--ink)]">{citDomains[activeDomain].count}</p>
                                          <p className="text-[9px] text-[var(--ink-faint)]">Citations</p>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1.5 mt-2">
                                        <span className="text-[10px] text-[var(--ink-faint)]">Cited by</span>
                                        <EngineIcon engine={item.engine} size={16} />
                                        {isReddit && (
                                          engagedUrls.has(item.url) ? (
                                            <button onClick={() => { setEngageItem({ url: item.url, promptText: prompt.text, engine: item.engine }); setEngageDraft(""); navTo("citations"); }} className="ml-auto flex items-center gap-1 text-[10px] font-semibold border border-[var(--olive)]/40 text-[var(--olive)] px-2 py-0.5 rounded-full hover:bg-[var(--olive)]/10 transition-colors">
                                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                              Engaged
                                            </button>
                                          ) : (
                                            <button onClick={() => { setEngageItem({ url: item.url, promptText: prompt.text, engine: item.engine }); setEngageDraft(""); navTo("citations"); }} className="ml-auto text-[10px] font-semibold bg-[#FF4500] text-white px-2 py-0.5 rounded-full hover:bg-[#e03d00] transition-colors">Engage</button>
                                          )
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
                  const activePrompts = allPrompts.filter((p) => p.status !== "paused");
                  const pausedPrompts = allPrompts.filter((p) => p.status === "paused");
                  // Only active prompts actually get scanned (and cost us API calls), so
                  // usage/breakdown counts are active-only — consistent with the limit itself.
                  const brandedCount = activePrompts.filter((p) => p.category?.toLowerCase().includes("brand")).length;
                  const competitorCount = activePrompts.filter((p) => p.category?.toLowerCase().includes("competitor")).length;
                  const commercialCount = activePrompts.filter((p) => p.category?.toLowerCase().includes("commercial")).length;
                  const used = activePrompts.length;
                  const limit = promptLimitForPlan(credits?.plan);
                  const statusScoped = promptStatusFilter === "active" ? activePrompts : pausedPrompts;
                  const filtered = statusScoped.filter((p) => !promptSearch || p.text.toLowerCase().includes(promptSearch.toLowerCase()));

                  return (
                    <>
                      <h2 className="text-xl font-bold text-[var(--ink)] mb-0.5">Prompts</h2>
                      <p className="text-sm text-[var(--ink-faint)] mb-5">Manage your search prompts &amp; track visibility gaps</p>

                      {/* Stat cards */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                        <StatCard label="Prompts" value={allPrompts.length} sub="tracked" />
                        {isFreeTier ? (
                          <BlurInline onUnlock={openPaywall}><StatCard label="With gaps" value={2 + (decoyHash(brand.id ?? brand.name) % 9)} sub="need articles" /></BlurInline>
                        ) : (
                          <StatCard label="With gaps" value={gaps.length} sub="need articles" />
                        )}
                        {isFreeTier ? (
                          <BlurInline onUnlock={openPaywall}><StatCard label="Avg visibility" value={`${decoyPct(brand.id ?? brand.name)}%`} sub="across engines" /></BlurInline>
                        ) : (
                          <StatCard label="Avg visibility" value={overallScore !== null ? `${overallScore}%` : "—"} sub="across engines" />
                        )}
                        <StatCard label="Engines" value={selectedEngines.length} sub="being tracked" />
                      </div>

                      {/* Usage bar */}
                      <div className="panel rounded-2xl px-5 py-4 mb-5">
                        <p className="text-sm font-semibold text-[var(--ink)]/90 mb-2">{used} of {limit} prompts used</p>
                        <div className="h-2 bg-[var(--line)] rounded-full overflow-hidden flex gap-0.5 mb-2">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${(commercialCount / limit) * 100}%` }} />
                          <div className="h-full bg-[var(--rust)] rounded-full transition-all" style={{ width: `${(competitorCount / limit) * 100}%` }} />
                          <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${(brandedCount / limit) * 100}%` }} />
                        </div>
                        <div className="flex gap-4">
                          {[["bg-blue-500","Commercial",commercialCount],["bg-[var(--rust)]","Competitor",competitorCount],["bg-purple-500","Branded",brandedCount]].map(([color, label, count]) => (
                            <div key={label as string} className="flex items-center gap-1.5">
                              <div className={`w-2 h-2 rounded-full ${color}`} />
                              <span className="text-xs text-[var(--ink-soft)]">{label as string}</span>
                              {(count as number) > 0 && <span className="text-xs text-[var(--ink-faint)]">({count as number})</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Active / Paused filter */}
                      <div className="flex gap-1 mb-3 bg-[var(--line)] rounded-lg p-1 w-fit">
                        {(["active", "paused"] as const).map((s) => (
                          <button
                            key={s}
                            onClick={() => setPromptStatusFilter(s)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                              promptStatusFilter === s ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]/80"
                            }`}
                          >
                            {s} ({s === "active" ? activePrompts.length : pausedPrompts.length})
                          </button>
                        ))}
                      </div>

                      {/* Search */}
                      <div className="flex items-center gap-2 panel rounded-xl px-3 py-2 mb-4">
                        <svg className="w-4 h-4 text-[var(--ink-faint)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <input value={promptSearch} onChange={(e) => setPromptSearch(e.target.value)} placeholder="Search prompts" className="text-sm flex-1 outline-none bg-transparent text-[var(--ink)]/90 placeholder:text-[var(--ink-faint)]" />
                      </div>

                      {/* Table — scrolls horizontally on narrow screens */}
                      <div className="panel rounded-2xl overflow-hidden">
                       <div className="overflow-x-auto">
                       <div className="min-w-[640px]">
                        <div className="grid grid-cols-[1fr_130px_120px_40px_60px] gap-x-4 px-5 py-3 border-b border-[var(--line)] bg-[var(--line-soft)]">
                          <span className="text-[11px] font-semibold text-[var(--ink-soft)]">Prompts</span>
                          <span className="text-[11px] font-semibold text-[var(--ink-soft)]">Engines</span>
                          <span className="text-[11px] font-semibold text-[var(--ink-soft)]">Competing with</span>
                          <span className="text-[11px] font-semibold text-[var(--ink-soft)] text-center">Type</span>
                          <span />
                        </div>

                        {filtered.map((p) => {
                          const pr = results.filter((r) => r.promptId === p.id);
                          const mc = pr.filter((r) => r.brandMentioned).length;
                          const neverScanned = pr.length === 0;
                          const vis = neverScanned ? 0 : Math.round(mc / pr.length * 100);
                          const hasGap = pr.length > 0 && mc === 0;
                          const cmpMap: Record<string, number> = {};
                          pr.forEach((r) => r.competitorMentions.forEach((c) => { cmpMap[c.name] = (cmpMap[c.name] ?? 0) + 1; }));
                          const topCompetitor = Object.entries(cmpMap).sort((a,b) => b[1]-a[1])[0]?.[0] ?? null;
                          const pType = p.category || "";
                          const typeDot = pType.toLowerCase().includes("brand") ? "bg-purple-500" : pType.toLowerCase().includes("competitor") ? "bg-[var(--rust)]" : "bg-blue-500";

                          return (
                            <div
                              key={p.id}
                              className="group grid grid-cols-[1fr_130px_120px_40px_60px] gap-x-4 px-5 py-4 border-b border-[var(--line)] last:border-0 hover:bg-[var(--line-soft)]/70 transition-colors items-center"
                            >
                              {/* Prompt with visibility ring — clickable */}
                              <button onClick={() => { if (isFreeTier) { openPaywall(); return; } setSelectedPromptId(p.id); setSelectedCitationDomain(null); history.pushState(null, ""); }} className="flex items-center gap-3 min-w-0 text-left">
                                {(() => {
                                  const ring = neverScanned ? (
                                    <div className="relative w-11 h-11 shrink-0" title="Not scanned yet — included in the next run">
                                      <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90">
                                        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(48,40,33,0.15)" strokeWidth="3" strokeDasharray="3 3"/>
                                      </svg>
                                      <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold uppercase tracking-wide text-[var(--ink-faint)]">New</span>
                                    </div>
                                  ) : (() => {
                                    const shownVis = isFreeTier ? decoyPct(p.id) : vis;
                                    return (
                                      <div className="relative w-11 h-11 shrink-0">
                                        <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90">
                                          <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(48,40,33,0.1)" strokeWidth="3"/>
                                          <circle cx="22" cy="22" r="18" fill="none" stroke={shownVis >= 80 ? "#22c55e" : shownVis >= 50 ? "#f59e0b" : "#ef4444"} strokeWidth="3" strokeDasharray={`${shownVis * 1.131} 113.1`} strokeLinecap="round"/>
                                        </svg>
                                        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-[var(--ink)]/80">{shownVis}%</span>
                                      </div>
                                    );
                                  })();
                                  return isFreeTier ? <BlurInline onUnlock={openPaywall}>{ring}</BlurInline> : ring;
                                })()}
                                <span className="text-sm text-[var(--ink)]/90 font-medium leading-snug line-clamp-2">{p.text}</span>
                                {p.status !== "paused" && p.cadence === "weekly" && (
                                  <span title="Won every scan for a week straight — now checked weekly. Drops back to daily if visibility slips." className="shrink-0 text-[9px] font-semibold uppercase tracking-wide bg-[var(--olive-wash)] text-[var(--olive)] px-1.5 py-0.5 rounded-full">Monitoring</span>
                                )}
                              </button>
                              {/* Engine mention dots */}
                              {(() => {
                                const dots = (
                                  <div className="flex items-center gap-2">
                                    {selectedEngines.map((eng) => {
                                      const r = pr.find((x) => x.engine === eng);
                                      const mentioned = isFreeTier ? decoyHash(p.id + eng) % 2 === 0 : r?.brandMentioned ?? false;
                                      const hasData = isFreeTier ? true : !!r;
                                      return (
                                        <div key={eng} className={`flex items-center gap-1 ${!hasData || !mentioned ? "opacity-35 grayscale" : ""}`} title={`${eng}: ${!hasData ? "no data" : mentioned ? "mentioned" : "not mentioned"}`}>
                                          <EngineIcon engine={eng} size={14} />
                                        </div>
                                      );
                                    })}
                                    {(isFreeTier ? decoyHash(p.id) % 3 === 0 : hasGap) && (
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (isFreeTier) { openPaywall(); return; }
                                          const gapItem = gaps.find((g) => g.promptText === p.text);
                                          const params = new URLSearchParams({ gapPrompt: p.text, brand: brand.name, niche: brand.niche, brandId: brand.id ?? "", engines: encodeURIComponent(JSON.stringify(gapItem?.engines ?? [])), ...(gapItem?.topCompetitor ? { competitor: gapItem.topCompetitor } : {}) });
                                          window.open(`/article?${params}`, "_blank");
                                        }}
                                        className="text-[10px] font-medium text-[var(--ink-faint)] hover:text-[var(--ink)]/80 border border-[var(--line)] hover:border-[var(--line)] px-1.5 py-0.5 rounded transition-colors"
                                      >
                                        + Article
                                      </button>
                                    )}
                                  </div>
                                );
                                return isFreeTier ? <BlurInline onUnlock={openPaywall}>{dots}</BlurInline> : dots;
                              })()}
                              {/* Competing with */}
                              {isFreeTier ? (
                                <BlurInline onUnlock={openPaywall}><div className="text-xs text-[var(--ink-soft)] truncate">{decoyPick(p.id, DECOY_COMPETITORS)}</div></BlurInline>
                              ) : (
                                <div className="text-xs text-[var(--ink-soft)] truncate">{topCompetitor ?? "—"}</div>
                              )}
                              {/* Type dot */}
                              {isFreeTier ? (
                                <BlurInline onUnlock={openPaywall}><div className="flex justify-center"><div className={`w-2.5 h-2.5 rounded-full ${decoyPick(p.id + "type", ["bg-blue-500", "bg-[var(--rust)]", "bg-purple-500"] as const)}`} /></div></BlurInline>
                              ) : (
                                <div className="flex justify-center">
                                  <div className={`w-2.5 h-2.5 rounded-full ${typeDot}`} />
                                </div>
                              )}
                              {/* Pause / Delete */}
                              <div className="flex justify-center items-center gap-0.5">
                                <button
                                  onClick={(e) => { e.stopPropagation(); togglePromptStatus(p); }}
                                  className={`transition-opacity p-1 rounded-lg hover:bg-[var(--line-soft)] text-[var(--ink-faint)]/70 hover:text-[var(--ink-soft)] ${p.status === "paused" ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                                  title={p.status === "paused" ? "Resume scanning this prompt" : "Pause — stop scanning this prompt"}
                                >
                                  {togglingPromptId === p.id ? (
                                    <span className="w-3.5 h-3.5 border border-[var(--ink-faint)] border-t-transparent rounded-full animate-spin block" />
                                  ) : p.status === "paused" ? (
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                  ) : (
                                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
                                  )}
                                </button>
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
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-500/10 text-[var(--ink-faint)]/70 hover:text-red-700/80"
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
                          <p className="text-sm text-[var(--ink-faint)] text-center py-10">
                            {promptSearch ? "No prompts match your search" : promptStatusFilter === "paused" ? "No paused prompts" : "No active prompts"}
                          </p>
                        )}
                       </div>
                       </div>
                      </div>

                      {/* Add prompt */}
                      <div className="mt-3 flex gap-2">
                        <input
                          value={newPromptText}
                          onChange={(e) => setNewPromptText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); addManualPrompt(); }
                          }}
                          placeholder="Add a new prompt…"
                          className="flex-1 bg-[var(--line-soft)] shadow-[inset_0_0_0_1px_rgba(48,40,33,0.1)] rounded-xl px-4 py-2.5 text-sm text-[var(--ink)]/90 placeholder:text-[var(--ink-faint)] outline-none focus:ring-2 focus:ring-[var(--rust)]/40"
                        />
                        <button
                          disabled={!newPromptText.trim() || addingPrompt}
                          onClick={async () => {
                            await addManualPrompt();
                          }}
                          className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] rounded-xl hover:bg-[var(--rust-deep)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                        >
                          {addingPrompt ? <span className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" /> : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>}
                          Add
                        </button>
                      </div>

                      {/* Discovery prompt suggestions — persisted, always shown, refilled to a
                          steady pool size as items get added instead of needing a manual re-fetch */}
                      <div className="mt-4 panel rounded-2xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <p className="text-sm font-semibold text-[var(--ink)]">New discovery prompts</p>
                            <p className="text-xs text-[var(--ink-faint)]">Questions people ask in your niche that you aren&apos;t tracking yet — none mention your brand</p>
                          </div>
                          <button
                            onClick={regeneratePromptSuggestions}
                            disabled={suggestingPrompts || !promptSuggestionsLoaded}
                            className="flex items-center gap-1.5 text-xs font-semibold text-[var(--rust)] hover:text-[var(--rust-deep)] transition-colors disabled:opacity-50 shrink-0 ml-3"
                          >
                            {suggestingPrompts ? (
                              <><span className="w-3 h-3 border border-[var(--rust)] border-t-transparent rounded-full animate-spin" /> Refreshing…</>
                            ) : (
                              <>↻ Suggest new ones</>
                            )}
                          </button>
                        </div>
                        {!promptSuggestionsLoaded ? (
                          <div className="flex items-center gap-2 py-4 text-xs text-[var(--ink-faint)]">
                            <span className="w-3 h-3 border border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /> Finding discovery prompts in your niche…
                          </div>
                        ) : promptSuggestions.length === 0 ? (
                          <p className="text-xs text-[var(--ink-faint)] py-4 text-center">No suggestions right now — try &quot;Suggest new ones&quot;</p>
                        ) : (
                          <div className="space-y-1">
                            {promptSuggestions.map((s) => (
                              <div key={s.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-[var(--line-soft)] transition-colors">
                                <span className="text-sm text-[var(--ink)]/90 flex-1 min-w-0">{s.text}</span>
                                <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${s.category === "Competitor" ? "bg-[var(--rust-wash)] text-[var(--rust-deep)]" : "bg-[var(--line)] text-[var(--ink-soft)]"}`}>{s.category}</span>
                                <button
                                  onClick={() => addSuggestedPrompt(s)}
                                  disabled={addingSuggestionText !== null}
                                  className="shrink-0 text-xs font-semibold text-[var(--rust)] hover:text-[var(--rust-deep)] border border-[var(--line)] hover:border-[var(--rust)]/40 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
                                >
                                  {addingSuggestionText === s.text ? "Adding…" : "+ Add"}
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
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
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                  <div className="bg-[var(--surface)] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden">
                    {/* Header bar */}
                    <div className="flex items-center justify-between px-8 pt-7 pb-0">
                      <h2 className="text-lg font-bold text-[var(--ink)]">Get Cited in AI Responses — In 3 Steps</h2>
                      <div className="flex gap-1.5">
                        {[0,1,2].map((i) => (
                          <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === citationOnboardingStep ? "bg-[var(--olive)]" : "bg-[var(--line)]"}`} />
                        ))}
                      </div>
                    </div>

                    {/* Step content */}
                    <div className="flex flex-col sm:flex-row gap-6 sm:gap-8 px-5 sm:px-8 py-6 sm:py-8 sm:min-h-[380px] items-center">
                      {/* Left: text */}
                      <div className="flex-1 min-w-0">
                        {citationOnboardingStep === 0 && (
                          <>
                            <h3 className="text-2xl font-bold text-[var(--ink)] mb-4">AI Scans the <span className="text-[var(--rust)]">Web</span></h3>
                            <p className="text-[var(--ink-soft)] mb-3">AI answers pull from public discussions and citation sources.</p>
                            <p className="text-[var(--ink-soft)] mb-3">If your brand isn't mentioned there, you don't appear.</p>
                            <p className="font-semibold text-[var(--ink)]/90">Check the citation sources &amp; engage.</p>
                          </>
                        )}
                        {citationOnboardingStep === 1 && (
                          <>
                            <h3 className="text-2xl font-bold text-[var(--ink)] mb-4">Engage on <span className="text-[var(--rust)]">Citation Sources</span></h3>
                            <p className="text-[var(--ink-soft)] mb-3">Post valuable comments on Reddit and other cited sources using your connected account.</p>
                            <p className="font-semibold text-[var(--ink)]/90">This is how your brand enters AI responses.</p>
                          </>
                        )}
                        {citationOnboardingStep === 2 && (
                          <>
                            <h3 className="text-2xl font-bold text-[var(--ink)] mb-4">Get Cited in <span className="text-[var(--rust)]">AI Responses</span></h3>
                            <p className="text-[var(--ink-soft)] mb-3">Your engaged content gets ranked, surfaced, and cited — bringing your brand directly into AI responses.</p>
                            <p className="font-semibold text-[var(--ink)]/90">Visibility that compounds.</p>
                          </>
                        )}
                      </div>

                      {/* Right: illustration card */}
                      <div className="w-full max-w-80 sm:w-80 shrink-0">
                        {citationOnboardingStep === 0 && (
                          <div className="panel rounded-2xl p-5">
                            <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest mb-3">AI response</p>
                            <div className="bg-[var(--line-soft)] rounded-xl px-4 py-3 mb-3">
                              <p className="text-sm font-semibold text-[var(--ink)]/90">No brand presence</p>
                            </div>
                            <div className="flex items-center gap-2 mb-4">
                              <span className="text-[10px] text-[var(--ink-soft)]">Citations</span>
                              <div className="flex gap-1">
                                <div className="w-6 h-6 rounded-full bg-orange-400/15 flex items-center justify-center text-[10px] font-bold text-orange-700">C</div>
                                <div className="w-6 h-6 rounded-full bg-[var(--rust)]/15 flex items-center justify-center text-[10px] font-bold text-[var(--rust)]">W</div>
                                <div className="w-6 h-6 rounded-full bg-[#FF4500] flex items-center justify-center">
                                  <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                                </div>
                              </div>
                            </div>
                            <div className="bg-[#FF4500]/10 border border-orange-400/25 rounded-lg px-3 py-2 flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-[#FF4500] flex items-center justify-center shrink-0">
                                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                              </div>
                              <span className="text-xs text-[var(--ink-soft)] flex-1">reddit.com/r/…</span>
                              <span className="text-xs font-medium text-[var(--rust)] flex items-center gap-0.5">⚡ Engage</span>
                            </div>
                          </div>
                        )}

                        {citationOnboardingStep === 1 && (
                          <div className="panel rounded-2xl p-5">
                            <div className="bg-[var(--line-soft)] rounded-xl p-3 mb-3">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-full bg-[#FF4500] flex items-center justify-center">
                                  <svg viewBox="0 0 20 20" className="w-4 h-4 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                                </div>
                                <div>
                                  <p className="text-[11px] font-semibold text-[var(--ink)]/90">r/subreddit · 3 days ago</p>
                                  <p className="text-[10px] text-[var(--ink-soft)]">Kaytosmith</p>
                                </div>
                              </div>
                              <p className="text-sm font-semibold text-[var(--ink)]/90">Looking for alternatives to…</p>
                              <div className="h-1.5 bg-[var(--line)] rounded mt-1.5 mb-0.5 w-full" />
                              <div className="h-1.5 bg-[var(--line)] rounded w-3/4" />
                            </div>
                            <div className="border border-[var(--rust)]/30 rounded-xl p-3 mb-3">
                              <div className="flex items-center gap-1.5 mb-2">
                                <div className="w-5 h-5 rounded-full bg-blue-400" />
                                <span className="text-[11px] font-medium text-[var(--ink)]/80">Your account · <span className="text-[var(--rust)]">Post Immediately</span></span>
                              </div>
                              <div className="bg-[var(--line-soft)] rounded-lg px-2.5 py-2 text-xs text-[var(--ink)]/80 border border-[var(--line)] mb-2">
                                <span className="text-[var(--rust)] font-medium">[{brand.name}]</span> is a good alternative that I&apos;ve been using
                              </div>
                              <button className="w-full text-xs font-semibold bg-[var(--olive)] text-[var(--surface)] rounded-lg py-1.5">Submit Comment</button>
                            </div>
                          </div>
                        )}

                        {citationOnboardingStep === 2 && (
                          <div className="panel rounded-2xl p-5">
                            <div className="bg-[var(--line-soft)] rounded-xl p-3 mb-3">
                              <div className="flex items-center gap-2 mb-1">
                                <div className="w-6 h-6 rounded-full bg-blue-400" />
                                <span className="text-[11px] font-medium text-[var(--ink)]/80">Username · 8mo ago</span>
                              </div>
                              <p className="text-xs text-[var(--ink)]/80 mb-2"><span className="text-[var(--rust)] font-medium">[{brand.name}]</span> is a good alternative that I&apos;ve been using</p>
                              <div className="flex gap-2">
                                <span className="text-[10px] font-semibold bg-blue-400/100 text-white px-2 py-0.5 rounded-full">↑ 100 Upvotes</span>
                                <span className="text-[10px] font-semibold bg-[var(--olive)] text-[var(--surface)] px-2 py-0.5 rounded-full">2.3k Views</span>
                              </div>
                              <span className="text-[10px] font-semibold text-[var(--ink-soft)] mt-1 block">■ Ranked</span>
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-px h-8 bg-[var(--line)] mx-auto" />
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <div className="w-8 h-8 rounded-full bg-[#FF4500] flex items-center justify-center">
                                <svg viewBox="0 0 20 20" className="w-4 h-4 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                              </div>
                              <span className="text-xs font-semibold bg-[var(--rust)]/15 text-[var(--rust)] px-2 py-0.5 rounded-full">10x AI Visibility</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <div className="w-6 h-6 rounded-full bg-orange-400/15 flex items-center justify-center text-[9px] font-bold text-orange-600">C</div>
                              <div className="w-6 h-6 rounded-full bg-[var(--rust)]/15 flex items-center justify-center text-[9px] font-bold text-[var(--rust)]">G</div>
                              <div className="flex-1 ml-2 bg-[var(--line-soft)] rounded-lg px-3 py-1.5">
                                <p className="text-xs font-semibold text-[#b5820a]">[{brand.name}]</p>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-between px-8 pb-7 border-t border-[var(--line)] pt-5">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={dontShowCitationsOnboarding}
                          onChange={(e) => setDontShowCitationsOnboarding(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-[var(--line)]"
                        />
                        <span className="text-xs text-[var(--ink-soft)]">Don&apos;t show it again</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => setCitationOnboardingStep((s) => Math.max(0, s - 1))}
                          disabled={citationOnboardingStep === 0}
                          className="text-sm text-[var(--ink-faint)] disabled:opacity-30 hover:text-[var(--ink-soft)] transition-colors"
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
                          className="text-sm font-semibold bg-[var(--olive)] text-[var(--surface)] px-5 py-2 rounded-lg hover:bg-[var(--olive)]/80 transition-colors"
                        >
                          {citationOnboardingStep === 2 ? "Get Started" : "Next"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {citationsStale && (
                <div className="flex items-center gap-2 mb-4 text-xs text-[var(--ink-soft)]">
                  <span>A scan just completed — this page may be out of date.</span>
                  <button
                    onClick={refreshCitations}
                    disabled={refreshingCitations}
                    className="font-semibold text-[var(--rust)] hover:underline disabled:opacity-50"
                  >
                    {refreshingCitations ? "Refreshing…" : "Refresh"}
                  </button>
                </div>
              )}

              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
              ) : !scanned ? (
                <EmptyState label="No citation data" sub="Monitoring starts automatically — check back after your first daily scan" />
              ) : citationDomains.length === 0 ? (
                <EmptyState label="No citations detected" sub="Citations appear when AI engines reference sources in their responses" />
              ) : (
                <>
                  <h2 className="text-xl font-bold text-[var(--ink)] mb-0.5">Citations</h2>
                  <p className="text-sm text-[var(--ink-faint)] mb-5">Discover the sources AI uses in its responses</p>

                  {/* Engagement Platforms */}
                  <div className="mb-6">
                    <div className="flex items-center gap-1.5 mb-3">
                      <p className="text-sm font-semibold text-[var(--ink)]/90">Engagement Platforms</p>
                      <svg className="w-3.5 h-3.5 text-[var(--ink-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/></svg>
                    </div>
                    <p className="text-xs text-[var(--ink-faint)] mb-3">Engage on these platforms to increase your AI visibility</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                      {/* Reddit — live */}
                      <div className="bg-[var(--surface)] border-2 border-orange-200 rounded-xl p-4 flex flex-col">
                        <div className="flex items-center gap-2 mb-3">
                          <div className="w-9 h-9 rounded-xl bg-[#FF4500] flex items-center justify-center shrink-0 shadow-sm">
                            <svg viewBox="0 0 20 20" className="w-5 h-5 fill-white"><path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                          </div>
                          <div className="min-w-0">
                            <span className="text-sm font-semibold text-[var(--ink)]">Reddit</span>
                          </div>
                          <span className="ml-auto text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100 whitespace-nowrap">High impact</span>
                        </div>
                        <p className="text-[11px] text-[var(--ink-soft)] mb-3">Engage on Reddit threads to get cited in AI responses and boost your visibility.</p>
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

                      {/* LinkedIn — appears only when a LinkedIn citation is detected */}
                      {citationDomains.some(([d]) => d.includes("linkedin.com")) && (() => {
                        const linkedinCard = (
                          <div className="bg-[var(--surface)] border-2 border-blue-400/25 rounded-xl p-4 flex flex-col">
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-9 h-9 rounded-xl bg-[#0A66C2] flex items-center justify-center shrink-0 shadow-sm">
                                <span className="text-white font-bold text-sm leading-none">in</span>
                              </div>
                              <div className="min-w-0">
                                <span className="text-sm font-semibold text-[var(--ink)]">LinkedIn</span>
                              </div>
                              <span className="ml-auto text-[10px] font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded-full border border-teal-100 whitespace-nowrap">High impact</span>
                            </div>
                            <p className="text-[11px] text-[var(--ink-soft)] mb-3">Engage on LinkedIn posts to get cited in AI responses and boost your visibility.</p>
                            <button
                              onClick={() => {
                                const linkedinEntry = citationDomains.find(([d]) => d.includes("linkedin.com"));
                                if (linkedinEntry) {
                                  const instances = citationInstances[linkedinEntry[0]];
                                  if (instances?.[0]) {
                                    setEngageItem({ url: instances[0].url, promptText: instances[0].promptText, engine: instances[0].engine });
                                    setEngageDraft("");
                                  }
                                }
                              }}
                              className="mt-auto w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-[#0A66C2] text-white rounded-xl py-2.5 hover:bg-[#004182] transition-colors shadow-sm"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                              Engage
                            </button>
                          </div>
                        );
                        return isFreeTier ? <BlurBlock onUnlock={openPaywall}>{linkedinCard}</BlurBlock> : linkedinCard;
                      })()}
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

                    const chartBody = (
                      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-4 mb-5 items-start">
                        {/* Line / Bar chart */}
                        <div className="panel rounded-xl p-5">
                          <div className="flex items-start justify-between mb-1">
                            <div>
                              <p className="text-sm font-semibold text-[var(--ink)]">Top Citations <span className="text-[var(--ink-faint)] font-normal text-xs ml-1">ⓘ</span></p>
                              <p className="text-xs text-[var(--ink-faint)]">Daily citation count for top 10 domains</p>
                            </div>
                            <div className="flex items-center gap-1 border border-[var(--line)] rounded-lg p-0.5">
                              <button onClick={() => setCitationChartMode("bar")} className={`p-1.5 rounded-md transition-colors ${citationChartMode === "bar" ? "bg-[var(--line)] text-[var(--ink)]/80" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`} title="Bar chart">
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16"><rect x="1" y="8" width="3" height="7"/><rect x="6" y="4" width="3" height="11"/><rect x="11" y="1" width="3" height="14"/></svg>
                              </button>
                              <button onClick={() => setCitationChartMode("line")} className={`p-1.5 rounded-md transition-colors ${citationChartMode === "line" ? "bg-[var(--line)] text-[var(--ink)]/80" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"}`} title="Line chart">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><polyline points="1,12 5,7 9,9 13,3"/></svg>
                              </button>
                            </div>
                          </div>
                          {citationHistory.length === 0 ? (
                            <div className="flex items-center justify-center h-36 text-xs text-[var(--ink-faint)] mt-3">Chart data loads after first few daily scans</div>
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
                                    <line x1={padL} x2={W - padR} y1={toY(v)} y2={toY(v)} stroke="rgba(48,40,33,0.06)" strokeWidth="1"/>
                                    <text x={padL - 4} y={toY(v) + 3} textAnchor="end" fontSize="8" fill="#96897a">{v}</text>
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
                                  className="absolute z-10 panel rounded-xl shadow-lg p-3 pointer-events-none"
                                  style={{
                                    left: citationChartHover.x / W * 100 > 60 ? "auto" : `calc(${(citationChartHover.x / W) * 100}% + 8px)`,
                                    right: citationChartHover.x / W * 100 > 60 ? `calc(${100 - (citationChartHover.x / W) * 100}% + 8px)` : "auto",
                                    top: 0,
                                  }}
                                >
                                  <p className="text-xs font-semibold text-[var(--ink)]/80 mb-2">{new Date(allDates[citationChartHover.idx]).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</p>
                                  <div className="space-y-1.5 min-w-[160px]">
                                    {hoverData.filter(d => d.count > 0).map((d, i) => (
                                      <div key={i} className="flex items-center gap-2">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={`https://www.google.com/s2/favicons?domain=${d.domain}&sz=16`} alt="" width={14} height={14} className="rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                        <span className="text-xs text-[var(--ink-soft)] flex-1 truncate">{d.domain}</span>
                                        <span className="text-xs font-semibold text-[var(--ink)]">{d.count}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          {allDates.length === 1 && <p className="text-[10px] text-[var(--ink-faint)] mt-1">More data after your first week of daily scans</p>}
                        </div>

                        {/* Top Cited Domains card */}
                        <div className="panel rounded-xl p-5">
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold text-[var(--ink)]">Top Cited Domains <span className="text-[var(--ink-faint)] font-normal text-xs ml-1">ⓘ</span></p>
                          </div>
                          <p className="text-base font-bold text-[var(--ink)] mb-4">{citationDomains.length} Domains</p>
                          <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                            {citationDomains.slice(0, 7).map(([domain, info], i) => {
                              const pct = results.length ? Math.round((info.count / results.length) * 100) : 0;
                              return (
                                <div key={domain} className="flex items-center gap-3 py-2 border-b border-[var(--line)] last:border-0">
                                  <span className="text-xs text-[var(--ink-faint)] w-5 shrink-0 font-medium">#{i+1}</span>
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={28} height={28} className="rounded-md shrink-0 border border-[var(--line)]" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                  <span className="text-xs text-[var(--ink)]/80 truncate flex-1 font-medium">{domain}</span>
                                  <div className="text-right shrink-0">
                                    <p className="text-sm font-bold text-[var(--ink)]">{pct}%</p>
                                    <p className="text-[10px] text-[var(--ink-faint)]">{info.count} citations</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                    return isFreeTier ? <BlurBlock onUnlock={openPaywall}><LockedSkeleton rows={6} /></BlurBlock> : chartBody;
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
                          <div className="flex items-center gap-2 flex-1 panel rounded-lg px-3 py-2">
                            <svg className="w-4 h-4 text-[var(--ink-faint)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <input
                              value={citationSearch}
                              onChange={(e) => setCitationSearch(e.target.value)}
                              placeholder="Search citations"
                              className="text-sm flex-1 outline-none bg-transparent text-[var(--ink)]/90 placeholder:text-[var(--ink-faint)]"
                            />
                          </div>
                          <select
                            value={citationPromptFilter}
                            onChange={(e) => setCitationPromptFilter(e.target.value)}
                            className="text-xs border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--line-soft)] text-[var(--ink)]/80 outline-none"
                          >
                            {allPrompts.map((p) => <option key={p} value={p}>{p === "All" ? "All prompts" : p.length > 30 ? p.slice(0,30)+"…" : p}</option>)}
                          </select>
                          <select
                            value={citationTypeFilter}
                            onChange={(e) => setCitationTypeFilter(e.target.value)}
                            className="text-xs border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--line-soft)] text-[var(--ink)]/80 outline-none"
                          >
                            {allTypes.map((t) => <option key={t} value={t}>{t === "All" ? "All domain types" : t}</option>)}
                          </select>
                        </div>

                        {/* Domain table — scrolls horizontally on narrow screens */}
                        <div className="panel rounded-xl overflow-hidden">
                         <div className="overflow-x-auto">
                         <div className="min-w-[560px]">
                          {/* Table header */}
                          <div className="grid grid-cols-[64px_1fr_80px_120px] gap-x-4 px-5 py-3 border-b border-[var(--line)] bg-[var(--line-soft)]">
                            <span className="text-[11px] font-semibold text-[var(--ink-soft)]">Rank</span>
                            <span className="text-[11px] font-semibold text-[var(--ink-soft)]">Domain</span>
                            <span className="text-[11px] font-semibold text-[var(--ink-soft)] text-right flex items-center justify-end gap-0.5">Citations <svg className="w-3 h-3 opacity-40" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth="2"><path d="M8 3v10M5 10l3 3 3-3"/></svg></span>
                            <span className="text-[11px] font-semibold text-[var(--ink-soft)] text-right">Details</span>
                          </div>

                          {orderedDomains.length === 0 && (
                            <p className="px-5 py-8 text-sm text-[var(--ink-faint)] text-center">No citations match your filters</p>
                          )}

                          {orderedDomains.map(([domain, info], displayIdx) => {
                            const isReddit = domain.includes("reddit.com");
                            const isExpanded = expandedCitationDomains.has(domain);
                            const instances = citationInstances[domain] ?? [];
                            const originalRank = citationDomains.findIndex(([d]) => d === domain) + 1;
                            const rowLocked = isFreeTier && !isReddit;

                            const row = (
                              <div
                                key={domain}
                                className={`border-b border-[var(--line)] last:border-0 ${isReddit ? "border-l-[3px] border-l-blue-400" : ""}`}
                              >
                                {/* Domain row */}
                                <button
                                  onClick={() => {
                                    if (rowLocked) { openPaywall(); return; }
                                    setExpandedCitationDomains((prev) => {
                                      const next = new Set(prev);
                                      next.has(domain) ? next.delete(domain) : next.add(domain);
                                      return next;
                                    });
                                  }}
                                  className={`w-full grid grid-cols-[64px_1fr_80px_120px] gap-x-4 px-5 py-4 hover:bg-[var(--line-soft)]/70 transition-colors text-left items-center ${isReddit ? "bg-[#FF4500]/10" : ""}`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-xs text-[var(--ink-soft)] font-medium shrink-0">#{originalRank}</span>
                                  </div>
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`} alt="" width={20} height={20} className="rounded shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; }} />
                                    <span className="text-sm text-[var(--ink)]/90 font-medium truncate">{domain}</span>
                                  </div>
                                  <span className="text-sm font-semibold text-[var(--ink)] text-right">{info.count}</span>
                                  <div className="flex items-center justify-end gap-2">
                                    {isReddit ? (
                                      <span className="text-xs text-[var(--rust)] font-medium">Engagement opportunities</span>
                                    ) : (
                                      <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-[var(--rust)] hover:underline">Learn more ↗</a>
                                    )}
                                    <svg className={`w-4 h-4 text-[var(--ink-faint)] transition-transform duration-200 shrink-0 ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                                  </div>
                                </button>

                                {/* Expanded URL rows */}
                                {isExpanded && !rowLocked && (
                                  <div className="bg-[var(--line-soft)] border-t border-[var(--line)]">
                                    {instances.length === 0 ? (
                                      <p className="px-6 py-3 text-xs text-[var(--ink-faint)]">No individual URLs available</p>
                                    ) : (
                                      instances.map((item, i) => {
                                        const itemIsReddit = item.url.includes("reddit.com");
                                        const urlDisplay = item.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\?.*$/, "");
                                        const promptSnippet = item.promptText.length > 45 ? item.promptText.slice(0, 45) + "…" : item.promptText;
                                        // Only the first Reddit instance stays unlocked for free tier — everything past it is blurred.
                                        const instanceLocked = isFreeTier && isReddit && i > 0;
                                        const instanceRow = (
                                          <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-x-3 px-6 py-2.5 border-b border-[var(--line)]/60 last:border-0 items-center">
                                            <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-xs text-blue-700 hover:underline truncate" title={item.url}>{urlDisplay}</a>
                                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 ${SOURCE_TYPE_COLORS[getSourceType(domain)] ?? "bg-[var(--line)] text-[var(--ink-soft)]"}`}>{getSourceType(domain)}</span>
                                            <div className="flex items-center gap-1 shrink-0">
                                              <span className={`w-1.5 h-1.5 rounded-full ${ENGINE_COLORS[item.engine as AIEngine] ?? "bg-[var(--line)]"}`} />
                                              <span className="text-xs text-[var(--ink-soft)]">{ENGINE_LABELS[item.engine as AIEngine] ?? item.engine}</span>
                                            </div>
                                            <span className="text-xs text-[var(--ink-faint)] shrink-0 max-w-[140px] truncate hidden lg:block" title={item.promptText}>{promptSnippet}</span>
                                            {itemIsReddit ? (
                                              engagedUrls.has(item.url) ? (
                                                <button
                                                  onClick={() => { setEngageItem({ url: item.url, promptText: item.promptText, engine: item.engine }); setEngageDraft(""); }}
                                                  title="Already engaged — click to view or engage again"
                                                  className="shrink-0 flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-lg border border-[var(--olive)]/40 text-[var(--olive)] hover:bg-[var(--olive)]/10 transition-colors"
                                                >
                                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                  Engaged
                                                </button>
                                              ) : (
                                                <button onClick={() => { setEngageItem({ url: item.url, promptText: item.promptText, engine: item.engine }); setEngageDraft(""); }} className="shrink-0 text-xs font-medium px-3 py-1 rounded-lg bg-[#FF4500] text-white hover:bg-[#e03d00] transition-colors">Engage</button>
                                              )
                                            ) : (
                                              <a href={item.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-xs font-medium px-3 py-1 rounded-lg border border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line)] transition-colors">View →</a>
                                            )}
                                          </div>
                                        );
                                        return instanceLocked ? <BlurRow key={i} onUnlock={openPaywall} /> : instanceRow;
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                            return rowLocked ? <BlurRow key={domain} onUnlock={openPaywall} /> : row;
                          })}
                         </div>
                         </div>
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
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
              ) : (
                <div className="space-y-4">
                  {/* Manage competitors card */}
                  <div className="panel rounded-xl p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-base font-semibold text-[var(--ink)]">Tracked Competitors</h2>
                        <p className="text-xs text-[var(--ink-faint)] mt-0.5">Added to every scan — AI engines are checked for mentions of these brands</p>
                      </div>
                      {!editingCompetitors && (
                        <button
                          type="button"
                          onClick={() => {
                            setCompetitorDraft(brand.competitors);
                            setSuggestedCompetitors([]);
                            setEditingCompetitors(true);
                            setLoadingSuggestions(true);
                            fetch(`/api/competitors/suggest?brandId=${brand.id}`)
                              .then((r) => r.json())
                              .then((d) => setSuggestedCompetitors((d.suggestions ?? []).filter((s: string) => !brand.competitors.includes(s))))
                              .catch(() => {})
                              .finally(() => setLoadingSuggestions(false));
                          }}
                          className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] border border-[var(--line)] rounded-lg px-3 py-1.5 hover:bg-[var(--line-soft)] transition-colors"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                    {editingCompetitors ? (
                      <div>
                        <div className="flex flex-wrap gap-2 mb-3">
                          {competitorDraft.map((c) => (
                            <span key={c} className="flex items-center gap-1.5 text-xs bg-[var(--line)] text-[var(--ink)]/80 px-2.5 py-1 rounded-full">
                              {c}
                              <button onClick={() => setCompetitorDraft(competitorDraft.filter((x) => x !== c))} className="text-[var(--ink-faint)] hover:text-red-700 leading-none">×</button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2 mb-4">
                          <input
                            value={newCompetitorInput}
                            onChange={(e) => setNewCompetitorInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                e.stopPropagation();
                                const t = e.currentTarget.value.trim();
                                if (t) { setCompetitorDraft((prev) => prev.includes(t) ? prev : [...prev, t]); setNewCompetitorInput(""); }
                              }
                            }}
                            placeholder="Add competitor name…"
                            className="flex-1 text-sm border border-[var(--line)] rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--rust)]/40"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const t = newCompetitorInput.trim();
                              if (t) { setCompetitorDraft((prev) => prev.includes(t) ? prev : [...prev, t]); setNewCompetitorInput(""); }
                            }}
                            className="text-xs font-medium bg-[var(--rust)] text-[var(--surface)] rounded-lg px-3 py-1.5"
                          >Add</button>
                        </div>
                        {/* AI suggestions */}
                        <div className="mb-4">
                          <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-wider mb-2">
                            {loadingSuggestions ? "AI is detecting competitors…" : suggestedCompetitors.length > 0 ? "Suggested by AI — click to add" : ""}
                          </p>
                          {loadingSuggestions && <span className="w-4 h-4 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin inline-block" />}
                          {!loadingSuggestions && suggestedCompetitors.length > 0 && (
                            <div className="flex flex-wrap gap-2">
                              {suggestedCompetitors.filter((s) => !competitorDraft.includes(s)).map((s) => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setCompetitorDraft((prev) => [...prev, s])}
                                  className="text-xs bg-blue-400/10 text-blue-700 border border-blue-400/25 px-2.5 py-1 rounded-full hover:bg-blue-100 transition-colors"
                                >
                                  + {s}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={savingCompetitors}
                            onClick={async () => {
                              setSavingCompetitors(true);
                              await fetch("/api/brand", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: brand.id, name: brand.name, niche: brand.niche, competitors: competitorDraft, targetAudience: brand.targetAudience }) });
                              setBrand({ ...brand, competitors: competitorDraft });
                              setEditingCompetitors(false);
                              setSavingCompetitors(false);
                            }}
                            className="text-xs font-medium bg-[var(--rust)] text-[var(--surface)] rounded-lg px-4 py-1.5 disabled:opacity-50"
                          >
                            {savingCompetitors ? "Saving…" : "Save"}
                          </button>
                          <button type="button" onClick={() => setEditingCompetitors(false)} className="text-xs text-[var(--ink-soft)] hover:text-[var(--ink)]/80 px-3 py-1.5">Cancel</button>
                        </div>
                      </div>
                    ) : brand.competitors.length === 0 ? (
                      <p className="text-sm text-[var(--ink-faint)]">No competitors tracked yet. Click <strong>Edit</strong> to add some.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {brand.competitors.map((c) => (
                          <span key={c} className="text-xs bg-[var(--line)] text-[var(--ink)]/80 px-2.5 py-1 rounded-full">{c}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Share of voice chart */}
                  {scanned && (() => {
                    const allNames = [brand.name, ...brand.competitors];
                    const rows = allNames.map((name) => {
                      const isBrand = name === brand.name;
                      const mentions = isBrand
                        ? results.filter((r) => r.brandMentioned).length
                        : results.filter((r) => r.competitorMentions.some((c) => c.name === name)).length;
                      const pct = results.length ? Math.round((mentions / results.length) * 100) : 0;
                      return { name, isBrand, pct };
                    }).sort((a, b) => b.pct - a.pct);

                    const brandRow = rows.find((r) => r.isBrand);
                    const brandPct = brandRow?.pct ?? 0;
                    const maxPct = Math.max(...rows.map((r) => r.pct), 1);

                    // Previous scan comparison
                    const prevRun = scanHistory[1];
                    const prevScore = prevRun?.overall_score ?? null;
                    const diff = prevScore !== null ? brandPct - prevScore : null;

                    const sovBody = (
                      <div className="panel rounded-xl p-6">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className="text-base font-semibold text-[var(--ink)]">Share of Voice</h3>
                          <svg className="w-4 h-4 text-[var(--ink-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01"/></svg>
                        </div>
                        <p className="text-xs text-[var(--ink-faint)] mb-4">Your Brand AI mentions vs competitors</p>

                        {/* Big number */}
                        <div className="flex items-center gap-3 mb-6">
                          <span className="font-serif text-4xl font-[400] text-[var(--ink)]">{brandPct}%</span>
                          {diff !== null && (
                            <span className={`flex items-center gap-1 text-sm font-semibold px-2.5 py-1 rounded-full ${diff >= 0 ? "bg-[var(--rust)]/15 text-[var(--rust)]" : "bg-red-500/15 text-red-700"}`}>
                              {diff >= 0 ? "↑" : "↓"} {Math.abs(diff)}%
                            </span>
                          )}
                          {diff !== null && <span className="text-xs text-[var(--ink-faint)]">vs previous scan</span>}
                        </div>

                        {/* Bars */}
                        {brand.competitors.length === 0 ? (
                          <p className="text-sm text-[var(--ink-faint)]">Add competitors above, then re-scan to see share of voice data.</p>
                        ) : (
                          <>
                            <div className="space-y-2.5 mb-5">
                              {rows.map(({ name, isBrand, pct }) => (
                                <div key={name} className="flex items-center gap-3">
                                  <div className="flex items-center gap-1.5 w-32 shrink-0">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${isBrand ? "bg-[var(--rust)]" : "bg-blue-400/100"}`} />
                                    <span className={`text-xs truncate ${isBrand ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>{name}</span>
                                  </div>
                                  <div className="flex-1 h-7 bg-[var(--line)] rounded-lg overflow-hidden relative">
                                    <div
                                      className={`h-full rounded-lg flex items-center justify-end pr-2 transition-all duration-500 ${isBrand ? "bg-[var(--rust)]" : "bg-blue-400/100"}`}
                                      style={{ width: `${(pct / maxPct) * 100}%` }}
                                    >
                                      <span className="text-[11px] font-semibold text-white">{pct}%</span>
                                    </div>
                                  </div>
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${name.toLowerCase().replace(/\s+/g, "")}.com&sz=24`}
                                    className="w-6 h-6 rounded-full shrink-0 bg-[var(--line)]"
                                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                                    alt=""
                                  />
                                </div>
                              ))}
                            </div>
                            {/* X-axis */}
                            <div className="flex justify-between text-[10px] text-[var(--ink-faint)] border-t border-[var(--line)] pt-2">
                              {[0, 25, 50, 75, 100].map((v) => <span key={v}>{v}%</span>)}
                            </div>
                          </>
                        )}
                      </div>
                    );
                    return isFreeTier ? <BlurBlock onUnlock={openPaywall}><LockedSkeleton rows={5} /></BlurBlock> : sovBody;
                  })()}
                </div>
              )}
            </>
          )}

          {/* WEB ANALYTICS TAB */}
          {activeTab === "webAnalytics" && (() => {
            const webBody = !webAnalyticsLoaded ? (
              <div className="flex items-center justify-center py-24"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
            ) : (
              <div className={webAnalyticsFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
                  <StatCard label="Live Visitors" value={webAnalyticsData?.stats.liveVisitors ?? 0} sub="last 5 min" />
                  <StatCard label="Visitors" value={webAnalyticsData?.stats.visitors ?? 0} />
                  <StatCard label="Pageviews" value={webAnalyticsData?.stats.pageviews ?? 0} />
                  <StatCard label="Visit Duration" value={`${webAnalyticsData?.stats.avgDurationSeconds ?? 0}s`} />
                  <StatCard label="Bounce Rate" value={`${webAnalyticsData?.stats.bounceRate ?? 0}%`} />
                </div>

                {renderAnalyticsUsageBar()}

                <div className="panel rounded-xl overflow-hidden mb-5">
                  <button
                    onClick={() => setWebDetailsExpanded((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--line-soft)] transition-colors"
                  >
                    <p className="text-sm font-semibold text-[var(--ink)]">Live Visitor Details</p>
                    <svg className={`w-4 h-4 text-[var(--ink-faint)] transition-transform ${webDetailsExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {webDetailsExpanded && (
                    <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-[var(--line)] pt-4">
                      <div>
                        <p className="text-xs font-semibold text-[var(--ink)]/90 mb-2">Pages</p>
                        {!webAnalyticsData?.live.pages.length ? (
                          <p className="text-xs text-[var(--ink-faint)]">No active pages</p>
                        ) : (
                          <div className="space-y-1.5">
                            {webAnalyticsData.live.pages.map((p) => (
                              <div key={p.label} className="flex items-center justify-between gap-2">
                                <span className="text-xs font-mono text-[var(--ink)]/80 truncate">{p.label}</span>
                                <span className="text-xs font-semibold text-[var(--ink)] shrink-0">{p.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[var(--ink)]/90 mb-2">Referrers</p>
                        {!webAnalyticsData?.live.referrers.length ? (
                          <p className="text-xs text-[var(--ink-faint)]">No active referrers</p>
                        ) : (
                          <div className="space-y-1.5">
                            {webAnalyticsData.live.referrers.map((r) => (
                              <div key={r.label} className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[var(--ink)]/80 truncate">{r.label}</span>
                                <span className="text-xs font-semibold text-[var(--ink)] shrink-0">{r.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {!!webAnalyticsData?.topReferrers.length && (
                  <div className="panel rounded-xl p-5 mb-5">
                    <p className="text-sm font-semibold text-[var(--ink)] mb-1">Top Referrers</p>
                    <p className="text-xs text-[var(--ink-faint)] mb-3">Where visitors came from over this period — useful for checking ad/campaign traffic (e.g. x.com).</p>
                    <div className="space-y-2">
                      {webAnalyticsData.topReferrers.map((r) => (
                        <div key={r.label} className="flex items-center gap-3">
                          <span className="text-xs text-[var(--ink)]/80 font-medium w-28 shrink-0 truncate">{r.label}</span>
                          <div className="flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--rust)] rounded-full" style={{ width: `${Math.round((r.count / webAnalyticsData.topReferrers[0].count) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-[var(--ink)] w-10 text-right shrink-0">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {webAnalyticsData?.stats.pageviews === 0 && (
                  <div className="flex flex-col items-center text-center py-10 mb-2">
                    <p className="text-base font-semibold text-[var(--ink)] mb-1">No Analytics Data Yet</p>
                    <p className="text-sm text-[var(--ink-faint)] mb-5">Start tracking your website visitors by adding the tracking script below.</p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {[
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-7 4 14 2-7h4" />, label: "Real-time visitor tracking" },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M12 20V4M20 20v-6" />, label: "Detailed traffic analytics" },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z" />, label: "Privacy-focused insights" },
                      ].map((f) => (
                        <div key={f.label} className="flex items-center gap-1.5 text-xs text-[var(--ink-soft)]">
                          <span className="w-6 h-6 rounded-lg bg-[var(--rust-wash)] flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>{f.icon}</svg>
                          </span>
                          {f.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="panel rounded-xl p-5">
                  <p className="text-sm font-semibold text-[var(--ink)] mb-3">Add this script to the &lt;head&gt; section of your website:</p>
                  <div className="flex items-center gap-2 text-xs text-[var(--ink-soft)] border border-[var(--line)] rounded-lg px-3 py-2 mb-3 bg-[var(--line-soft)]">
                    <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>
                    <span className="truncate">{webAnalyticsData?.domain ? `https://${webAnalyticsData.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/` : ""}</span>
                  </div>
                  <div className="relative bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-3 py-2.5 pr-24 font-mono text-[11px] text-[var(--ink)]/90 overflow-x-auto mb-3">
                    {`<script src="https://www.rankongeo.com/track.js" data-site="${webAnalyticsData?.siteKey ?? ""}" defer></script>`}
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(`<script src="https://www.rankongeo.com/track.js" data-site="${webAnalyticsData?.siteKey ?? ""}" defer></script>`);
                          setCopiedSnippet(true);
                          setTimeout(() => setCopiedSnippet(false), 2000);
                        }}
                        title="Copy"
                        className="w-7 h-7 rounded-md border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--ink-soft)] hover:bg-[var(--line)] transition-colors"
                      >
                        {copiedSnippet ? (
                          <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                        )}
                      </button>
                      <button
                        onClick={() => sendTestEvent("web")}
                        disabled={sendingTestEvent}
                        className="h-7 px-2.5 rounded-md bg-[var(--ink)] text-[var(--surface)] text-[11px] font-semibold flex items-center gap-1 hover:opacity-90 disabled:opacity-50 transition-opacity"
                      >
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        {sendingTestEvent ? "…" : "Test"}
                      </button>
                    </div>
                  </div>
                  {testEventError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{testEventError}</p>}
                  <a href="/docs/web-analytics" target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-[var(--rust)] hover:underline inline-flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                    Read Documentation
                  </a>
                </div>
              </div>
            );

            return (
              <div className="max-w-4xl mx-auto w-full">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--ink)]">Web Analytics</h2>
                    <p className="text-sm text-[var(--ink-soft)] mt-0.5">Privacy first analytics for your website</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={webAnalyticsDays}
                      onChange={(e) => setWebAnalyticsDays(Number(e.target.value))}
                      className="text-xs font-semibold border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--surface)] text-[var(--ink)]/80 focus:outline-none focus:ring-1 focus:ring-[var(--rust)]/30"
                    >
                      <option value={7}>Last 7 Days</option>
                      <option value={30}>Last 30 Days</option>
                      <option value={90}>Last 90 Days</option>
                    </select>
                    <button
                      onClick={() => setWebsiteIdModal("web")}
                      className="text-xs font-semibold bg-[var(--ink)] text-[var(--surface)] px-3 py-2 rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                    >
                      Get Website Id
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </button>
                  </div>
                </div>
                {isFreeTier ? <BlurBlock onUnlock={openPaywall}><LockedSkeleton rows={7} /></BlurBlock> : webBody}
              </div>
            );
          })()}

          {/* LLM ANALYTICS TAB */}
          {activeTab === "llmAnalytics" && (() => {
            const llmBody = !llmAnalyticsLoaded ? (
              <div className="flex items-center justify-center py-24"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
            ) : (
              <div className={llmAnalyticsFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <div className="grid grid-cols-2 gap-3 mb-5">
                  <StatCard label="Live Bots" value={llmAnalyticsData?.stats.liveBots ?? 0} sub="last 5 min" />
                  <StatCard label="Bot Pageviews" value={llmAnalyticsData?.stats.botPageviews ?? 0} />
                </div>

                {renderAnalyticsUsageBar()}

                <div className="panel rounded-xl overflow-hidden mb-5">
                  <button
                    onClick={() => setLlmDetailsExpanded((v) => !v)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[var(--line-soft)] transition-colors"
                  >
                    <p className="text-sm font-semibold text-[var(--ink)]">Live Bot Details</p>
                    <svg className={`w-4 h-4 text-[var(--ink-faint)] transition-transform ${llmDetailsExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                  {llmDetailsExpanded && (
                    <div className="px-5 pb-5 grid grid-cols-1 sm:grid-cols-2 gap-6 border-t border-[var(--line)] pt-4">
                      <div>
                        <p className="text-xs font-semibold text-[var(--ink)]/90 mb-2">Pages</p>
                        {!llmAnalyticsData?.live.pages.length ? (
                          <p className="text-xs text-[var(--ink-faint)]">No active pages</p>
                        ) : (
                          <div className="space-y-1.5">
                            {llmAnalyticsData.live.pages.map((p) => (
                              <div key={p.label} className="flex items-center justify-between gap-2">
                                <span className="text-xs font-mono text-[var(--ink)]/80 truncate">{p.label}</span>
                                <span className="text-xs font-semibold text-[var(--ink)] shrink-0">{p.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-[var(--ink)]/90 mb-2">Bots</p>
                        {!llmAnalyticsData?.live.bots.length ? (
                          <p className="text-xs text-[var(--ink-faint)]">No active bots</p>
                        ) : (
                          <div className="space-y-1.5">
                            {llmAnalyticsData.live.bots.map((b) => (
                              <div key={b.label} className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[var(--ink)]/80 truncate">{BOT_NAME_LABELS[b.label] ?? b.label}</span>
                                <span className="text-xs font-semibold text-[var(--ink)] shrink-0">{b.count}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {!!llmAnalyticsData?.breakdown.length && (
                  <div className="panel rounded-xl p-5 mb-5">
                    <p className="text-sm font-semibold text-[var(--ink)] mb-3">Breakdown by bot</p>
                    <div className="space-y-2">
                      {llmAnalyticsData.breakdown.map((b) => (
                        <div key={b.botName} className="flex items-center gap-3">
                          <span className="text-xs text-[var(--ink)]/80 font-medium w-24 shrink-0">{BOT_NAME_LABELS[b.botName] ?? b.botName}</span>
                          <div className="flex-1 h-2 bg-[var(--line)] rounded-full overflow-hidden">
                            <div className="h-full bg-[var(--rust)] rounded-full" style={{ width: `${Math.round((b.count / llmAnalyticsData.stats.botPageviews) * 100)}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-[var(--ink)] w-10 text-right shrink-0">{b.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {llmAnalyticsData?.stats.botPageviews === 0 && (
                  <div className="flex flex-col items-center text-center py-10 mb-2">
                    <p className="text-base font-semibold text-[var(--ink)] mb-1">No AI Bot Data Yet</p>
                    <p className="text-sm text-[var(--ink-faint)] mb-5">Start tracking AI bots and crawlers by setting up server-side middleware.</p>
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      {[
                        { icon: <><rect x="6" y="6" width="12" height="12" rx="2" /><path strokeLinecap="round" d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></>, label: "AI bot detection" },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h4l2-7 4 14 2-7h4" />, label: "Real-time AI crawler tracking" },
                        { icon: <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V10M12 20V4M20 20v-6" />, label: "Detailed bot analytics" },
                      ].map((f) => (
                        <div key={f.label} className="flex items-center gap-1.5 text-xs text-[var(--ink-soft)]">
                          <span className="w-6 h-6 rounded-lg bg-[var(--rust-wash)] flex items-center justify-center shrink-0">
                            <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>{f.icon}</svg>
                          </span>
                          {f.label}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="panel rounded-xl p-5">
                  <p className="text-sm font-semibold text-[var(--ink)] mb-1">Set up server-side middleware to track AI bots and crawlers</p>
                  <p className="text-xs text-[var(--ink-faint)] mb-3">
                    AI crawlers mostly don&apos;t run JavaScript, so this needs a server-side call from your own middleware — see the docs for a ready-to-paste Next.js example.
                  </p>
                  <div className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-3 py-2.5 font-mono text-[11px] text-[var(--ink)]/90 overflow-x-auto mb-3 whitespace-pre">
{`curl -X POST https://www.rankongeo.com/api/track/bot \\
  -H "Content-Type: application/json" \\
  -d '{
    "siteKey": "${llmAnalyticsData?.siteKey ?? ""}",
    "path": "/",
    "userAgent": "GPTBot/1.0",
    "referrer": ""
  }'`}
                  </div>
                  {testEventError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{testEventError}</p>}
                  <div className="flex flex-wrap items-center gap-3">
                    <a
                      href="/docs/llm-analytics"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold bg-[var(--ink)] text-[var(--surface)] px-3 py-2 rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                      Read Documentation
                    </a>
                    <button
                      onClick={() => sendTestEvent("bot")}
                      disabled={sendingTestEvent}
                      className="text-xs font-semibold border border-[var(--line)] px-3 py-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--line-soft)] disabled:opacity-50 transition-colors inline-flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="6" y="6" width="12" height="12" rx="2" /><path strokeLinecap="round" d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" /></svg>
                      {sendingTestEvent ? "Sending…" : "Test AI Tracker"}
                    </button>
                  </div>
                </div>
              </div>
            );

            return (
              <div className="max-w-4xl mx-auto w-full">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
                  <div>
                    <h2 className="text-lg font-semibold text-[var(--ink)]">LLM Analytics</h2>
                    <p className="text-sm text-[var(--ink-soft)] mt-0.5">AI and bot traffic analytics</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={llmAnalyticsDays}
                      onChange={(e) => setLlmAnalyticsDays(Number(e.target.value))}
                      className="text-xs font-semibold border border-[var(--line)] rounded-lg px-3 py-2 bg-[var(--surface)] text-[var(--ink)]/80 focus:outline-none focus:ring-1 focus:ring-[var(--rust)]/30"
                    >
                      <option value={7}>Last 7 Days</option>
                      <option value={30}>Last 30 Days</option>
                      <option value={90}>Last 90 Days</option>
                    </select>
                    <button
                      onClick={() => setWebsiteIdModal("bot")}
                      className="text-xs font-semibold bg-[var(--ink)] text-[var(--surface)] px-3 py-2 rounded-lg hover:opacity-90 transition-opacity inline-flex items-center gap-1.5"
                    >
                      Get Website Id
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                    </button>
                  </div>
                </div>
                {isFreeTier ? <BlurBlock onUnlock={openPaywall}><LockedSkeleton rows={7} /></BlurBlock> : llmBody}
              </div>
            );
          })()}

          {/* Website ID modal — shared between Web & LLM Analytics */}
          {websiteIdModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setWebsiteIdModal(null)}>
              <div className="bg-[var(--surface)] rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-1">
                  <p className="text-base font-semibold text-[var(--ink)]">Website ID</p>
                  <button onClick={() => setWebsiteIdModal(null)} className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <p className="text-xs text-[var(--ink-faint)] mb-4">Copy your website ID for integration</p>

                <div className="flex items-center gap-2 text-xs text-[var(--ink-soft)] border border-[var(--line)] rounded-lg px-3 py-2 mb-3 bg-[var(--line-soft)]">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" /></svg>
                  <span className="truncate">
                    {(() => {
                      const domain = websiteIdModal === "web" ? webAnalyticsData?.domain : llmAnalyticsData?.domain;
                      return domain ? `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}/` : "";
                    })()}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 border border-[var(--line)] rounded-lg px-3 py-2 mb-4">
                  <span className="text-xs text-[var(--ink-soft)]">Website ID: <span className="font-mono font-semibold text-[var(--ink)]">{websiteIdModal === "web" ? webAnalyticsData?.siteKey : llmAnalyticsData?.siteKey}</span></span>
                  <button
                    onClick={() => {
                      const siteKey = (websiteIdModal === "web" ? webAnalyticsData?.siteKey : llmAnalyticsData?.siteKey) ?? "";
                      navigator.clipboard.writeText(siteKey);
                      setCopiedWebsiteId(true);
                      setTimeout(() => setCopiedWebsiteId(false), 2000);
                    }}
                    className="w-7 h-7 rounded-md border border-[var(--line)] flex items-center justify-center text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors shrink-0"
                  >
                    {copiedWebsiteId ? (
                      <svg className="w-3.5 h-3.5 text-[var(--rust)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="9" y="9" width="11" height="11" rx="1.5" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
                    )}
                  </button>
                </div>

                <a
                  href={websiteIdModal === "web" ? "/docs/web-analytics" : "/docs/llm-analytics"}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold border border-[var(--line)] px-3 py-2 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" /></svg>
                  Learn to Setup Analytics →
                </a>
              </div>
            </div>
          )}

          {/* Delete brand modal — irreversible, requires typing the domain to confirm */}
          {deleteBrandTarget && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => !deletingBrand && setDeleteBrandTarget(null)}>
              <div className="bg-[var(--surface)] rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-1">
                  <p className="text-base font-semibold text-red-600">Delete {deleteBrandTarget.name}?</p>
                  <button onClick={() => setDeleteBrandTarget(null)} className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <p className="text-xs text-[var(--ink-faint)] mb-4">
                  This permanently deletes all tracked prompts, scan history, articles, citations, and analytics data for <span className="font-medium text-[var(--ink-soft)]">{deleteBrandTarget.domain}</span>. This cannot be undone.
                </p>

                <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1.5">
                  Type <span className="font-mono font-semibold text-[var(--ink)]">{deleteBrandTarget.domain}</span> to confirm
                </label>
                <input
                  type="text"
                  value={deleteBrandConfirmText}
                  onChange={(e) => setDeleteBrandConfirmText(e.target.value)}
                  placeholder={deleteBrandTarget.domain}
                  className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm mb-4 bg-[var(--surface)] text-[var(--ink)] focus:outline-none focus:ring-1 focus:ring-red-500/40"
                />

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDeleteBrandTarget(null)}
                    className="flex-1 text-sm font-semibold border border-[var(--line)] px-3 py-2.5 rounded-lg text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={deleteBrand}
                    disabled={deleteBrandConfirmText !== deleteBrandTarget.domain || deletingBrand}
                    className="flex-1 text-sm font-semibold bg-red-600 text-white px-3 py-2.5 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {deletingBrand ? "Deleting…" : "Delete brand"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Buy credits modal — $1/credit, one-time top-up on top of the plan's monthly grant */}
          {showBuyCreditsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setShowBuyCreditsModal(false)}>
              <div className="bg-[var(--surface)] rounded-2xl w-full max-w-sm shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between mb-1">
                  <p className="text-base font-semibold text-[var(--ink)]">Buy credits</p>
                  <button onClick={() => setShowBuyCreditsModal(false)} className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
                <p className="text-xs text-[var(--ink-faint)] mb-5">$1 per credit, added on top of your current balance. Used for Reddit engagement orders and Web/LLM Analytics overage.</p>

                <div className="text-center mb-3">
                  <span className="font-signal-mono text-3xl font-bold text-[var(--ink)]">{buyCreditsQty}</span>
                  <span className="text-sm text-[var(--ink-faint)] ml-1.5">credits</span>
                </div>

                <input
                  type="range"
                  min={10}
                  max={1000}
                  step={5}
                  value={buyCreditsQty}
                  onChange={(e) => setBuyCreditsQty(Number(e.target.value))}
                  className="w-full accent-[var(--rust)] mb-4"
                />

                <div className="flex items-center justify-between border border-[var(--line)] rounded-lg px-3 py-2 mb-4 bg-[var(--line-soft)]">
                  <span className="text-xs text-[var(--ink-soft)]">Total</span>
                  <span className="font-signal-mono text-sm font-bold text-[var(--ink)]">${buyCreditsQty.toLocaleString()}</span>
                </div>

                <button
                  onClick={buyCredits}
                  disabled={buyCreditsSubmitting}
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-semibold bg-[var(--rust)] text-white px-3 py-2.5 rounded-lg hover:bg-[var(--rust-deep)] transition-colors disabled:opacity-60"
                >
                  {buyCreditsSubmitting ? "Redirecting…" : `Buy ${buyCreditsQty} credits — $${buyCreditsQty}`}
                </button>
              </div>
            </div>
          )}

          {/* RESEARCH */}
          {activeTab === "gaps" && (
            <>
              {!scanned && loadingResults ? (
                <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
              ) : !scanned ? (
                <EmptyState label="No research data" sub="Run a scan to discover gaps where competitors appear but you don't" />
              ) : gaps.length === 0 ? (
                <div className="panel rounded-xl p-8 text-center">
                  <p className="text-sm text-[var(--ink-soft)]">No gaps — your brand appeared in all scanned prompts.</p>
                </div>
              ) : (
                <>
                  <div className="mb-5">
                    <h2 className="text-xl font-bold text-[var(--ink)]">Research</h2>
                    <p className="text-sm text-[var(--ink-faint)] mt-0.5">
                      {isFreeTier ? <BlurInline onUnlock={openPaywall}>{2 + (decoyHash(brand.id ?? brand.name) % 9)} queries where {brand.name} isn&apos;t mentioned</BlurInline> : <>{gaps.length} queries where {brand.name} isn&apos;t mentioned</>}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {gaps.map((gap, i) => (
                      <div key={i} className="panel rounded-xl p-4">
                        <p className="text-sm font-medium text-[var(--ink)]/90 mb-2">{gap.promptText}</p>
                        {(() => {
                          const shownEngines = isFreeTier ? [decoyPick(gap.promptText, selectedEngines.length ? selectedEngines : (["chatgpt"] as const))] : gap.engines;
                          const shownCompetitor = isFreeTier ? decoyPick(gap.promptText, DECOY_COMPETITORS) : gap.topCompetitor;
                          const badges = (
                            <div className="flex items-center gap-2 mb-3 flex-wrap">
                              {shownEngines.map((e) => (
                                <span key={e} className="text-xs bg-red-500/10 text-red-700 px-2 py-0.5 rounded-full">Not in {ENGINE_LABELS[e as AIEngine]}</span>
                              ))}
                              {shownCompetitor && (
                                <span className="text-xs text-[var(--ink-faint)]">· <span className="font-medium text-[var(--ink-soft)]">{shownCompetitor}</span> appears instead</span>
                              )}
                            </div>
                          );
                          return isFreeTier ? <BlurInline onUnlock={openPaywall}>{badges}</BlurInline> : badges;
                        })()}
                        <div className="flex items-center justify-between gap-3">
                          {isFreeTier ? (
                            <BlurInline onUnlock={openPaywall}>
                              <p className="text-xs text-[var(--ink-faint)] flex-1">Publishing an article that answers this query will teach AI engines to recommend {brand.name} for it.</p>
                            </BlurInline>
                          ) : (
                            <p className="text-xs text-[var(--ink-faint)] flex-1">Publishing an article that answers this query will teach AI engines to recommend {brand.name} for it.</p>
                          )}
                          {(() => {
                            const existing = savedArticles.find((a) => a.keyword?.toLowerCase() === gap.promptText.toLowerCase());
                            const params = new URLSearchParams({ gapPrompt: gap.promptText, brand: brand.name, niche: brand.niche, brandId: brand.id ?? "", engines: encodeURIComponent(JSON.stringify(gap.engines)), ...(gap.topCompetitor ? { competitor: gap.topCompetitor } : {}) });
                            if (existing) {
                              const cacheKey = `article:${existing.keyword || existing.title}:${brand.name}`;
                              return (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[existing.status] ?? "bg-[var(--line)] text-[var(--ink-soft)]"}`}>{existing.status}</span>
                                  <button
                                    onClick={() => {
                                      if (isFreeTier) { openPaywall(); return; }
                                      if (existing.content) sessionStorage.setItem(cacheKey, JSON.stringify({ article: existing.content, title: existing.title, wordCount: existing.wordCount }));
                                      window.open(`/article?${params}`, "_blank");
                                    }}
                                    className="text-xs font-medium border border-[var(--line)] text-[var(--ink)]/80 px-3 py-1.5 rounded-lg hover:bg-[var(--line-soft)] transition-colors"
                                  >
                                    View article ↗
                                  </button>
                                </div>
                              );
                            }
                            return (
                              <button
                                onClick={() => { if (isFreeTier) { openPaywall(); return; } window.open(`/article?${params}`, "_blank"); }}
                                className="shrink-0 text-xs font-medium bg-[var(--rust)] text-[var(--surface)] px-3 py-1.5 rounded-lg hover:bg-[var(--rust-deep)] transition-colors"
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
          {/* ARTICLES */}
          {activeTab === "articles" && (
            <div className="flex flex-col lg:flex-row gap-5 lg:h-full">
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-xl font-bold text-[var(--ink)]">Articles</h2>
                    <p className="text-sm text-[var(--ink-faint)] mt-0.5">{savedArticles.length} pieces{publishedCount > 0 ? ` · ${publishedCount} published` : ""}{draftCount > 0 ? ` · ${draftCount} in draft` : ""}</p>
                  </div>
                  <button onClick={() => navTo("gaps")} className="text-xs text-[var(--ink-soft)] border border-[var(--line)] px-3 py-1.5 rounded-lg hover:border-[var(--line)] transition-colors">From research</button>
                </div>

                {savedArticles.length > 0 && (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
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
                        className={`text-xs px-3 py-1.5 rounded-lg transition-colors capitalize ${articleFilter === f ? "bg-[var(--rust)] text-[var(--surface)]" : "panel text-[var(--ink-soft)] hover:border-[var(--line)]"}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                )}

                {loadingArticles ? (
                  <div className="flex items-center justify-center py-32"><span className="w-6 h-6 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin" /></div>
                ) : filteredArticles.length === 0 ? (
                  <div className="bg-[var(--surface)] border border-dashed border-[var(--line)] rounded-xl p-12 text-center">
                    <p className="text-sm font-medium text-[var(--ink-soft)] mb-1">No articles yet</p>
                    <p className="text-xs text-[var(--ink-faint)] mb-4">Articles you generate from research gaps appear here</p>
                    <button
                      onClick={() => navTo("gaps")}
                      className="text-xs font-medium bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors"
                    >
                      Go to Research →
                    </button>
                  </div>
                ) : (
                  <div className="panel rounded-xl overflow-hidden overflow-x-auto">
                    <table className="w-full min-w-[520px]">
                      <thead>
                        <tr className="border-b border-[var(--line)]">
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Title</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Status</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">SEO</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Updated</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {filteredArticles.map((a) => (
                          <tr key={a.id} className={`hover:bg-[var(--line-soft)] cursor-pointer ${selectedArticle?.id === a.id ? "bg-[var(--line-soft)]" : ""}`} onClick={() => { setSelectedArticle(a); setShowSchedulePicker(false); }}>
                            <td className="px-5 py-3">
                              <p className="text-sm font-medium text-[var(--ink)]/90 line-clamp-1">{a.title}</p>
                              <p className="text-[10px] text-[var(--ink-faint)] mt-0.5 font-mono">{a.keyword}</p>
                            </td>
                            <td className="px-5 py-3">
                              <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[a.status] ?? "bg-[var(--line)] text-[var(--ink-soft)]"}`}>{a.status}</span>
                            </td>
                            <td className="px-5 py-3 text-sm font-medium text-[var(--ink)]/80">{a.seoScore > 0 ? a.seoScore : "—"}</td>
                            <td className="px-5 py-3 text-xs text-[var(--ink-faint)]">{new Date(a.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {selectedArticle && (
                <div className="w-full lg:w-72 shrink-0 panel rounded-xl p-5 flex flex-col gap-4 self-start lg:sticky lg:top-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-[var(--ink-soft)] uppercase tracking-widest">Article</p>
                    <button onClick={() => setSelectedArticle(null)} className="text-[var(--ink-faint)]/70 hover:text-[var(--ink-soft)] text-lg leading-none">×</button>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-[var(--ink)] leading-snug mb-2">{selectedArticle.title}</h3>
                    <div className="flex gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded capitalize ${STATUS_COLORS[selectedArticle.status] ?? "bg-[var(--line)] text-[var(--ink-soft)]"}`}>{selectedArticle.status}</span>
                      {selectedArticle.wordCount > 0 && <span className="text-[10px] bg-[var(--line)] text-[var(--ink-soft)] px-2 py-0.5 rounded">{selectedArticle.wordCount} words</span>}
                      {selectedArticle.seoScore > 0 && <span className="text-[10px] bg-[var(--rust)]/10 text-[var(--rust)] px-2 py-0.5 rounded font-medium">SEO {selectedArticle.seoScore}</span>}
                    </div>
                  </div>

                  {selectedArticle.content && (
                    <div className="bg-[var(--line-soft)] rounded-lg p-3">
                      <p className="text-xs text-[var(--ink-soft)] leading-relaxed line-clamp-5">{selectedArticle.content.replace(/^#+ .+\n+/m, "").replace(/[#*_`]/g, "").substring(0, 240)}…</p>
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
                      className="w-full text-xs font-medium bg-[var(--rust)] text-[var(--surface)] rounded-lg py-2.5 hover:bg-[var(--rust-deep)] transition-colors"
                    >
                      Open full article ↗
                    </button>

                    {publishingChannels.length > 0 && selectedArticle.status !== "published" && (
                      <button
                        onClick={() => { setPublishArticleId(selectedArticle.id); setPublishResult(null); setShowPublishModal(true); }}
                        className="w-full text-xs font-medium border border-[var(--line)] text-[var(--ink)]/80 rounded-lg py-2.5 hover:bg-[var(--line-soft)] transition-colors"
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
                            className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[var(--rust)]/40"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => setShowSchedulePicker(false)} className="flex-1 text-xs border border-[var(--line)] rounded-lg py-2 hover:bg-[var(--line-soft)] transition-colors text-[var(--ink-soft)]">Cancel</button>
                            <button
                              disabled={!scheduleDate}
                              onClick={() => scheduleArticle(selectedArticle.id, scheduleDate)}
                              className="flex-1 text-xs font-medium bg-[var(--rust)] text-[var(--surface)] rounded-lg py-2 hover:bg-[var(--rust-deep)] disabled:opacity-40 transition-colors"
                            >
                              Confirm
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setScheduleDate(""); setShowSchedulePicker(true); }}
                          className="w-full text-xs font-medium border border-[var(--line)] text-[var(--ink)]/80 rounded-lg py-2.5 hover:bg-[var(--line-soft)] transition-colors"
                        >
                          📅 Schedule
                        </button>
                      )
                    )}

                    {selectedArticle.status !== "published" && !showSchedulePicker && (
                      <button
                        onClick={() => updateArticleStatus(selectedArticle.id, "published")}
                        className="w-full text-xs font-medium border border-[var(--rust)]/30 text-[var(--rust)] rounded-lg py-2.5 hover:bg-[var(--rust)]/10 transition-colors"
                      >
                        ✓ Mark as published
                      </button>
                    )}

                    {selectedArticle.status !== "draft" && selectedArticle.status !== "published" && !showSchedulePicker && (
                      <button
                        onClick={() => updateArticleStatus(selectedArticle.id, "draft")}
                        className="w-full text-xs border border-[var(--line)] rounded-lg py-2 hover:bg-[var(--line-soft)] transition-colors text-[var(--ink-faint)]"
                      >
                        Back to draft
                      </button>
                    )}

                    {!showSchedulePicker && (
                      <button
                        onClick={() => { if (confirm("Delete this article?")) deleteArticle(selectedArticle.id); }}
                        className="w-full text-xs text-red-700/80 hover:text-red-700 py-1 transition-colors"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* AGENT */}
          {activeTab === "agent" && (
            <div className="flex flex-1 min-h-0">
              {/* Chat history sidebar — hidden on small screens; "+ New chat" stays in the top bar */}
              <div className="w-52 border-r border-[var(--line)] bg-[var(--line-soft)] hidden md:flex flex-col shrink-0">
                <div className="p-3 border-b border-[var(--line)]">
                  <button onClick={startNewChat} className="w-full flex items-center gap-2 text-sm text-[var(--ink-soft)] hover:text-[var(--ink)] hover:panel rounded-lg px-3 py-2 transition-colors">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4"/></svg>
                    New chat
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {chatSessions.length > 0 && (
                    <>
                      <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-wider px-2 py-1.5">Recents</p>
                      {chatSessions.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => loadChatSession(session)}
                          className={`w-full text-left text-xs px-2.5 py-2 rounded-lg mb-0.5 transition-colors truncate ${
                            activeChatId === session.id
                              ? "panel text-[var(--ink)] font-medium"
                              : "text-[var(--ink-soft)] hover:bg-[var(--surface)] hover:text-[var(--ink)]"
                          }`}
                        >
                          {session.title}
                        </button>
                      ))}
                    </>
                  )}
                  {chatSessions.length === 0 && (
                    <p className="text-[11px] text-[var(--ink-faint)] px-2 py-3">No previous chats yet</p>
                  )}
                </div>
              </div>

              {/* Chat area */}
              <div className="flex flex-col flex-1 min-h-0">
              <div className="px-6 pt-5 pb-2 shrink-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[var(--rust)] text-lg">✳</span>
                  <span className="font-semibold text-[var(--ink)]">GROG</span>
                  <span className="text-xs text-[var(--ink-faint)]">· live tracking data</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-6 pb-4 space-y-4">
                {agentMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    {msg.role === "assistant" && (
                      <span className="text-[var(--rust)] mr-2 mt-0.5 shrink-0">✳</span>
                    )}
                    <div
                      className={`max-w-lg text-sm leading-relaxed rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-[var(--rust)] text-[var(--surface)]"
                          : "bg-transparent text-[var(--ink)]/90"
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
                    <span className="text-[var(--rust)]">✳</span>
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-[var(--line)] rounded-full typing-dot" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 bg-[var(--line)] rounded-full typing-dot" style={{ animationDelay: "200ms" }} />
                      <span className="w-1.5 h-1.5 bg-[var(--line)] rounded-full typing-dot" style={{ animationDelay: "400ms" }} />
                    </div>
                  </div>
                )}
                <div ref={agentEndRef} />
              </div>

              <div className="px-6 pb-5 shrink-0">
                <div className="panel rounded-2xl shadow-sm">
                  <textarea
                    value={agentInput}
                    onChange={(e) => setAgentInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAgentMessage(); } }}
                    placeholder="Ask GROG about your AI visibility…"
                    rows={1}
                    className="w-full px-4 pt-3 pb-1 text-sm text-[var(--ink)]/90 placeholder-gray-400 resize-none outline-none rounded-t-2xl"
                  />
                  <div className="flex items-center justify-between px-4 pb-3">
                    <span className="text-xs text-[var(--ink-faint)]">
                      <span className="w-1.5 h-1.5 bg-[var(--line)] rounded-full inline-block mr-1" />
                      GROG · reads your live data
                    </span>
                    <button
                      onClick={sendAgentMessage}
                      disabled={!agentInput.trim() || agentLoading}
                      className="w-7 h-7 bg-[var(--rust)] disabled:opacity-30 text-[var(--surface)] rounded-lg flex items-center justify-center transition-opacity"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 19V5M5 12l7-7 7 7" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              </div> {/* end chat area */}
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
                    <h2 className="text-xl font-bold text-[var(--ink)]">Publishing</h2>
                    <p className="text-sm text-[var(--ink-faint)] mt-0.5">Distribution status across {activeChannels.length} channel{activeChannels.length !== 1 ? "s" : ""}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                  <StatCard label="Published / Mo" value={publishedThisMonth} sub={`${publishingLog.filter(e => e.status === "published").length} total`} />
                  <StatCard label="Syndications" value={publishingLog.filter(e => e.status === "published").length} sub="across all channels" />
                  <StatCard label="Channels Active" value={`${activeChannels.length}/${publishingChannels.length}`} sub={`${publishingChannels.filter(c => c.status === "paused").length} paused`} />
                  <StatCard label="Failed" value={publishingLog.filter(e => e.status === "failed").length} sub="delivery errors" />
                </div>

                <div className="panel rounded-xl p-5 mb-4">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-[var(--ink)]">Channels · {publishingChannels.length} connected</p>
                    <button onClick={() => setShowAddChannel(true)} className="text-xs text-[var(--ink-soft)] border border-[var(--line)] px-3 py-1.5 rounded-lg hover:border-[var(--line)] transition-colors">+ Add channel</button>
                  </div>
                  {publishingChannels.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-[var(--ink-faint)] mb-3">No channels yet</p>
                      <button onClick={() => setShowAddChannel(true)} className="text-xs font-medium bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">Add your first channel →</button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {publishingChannels.map((ch) => (
                        <div key={ch.id} className="border border-[var(--line)] rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <span className="text-base">{CHANNEL_ICONS[ch.type] ?? "🔗"}</span>
                            <span className="text-sm font-semibold text-[var(--ink)]">{ch.name}</span>
                            <button onClick={() => toggleChannel(ch.id, ch.status)} className="ml-auto text-[10px] text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">
                              {ch.status === "active" ? "Pause" : "Resume"}
                            </button>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded ${ch.status === "active" ? "bg-[var(--rust)]/10 text-[var(--rust)]" : "bg-[var(--line)] text-[var(--ink)]/80"}`}>{ch.status === "active" ? "Active" : "Paused"}</span>
                          <p className="text-[10px] text-[var(--ink-faint)] mt-2 truncate">{ch.url}</p>
                          <p className="text-[10px] text-[var(--ink-faint)]">Last: {ch.last_published_at ? timeAgo(ch.last_published_at) + " ago" : "—"}</p>
                          <button onClick={() => deleteChannel(ch.id)} className="mt-2 text-[10px] text-red-700/80 hover:text-red-700">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="panel rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <p className="text-sm font-semibold text-[var(--ink)]">Activity log</p>
                      <span className="w-1.5 h-1.5 bg-[var(--rust)]/100 rounded-full" />
                      <span className="text-xs text-[var(--ink-faint)]">real-time</span>
                    </div>
                    {publishingLog.length === 0 ? (
                      <p className="text-xs text-[var(--ink-faint)] py-4 text-center">No activity yet — publish an article to see the log</p>
                    ) : (
                      <div className="space-y-3">
                        {publishingLog.slice(0, 10).map((entry) => (
                          <div key={entry.id} className="flex items-start gap-3">
                            <span className="text-[10px] text-[var(--ink-faint)] w-6 shrink-0 mt-0.5">{timeAgo(entry.created_at)}</span>
                            <span className="text-xs font-medium text-blue-700 w-20 shrink-0 truncate">{entry.publishing_channels?.name ?? "—"}</span>
                            <span className="text-xs text-[var(--ink-soft)] flex-1 truncate">{entry.article_title ?? "—"}</span>
                            <span className={`text-[10px] font-medium shrink-0 ${entry.status === "published" ? "text-[var(--rust)]" : entry.status === "failed" ? "text-red-700" : "text-[var(--ink-soft)]"}`}>{entry.status}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="panel rounded-xl p-5">
                    <p className="text-sm font-semibold text-[var(--ink)] mb-4">Upcoming · scheduled articles</p>
                    {upcoming.length === 0 ? (
                      <p className="text-xs text-[var(--ink-faint)] py-4 text-center">No scheduled articles — set an article&apos;s status to &quot;scheduled&quot; to see it here</p>
                    ) : (
                      <div className="space-y-3">
                        {upcoming.map((item) => {
                          const ch = publishingChannels.find((c) => c.id === item.brandId);
                          return (
                            <div key={item.id} className="flex items-start gap-3">
                              <span className="text-xs text-[var(--ink-soft)] flex-1 truncate">{item.title}</span>
                              {ch && <span className="text-xs font-medium text-blue-700 shrink-0">{ch.name}</span>}
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

          {/* ALERTS */}
          {activeTab === "alerts" && (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-xl font-bold text-[var(--ink)]">Alerts</h2>
                  <p className="text-sm text-[var(--ink-faint)] mt-0.5">Webhook, Slack, Discord and email destinations plus a live delivery log</p>
                </div>
                <button onClick={() => setShowAddAlert(true)} className="text-xs font-medium bg-[var(--rust)] text-[var(--surface)] px-3 py-1.5 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">+ New destination</button>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
                <StatCard label="Destinations" value={alertDestinations.length} sub="channels wired" />
                <StatCard label="Active" value={alertDestinations.filter(d => d.status === "active").length} sub="enabled" />
                <StatCard label="Recent Deliveries" value={alertDeliveries.length} sub="last 20" />
                <StatCard label="Failed" value={alertDeliveries.filter(d => d.status === "failed").length} sub="need attention" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="panel rounded-xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--line)]">
                    <p className="text-sm font-semibold text-[var(--ink)]">Destinations · {alertDestinations.length}</p>
                  </div>
                  {alertDestinations.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-[var(--ink-faint)] mb-3">No destinations yet</p>
                      <button onClick={() => setShowAddAlert(true)} className="text-xs font-medium bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">Add Slack or webhook →</button>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--line)]">
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Destination</th>
                          <th className="px-5 py-3 text-left text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Kind</th>
                          <th className="px-5 py-3 text-right text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Status</th>
                          <th className="px-5 py-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {alertDestinations.map((dest) => (
                          <tr key={dest.id} className="hover:bg-[var(--line-soft)]">
                            <td className="px-5 py-3 text-sm font-medium text-[var(--ink)]/90">{dest.name}</td>
                            <td className="px-5 py-3">
                              <span className="text-[10px] font-medium bg-[var(--line)] text-[var(--ink-soft)] px-2 py-0.5 rounded">{dest.kind}</span>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => toggleAlertDestination(dest.id, dest.status)} className={`text-[10px] font-medium px-2 py-0.5 rounded ${dest.status === "active" ? "bg-[var(--rust)]/10 text-[var(--rust)]" : "bg-[var(--line)] text-[var(--ink)]/80"}`}>{dest.status === "active" ? "Active" : "Paused"}</button>
                            </td>
                            <td className="px-5 py-3 text-right">
                              <button onClick={() => deleteAlertDestination(dest.id)} className="text-[10px] text-red-700/80 hover:text-red-700">Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="panel rounded-xl p-5">
                  <p className="text-sm font-semibold text-[var(--ink)] mb-4">Recent deliveries</p>
                  {alertDeliveries.length === 0 ? (
                    <p className="text-xs text-[var(--ink-faint)] py-4 text-center">No deliveries yet — alerts fire when scans detect significant changes</p>
                  ) : (
                    <div className="space-y-3">
                      {alertDeliveries.map((d) => (
                        <div key={d.id} className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-[var(--ink-soft)]">{d.alert_destinations?.kind ?? "—"} · {d.event_type}</p>
                            {d.error_detail && <p className="text-[10px] text-red-700 mt-0.5">{d.error_detail}</p>}
                          </div>
                          <span className="text-[10px] text-[var(--ink-faint)] shrink-0">{timeAgo(d.created_at)}</span>
                          <span className={`text-[10px] font-medium shrink-0 ${d.status === "succeeded" ? "text-[var(--rust)]" : "text-red-700"}`}>{d.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

          {/* FEEDBACK TAB */}
          {activeTab === "feedback" && (
            <div className="max-w-3xl mx-auto w-full">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-[var(--ink)]">Feedback &amp; Suggestions</h2>
                <p className="text-sm text-[var(--ink-soft)] mt-0.5">Share your ideas, report bugs, or suggest improvements. We read every submission.</p>
              </div>

              <div className="grid md:grid-cols-[1fr_260px] gap-5">
                <div className="panel rounded-xl p-5">
                  <p className="text-sm font-semibold text-[var(--ink)] mb-4">Submit your feedback</p>

                  <p className="text-[10px] font-semibold text-[var(--ink-soft)] mb-1.5">Category</p>
                  <select
                    value={feedbackCategory}
                    onChange={(e) => setFeedbackCategory(e.target.value)}
                    className="w-full text-sm border border-[var(--line)] bg-[var(--cream)] rounded-lg px-3 py-2 mb-3 outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)]/40"
                  >
                    <option value="">Select a category</option>
                    {FEEDBACK_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>

                  <p className="text-[10px] font-semibold text-[var(--ink-soft)] mb-1.5">Title</p>
                  <input
                    value={feedbackTitle}
                    onChange={(e) => setFeedbackTitle(e.target.value.slice(0, 200))}
                    placeholder="Brief summary of your feedback"
                    maxLength={200}
                    className="w-full text-sm border border-[var(--line)] bg-[var(--cream)] rounded-lg px-3 py-2 outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--rust)]/40"
                  />
                  <p className="text-[10px] text-[var(--ink-faint)] text-right mb-3">{feedbackTitle.length}/200</p>

                  <p className="text-[10px] font-semibold text-[var(--ink-soft)] mb-1.5">Description</p>
                  <textarea
                    value={feedbackDescription}
                    onChange={(e) => setFeedbackDescription(e.target.value.slice(0, 2000))}
                    placeholder="Please provide detailed information about your feedback…"
                    maxLength={2000}
                    rows={5}
                    className="w-full text-sm border border-[var(--line)] bg-[var(--cream)] rounded-lg px-3 py-2 outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--rust)]/40 resize-y"
                  />
                  <p className="text-[10px] text-[var(--ink-faint)] text-right mb-3">{feedbackDescription.length}/2000</p>

                  {feedbackError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{feedbackError}</p>}

                  <button
                    onClick={submitFeedback}
                    disabled={feedbackSubmitting}
                    className="w-full text-sm font-semibold bg-[var(--olive)] text-[var(--surface)] py-2.5 rounded-lg hover:bg-[var(--olive)]/80 disabled:opacity-50 transition-colors"
                  >
                    {feedbackSubmitting ? "Submitting…" : "Submit Feedback"}
                  </button>
                </div>

                <div className="space-y-4">
                  <div className="panel rounded-xl p-4">
                    <p className="text-xs font-semibold text-[var(--ink)] mb-3">What Happens Next?</p>
                    <div className="space-y-2.5">
                      {[
                        "Your feedback is sent to our team",
                        "We review and evaluate your suggestion",
                        "If approved, we add it to our roadmap",
                        "You might see your idea implemented soon!",
                      ].map((step, i) => (
                        <div key={i} className="flex items-start gap-2.5">
                          <span className="w-4 h-4 rounded-full bg-[var(--olive)]/15 text-[var(--olive)] text-[9px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <p className="text-[11px] text-[var(--ink-soft)] leading-relaxed">{step}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="panel rounded-xl p-4">
                    <p className="text-xs font-semibold text-[var(--ink)] mb-3">Category Guide</p>
                    <div className="space-y-2.5">
                      {FEEDBACK_CATEGORIES.map((c) => (
                        <div key={c.value}>
                          <p className="text-[11px] font-semibold text-[var(--ink)]/90">{c.label}</p>
                          <p className="text-[10px] text-[var(--ink-faint)]">{c.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {feedbackSubmissions.length > 0 && (
                <div className="panel rounded-xl p-5 mt-5">
                  <p className="text-sm font-semibold text-[var(--ink)] mb-4">Your submissions</p>
                  <div className="space-y-3">
                    {feedbackSubmissions.map((f) => (
                      <div key={f.id} className="border border-[var(--line)] rounded-lg px-3 py-2.5">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-soft)]">
                            {FEEDBACK_CATEGORIES.find((c) => c.value === f.category)?.label ?? f.category}
                          </span>
                          <span className="text-[10px] text-[var(--ink-faint)] ml-auto">{timeAgo(f.created_at)}</span>
                        </div>
                        <p className="text-xs font-semibold text-[var(--ink)]/90">{f.title}</p>
                        <p className="text-xs text-[var(--ink-soft)] mt-0.5 line-clamp-2">{f.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TASKS TAB */}
          {activeTab === "tasks" && (
            <div className="max-w-3xl mx-auto w-full">
              <div className="mb-5">
                <h2 className="text-lg font-semibold text-[var(--ink)]">Tasks</h2>
                <p className="text-sm text-[var(--ink-soft)] mt-0.5">Order Reddit engagement directly, or track replies submitted from Citations.</p>
              </div>

              {/* Standalone order form */}
              <div className="panel rounded-xl p-4 mb-6">
                <p className="text-sm font-semibold text-[var(--ink)] mb-1">Order Reddit engagement</p>
                <p className="text-xs text-[var(--ink-faint)] mb-3">First pick what you're boosting — a whole post/thread, or one specific comment.</p>

                {/* Tier 1: target — the axis people actually get confused about */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {(["post", "comment"] as const).map((target) => (
                    <button
                      key={target}
                      onClick={() => setRedditOrderService(REDDIT_TARGET_SERVICES[target][0])}
                      className={`text-left px-3 py-2.5 rounded-lg border transition-colors ${
                        redditOrderTarget === target
                          ? "border-[#FF4500] bg-[#FF4500]/5"
                          : "border-[var(--line)] hover:bg-[var(--line-soft)]"
                      }`}
                    >
                      <p className="text-xs font-semibold text-[var(--ink)]">{target === "post" ? "A whole post" : "One specific comment"}</p>
                      <p className="text-[10px] text-[var(--ink-faint)] mt-0.5">
                        {target === "post" ? "Boost the thread's overall visibility" : "Boost one reply's ranking within a thread"}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Tier 2: action within that target */}
                <div className="flex gap-1 mb-3 bg-[var(--line)] rounded-lg p-1 w-fit">
                  {REDDIT_TARGET_SERVICES[redditOrderTarget].map((s) => (
                    <button
                      key={s}
                      onClick={() => setRedditOrderService(s)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                        redditOrderService === s ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]/80"
                      }`}
                    >
                      {REDDIT_SERVICE_META[s].label}
                    </button>
                  ))}
                </div>

                <input
                  value={redditOrderUrl}
                  onChange={(e) => setRedditOrderUrl(e.target.value)}
                  placeholder={redditOrderTarget === "comment" ? "https://www.reddit.com/r/.../comments/.../comment/..." : "https://www.reddit.com/r/.../comments/..."}
                  className="w-full text-sm border border-[var(--line)] bg-[var(--cream)] rounded-lg px-3 py-2 outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--rust)]/40"
                />
                <p className="text-[10px] text-[var(--ink-faint)] mt-1 mb-3">
                  {redditOrderTarget === "comment"
                    ? "Paste the comment's own link, not the post's — on Reddit, click the timestamp under the specific comment (or its \"…\" menu → Share → Copy Link) to get it."
                    : "The link to the post/thread itself."}
                </p>

                {redditOrderService === "custom_comments" ? (
                  <div className="mb-3">
                    <textarea
                      value={redditOrderComment}
                      onChange={(e) => setRedditOrderComment(e.target.value)}
                      placeholder="Comment to post…"
                      maxLength={1000}
                      rows={3}
                      className="w-full text-sm border border-[var(--line)] bg-[var(--cream)] rounded-lg px-3 py-2 outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--rust)]/40 resize-y"
                    />
                    <p className="text-[10px] text-[var(--ink-faint)] mt-1">No NSFW, explicit, hateful, or illegal content — orders that violate this are rejected before any credits are charged.</p>
                  </div>
                ) : (
                  <div className="flex gap-3 mb-3">
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-[var(--ink-soft)] mb-1.5">Quantity ({REDDIT_SERVICE_META[redditOrderService].min}–{REDDIT_SERVICE_META[redditOrderService].max})</p>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setRedditOrderQty((q) => Math.max(REDDIT_SERVICE_META[redditOrderService].min, q - 5))} className="w-7 h-7 rounded-lg border border-[var(--line)] flex items-center justify-center text-[var(--ink-soft)] hover:bg-[var(--line-soft)] font-medium text-sm">−</button>
                        <span className="text-sm font-semibold text-[var(--ink)] w-10 text-center">{redditOrderQty}</span>
                        <button onClick={() => setRedditOrderQty((q) => Math.min(REDDIT_SERVICE_META[redditOrderService].max, q + 5))} className="w-7 h-7 rounded-lg border border-[var(--line)] flex items-center justify-center text-[var(--ink-soft)] hover:bg-[var(--line-soft)] font-medium text-sm">+</button>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] font-semibold text-[var(--ink-soft)] mb-1.5">Speed</p>
                      <select
                        value={redditOrderSpeed}
                        onChange={(e) => setRedditOrderSpeed(e.target.value as "slow" | "normal" | "fast")}
                        className="w-full text-xs border border-[var(--line)] rounded-lg px-2 py-1.5 bg-[var(--line-soft)] text-[var(--ink)]/80 focus:outline-none focus:ring-1 focus:ring-[var(--rust)]/30"
                      >
                        <option value="slow">Slow (safer)</option>
                        <option value="normal">Normal</option>
                        <option value="fast">Fast</option>
                      </select>
                    </div>
                  </div>
                )}

                {REDDIT_SERVICE_META[redditOrderService].caveat && (
                  <p className="text-[10px] text-[var(--rust-deep)] bg-[var(--rust-wash)] rounded-lg px-3 py-2 mb-3">{REDDIT_SERVICE_META[redditOrderService].caveat}</p>
                )}

                <div className="flex items-center justify-between text-[10px] text-[var(--ink-faint)] bg-[var(--line-soft)] rounded-lg px-3 py-2 mb-3">
                  <span>
                    {redditOrderService === "custom_comments"
                      ? "1 comment"
                      : `${redditOrderQty} ${REDDIT_SERVICE_META[redditOrderService].label.toLowerCase()} × ${REDDIT_SERVICE_META[redditOrderService].creditsPerUnit} credits`}
                  </span>
                  <span className="font-semibold text-[var(--ink)]/80">
                    {redditOrderService === "custom_comments" ? REDDIT_SERVICE_META.custom_comments.creditsPerUnit : redditOrderQty * REDDIT_SERVICE_META[redditOrderService].creditsPerUnit} credits
                  </span>
                </div>

                {redditOrderError && <p className="text-xs text-red-700 bg-red-500/10 rounded-lg px-3 py-2 mb-3">{redditOrderError}</p>}
                {redditOrderSuccess && <p className="text-xs text-[var(--rust-deep)] bg-[var(--rust-wash)] rounded-lg px-3 py-2 mb-3">{redditOrderSuccess}</p>}

                <button
                  onClick={submitRedditOrder}
                  disabled={redditOrderSubmitting || !redditOrderUrl.trim() || (redditOrderService === "custom_comments" ? !redditOrderComment.trim() : false)}
                  className="w-full text-sm font-semibold bg-[#FF4500] text-white py-2.5 rounded-lg hover:bg-[#e03d00] disabled:opacity-50 transition-colors"
                >
                  {redditOrderSubmitting ? "Submitting…" : "Submit order"}
                </button>
              </div>

              {/* Subtabs */}
              <div className="flex gap-1 mb-5 bg-[var(--line)] rounded-xl p-1 w-fit">
                {(["pending", "completed", "failed"] as const).map((f) => {
                  const count = engageTasks.filter((t) => taskMatchesFilter(t, f)).length;
                  return (
                    <button
                      key={f}
                      onClick={() => setTaskFilter(f)}
                      className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all capitalize ${
                        taskFilter === f
                          ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm"
                          : "text-[var(--ink-soft)] hover:text-[var(--ink)]/80"
                      }`}
                    >
                      {f}
                      {count > 0 && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                          taskFilter === f
                            ? f === "failed" ? "bg-red-500/15 text-red-700" : "bg-[var(--rust-wash)]/15 text-[var(--rust-deep)]"
                            : "bg-[var(--line)] text-[var(--ink-soft)]"
                        }`}>{count}</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {engageTasks.filter((t) => taskMatchesFilter(t, taskFilter)).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-12 h-12 rounded-full bg-[var(--line)] flex items-center justify-center mb-3">
                    <svg className="w-6 h-6 text-[var(--ink-faint)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                  </div>
                  {taskFilter === "pending" ? (
                    <>
                      <p className="text-sm font-medium text-[var(--ink)]/80 mb-1">No pending tasks</p>
                      <p className="text-xs text-[var(--ink-faint)] max-w-xs">Order Reddit engagement above, or go to Citations and click Engage on a Reddit link.</p>
                    </>
                  ) : taskFilter === "completed" ? (
                    <>
                      <p className="text-sm font-medium text-[var(--ink)]/80 mb-1">No completed tasks yet</p>
                      <p className="text-xs text-[var(--ink-faint)] max-w-xs">Completed orders appear here once delivered.</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-medium text-[var(--ink)]/80 mb-1">No failed tasks</p>
                      <p className="text-xs text-[var(--ink-faint)] max-w-xs">Orders that fail are automatically refunded and show up here.</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {engageTasks.filter((t) => taskMatchesFilter(t, taskFilter)).map((task) => {
                    const badge = TASK_STATUS_BADGE[task.status] ?? TASK_STATUS_BADGE.pending;
                    const serviceMeta = REDDIT_SERVICE_META[task.serviceType] ?? REDDIT_SERVICE_META.post_upvote;
                    // Post vs comment upvotes share the word "Upvotes" — qualify it here since
                    // this list has no tab grouping to disambiguate them like the order form does.
                    const serviceLabel = task.serviceType === "custom_comments" ? serviceMeta.label : `${serviceMeta.target === "comment" ? "Comment" : "Post"} ${serviceMeta.label}`;
                    return (
                    <div key={task.id} className="panel rounded-xl p-4 hover:border-[var(--line)] transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-[#FF4500] flex items-center justify-center shrink-0 mt-0.5">
                          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
                            <circle cx="10" cy="10" r="10" fill="white" fillOpacity="0.2"/>
                            <path fill="white" d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/>
                          </svg>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badge.className}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClassName}`} />
                              {badge.label}
                            </span>
                            <span className="text-[10px] text-[var(--ink-faint)]">{serviceLabel}</span>
                            {task.engine && <span className="text-[10px] text-[var(--ink-faint)]">{ENGINE_LABELS[task.engine as AIEngine] ?? task.engine}</span>}
                            <span className="text-[10px] text-[var(--ink-faint)] ml-auto">{new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          </div>
                          <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 hover:underline truncate block max-w-full mb-2">
                            {task.url.replace(/^https?:\/\/(www\.)?/, "")}
                          </a>
                          {task.replyText && (
                            <p className="text-xs text-[var(--ink-soft)] bg-[var(--line-soft)] rounded-lg px-3 py-2 border border-[var(--line)] line-clamp-2 mb-2">{task.replyText}</p>
                          )}
                          <div className="flex items-center gap-4 text-[10px] text-[var(--ink-faint)]">
                            {task.creditsCharged > 0 ? (
                              <>
                                {task.serviceType !== "custom_comments" && (
                                  <span className="flex items-center gap-1">
                                    <svg className="w-3 h-3 text-[#FF4500]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l8 8H4z"/></svg>
                                    {task.upvotesOrdered} {serviceLabel.toLowerCase()} ordered
                                  </span>
                                )}
                                {task.serviceType !== "custom_comments" && <span className="capitalize">{task.deliverySpeed} delivery</span>}
                                <span className="font-medium text-[var(--ink-soft)]">{task.creditsCharged} credits</span>
                              </>
                            ) : (
                              <span>No credits spent</span>
                            )}
                            {task.promptText && <span className="truncate max-w-[160px]">for: <span className="italic">{task.promptText}</span></span>}
                          </div>
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ADMIN TAB */}
          {activeTab === "admin" && isAdmin && (
            <div className="lg:h-full flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-[var(--ink)]">Admin</h2>
                  <p className="text-xs text-[var(--ink-faint)] mt-0.5">{adminView === "tasks" ? "All user tasks" : "All feedback submissions"}</p>
                </div>
                <div className="flex gap-1 bg-[var(--line)] rounded-lg p-1">
                  {(["tasks", "feedback"] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setAdminView(v)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-all ${
                        adminView === v ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm" : "text-[var(--ink-soft)] hover:text-[var(--ink)]/80"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              {adminView === "tasks" && (
              <div className="lg:h-full flex flex-col lg:flex-row gap-5">
              {/* Left: user list */}
              <div className="w-full lg:w-64 shrink-0 flex flex-col gap-2">
                {adminLoading ? (
                  <div className="flex items-center gap-2 py-6 text-xs text-[var(--ink-faint)]"><span className="w-3 h-3 border-2 border-[var(--line)] border-t-transparent rounded-full animate-spin" /> Loading…</div>
                ) : (() => {
                  const byEmail: Record<string, AdminTask[]> = {};
                  adminTasks.forEach((t) => { if (!byEmail[t.userEmail]) byEmail[t.userEmail] = []; byEmail[t.userEmail].push(t); });
                  const emails = Object.keys(byEmail).sort();
                  return emails.length === 0 ? (
                    <p className="text-xs text-[var(--ink-faint)] py-6 text-center">No tasks yet</p>
                  ) : (
                    <div className="space-y-1">
                      {emails.map((email) => {
                        const userTasks = byEmail[email];
                        const pendingCount = userTasks.filter(t => t.status === "pending").length;
                        const isSelected = adminSelectedEmail === email;
                        return (
                          <button
                            key={email}
                            onClick={() => setAdminSelectedEmail(isSelected ? null : email)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${isSelected ? "bg-[var(--rust)] border-[var(--rust)] text-[var(--surface)]" : "bg-[var(--surface)] border-[var(--line)] text-[var(--ink)]/80 hover:border-[var(--line)]"}`}
                          >
                            <p className="text-xs font-medium truncate">{email}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-[10px] ${isSelected ? "text-[var(--ink-faint)]/70" : "text-[var(--ink-faint)]"}`}>{userTasks.length} task{userTasks.length !== 1 ? "s" : ""}</span>
                              {pendingCount > 0 && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--rust-wash)]/15 text-[var(--rust-deep)]">{pendingCount} pending</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Right: task list for selected user */}
              <div className="flex-1 min-w-0">
                {!adminSelectedEmail ? (
                  <div className="flex flex-col items-center justify-center h-48 text-center">
                    <p className="text-sm text-[var(--ink-faint)]">Select a user to view their tasks</p>
                  </div>
                ) : (() => {
                  const userTasks = adminTasks.filter(t => t.userEmail === adminSelectedEmail);
                  return (
                    <div>
                      <p className="text-xs font-semibold text-[var(--ink-soft)] mb-3 truncate">{adminSelectedEmail} · {userTasks.length} task{userTasks.length !== 1 ? "s" : ""}</p>
                      <div className="space-y-3">
                        {userTasks.map((task) => (
                          <div key={task.id} className="panel rounded-xl p-4">
                            <div className="flex items-start gap-3">
                              <div className="w-7 h-7 rounded-lg bg-[#FF4500] flex items-center justify-center shrink-0 mt-0.5">
                                <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none"><circle cx="10" cy="10" r="10" fill="white" fillOpacity="0.2"/><path fill="white" d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/></svg>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${task.status === "completed" ? "bg-[var(--rust)]/10 text-[var(--rust)] border-[var(--rust)]/25" : "bg-[var(--rust-wash)]/10 text-[var(--rust-deep)] border-[var(--rust)]/25"}`}>
                                    <span className={`w-1.5 h-1.5 rounded-full ${task.status === "completed" ? "bg-[var(--rust)]/100" : "bg-[var(--rust-wash)]/100 animate-pulse"}`} />
                                    {task.status === "completed" ? "Completed" : "Pending"}
                                  </span>
                                  {task.engine && <span className="text-[10px] text-[var(--ink-faint)]">{ENGINE_LABELS[task.engine as AIEngine] ?? task.engine}</span>}
                                  <span className="text-[10px] text-[var(--ink-faint)] ml-auto">{new Date(task.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                </div>
                                <a href={task.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-700 hover:underline truncate block mb-1.5">
                                  {task.url.replace(/^https?:\/\/(www\.)?/, "")}
                                </a>
                                {task.replyText && (
                                  <p className="text-xs text-[var(--ink-soft)] bg-[var(--line-soft)] rounded-lg px-3 py-2 border border-[var(--line)] line-clamp-2 mb-2">{task.replyText}</p>
                                )}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3 text-[10px] text-[var(--ink-faint)]">
                                    {task.upvotesOrdered > 0 ? (
                                      <span className="flex items-center gap-1">
                                        <svg className="w-3 h-3 text-[#FF4500]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4l8 8H4z"/></svg>
                                        {task.upvotesOrdered} upvotes · <span className="capitalize">{task.deliverySpeed}</span> · {task.upvotesOrdered * 0.5} credits
                                      </span>
                                    ) : <span>No upvotes</span>}
                                  </div>
                                  {task.status === "pending" && (
                                    <button
                                      onClick={async () => {
                                        const res = await fetch("/api/admin/tasks", {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ taskId: task.id, status: "completed" }),
                                        });
                                        if (res.ok) {
                                          setAdminTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, status: "completed", completedAt: new Date().toISOString() } : t));
                                        }
                                      }}
                                      className="text-[10px] font-semibold px-3 py-1 rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                                    >
                                      Mark complete
                                    </button>
                                  )}
                                  {task.status === "completed" && task.completedAt && (
                                    <span className="text-[10px] text-[var(--rust)]">Done {new Date(task.completedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              </div>
              )}

              {adminView === "feedback" && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {adminFeedbackLoading ? (
                    <div className="flex items-center gap-2 py-6 text-xs text-[var(--ink-faint)]"><span className="w-3 h-3 border-2 border-[var(--line)] border-t-transparent rounded-full animate-spin" /> Loading…</div>
                  ) : adminFeedback.length === 0 ? (
                    <p className="text-xs text-[var(--ink-faint)] py-6 text-center">No feedback submitted yet</p>
                  ) : (
                    <div className="space-y-3">
                      {adminFeedback.map((f) => (
                        <div key={f.id} className="panel rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--line-soft)] text-[var(--ink-soft)]">
                              {FEEDBACK_CATEGORIES.find((c) => c.value === f.category)?.label ?? f.category}
                            </span>
                            <span className="text-xs font-medium text-[var(--ink-soft)] truncate">{f.userEmail}</span>
                            <span className="text-[10px] text-[var(--ink-faint)] ml-auto shrink-0">{timeAgo(f.createdAt)}</span>
                          </div>
                          <p className="text-sm font-semibold text-[var(--ink)]/90">{f.title}</p>
                          <p className="text-xs text-[var(--ink-soft)] mt-1 whitespace-pre-wrap">{f.description}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* New Article Modal */}
      {showNewArticleModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowNewArticleModal(false)}>
          <div className="bg-[var(--surface)] rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)]">
              <h3 className="text-base font-bold text-[var(--ink)]">New article</h3>
              <button onClick={() => setShowNewArticleModal(false)} className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)] text-xl">×</button>
            </div>
            <div className="px-6 py-5">
              <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1.5">What do you want to write about?</label>
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
                className="w-full border border-[var(--line)] rounded-lg px-3 py-2.5 text-sm text-[var(--ink)]/90 outline-none focus:ring-2 focus:ring-[var(--rust)]/40 focus:border-transparent resize-none"
              />
              <p className="text-[10px] text-[var(--ink-faint)] mt-1.5">Tip: phrase it like a question someone would ask an AI</p>
            </div>
            <div className="px-6 pb-5 flex gap-2">
              <button onClick={() => setShowNewArticleModal(false)} className="flex-1 text-sm border border-[var(--line)] rounded-lg py-2.5 hover:bg-[var(--line-soft)] transition-colors">Cancel</button>
              <button
                disabled={!newArticleTopic.trim()}
                onClick={() => {
                  setShowNewArticleModal(false);
                  const params = new URLSearchParams({ gapPrompt: newArticleTopic.trim(), brand: brand.name, niche: brand.niche, brandId: brand.id ?? "" });
                  window.open(`/article?${params}`, "_blank");
                }}
                className="flex-1 text-sm bg-[var(--rust)] text-[var(--surface)] rounded-lg py-2.5 hover:bg-[var(--rust-deep)] disabled:opacity-40 transition-colors font-medium"
              >
                Generate →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Channel Modal */}
      {showAddChannel && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowAddChannel(false)}>
          <div className="bg-[var(--surface)] rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-[var(--ink)]">Add publishing channel</h3>
                <button onClick={() => setShowAddChannel(false)} className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)] text-xl">×</button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">Channel type</label>
                  <select value={newChannel.type} onChange={(e) => setNewChannel((p) => ({ ...p, type: e.target.value, url: "", apiKey: "" }))} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40">
                    <option value="webhook">Webhook — send JSON to any URL</option>
                    <option value="discord">Discord — post to a channel</option>
                    <option value="wordpress">WordPress — publish directly to your blog</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">Name</label>
                  <input value={newChannel.name} onChange={(e) => setNewChannel((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Company blog" className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40" />
                </div>
                {newChannel.type === "webhook" && (
                  <div>
                    <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">Webhook URL</label>
                    <input value={newChannel.url} onChange={(e) => setNewChannel((p) => ({ ...p, url: e.target.value }))} placeholder="https://hooks.example.com/..." className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40" />
                    <p className="text-[10px] text-[var(--ink-faint)] mt-1">RankOnGeo will POST the article as JSON to this URL. Use <span className="font-mono">webhook.site</span> to test.</p>
                  </div>
                )}
                {newChannel.type === "discord" && (
                  <div>
                    <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">Discord webhook URL</label>
                    <input value={newChannel.url} onChange={(e) => setNewChannel((p) => ({ ...p, url: e.target.value }))} placeholder="https://discord.com/api/webhooks/..." className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40" />
                    <p className="text-[10px] text-[var(--ink-faint)] mt-1">In Discord: channel Settings → Integrations → Webhooks → New Webhook → Copy URL</p>
                  </div>
                )}
                {newChannel.type === "wordpress" && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">WordPress site URL</label>
                      <input value={newChannel.url} onChange={(e) => setNewChannel((p) => ({ ...p, url: e.target.value }))} placeholder="https://yourblog.com" className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">Application password</label>
                      <input type="password" value={newChannel.apiKey} onChange={(e) => setNewChannel((p) => ({ ...p, apiKey: e.target.value }))} placeholder="xxxx xxxx xxxx xxxx xxxx xxxx" className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40" />
                      <p className="text-[10px] text-[var(--ink-faint)] mt-1">WP Admin → Users → Edit your user → Application Passwords → Generate</p>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowAddChannel(false)} className="flex-1 text-sm border border-[var(--line)] rounded-lg py-2 hover:bg-[var(--line-soft)] transition-colors">Cancel</button>
                <button onClick={addChannel} disabled={addingChannel || !newChannel.name || !newChannel.url} className="flex-1 text-sm font-medium bg-[var(--rust)] text-[var(--surface)] rounded-lg py-2 hover:bg-[var(--rust-deep)] disabled:opacity-50 transition-colors">
                  {addingChannel ? "Adding…" : "Add channel"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Publish Now Modal */}
      {showPublishModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => { if (!publishing) { setShowPublishModal(false); setPublishResult(null); } }}>
          <div className="bg-[var(--surface)] rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-[var(--ink)]">Publish article</h3>
                <button onClick={() => { setShowPublishModal(false); setPublishResult(null); }} className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)] text-xl">×</button>
              </div>
              {publishResult ? (
                <div className={`rounded-xl p-4 mb-5 ${publishResult.success ? "bg-[var(--rust)]/10 border border-[var(--rust)]/20" : "bg-red-500/10 border border-red-500/25"}`}>
                  <p className={`text-sm font-medium ${publishResult.success ? "text-[var(--rust)]" : "text-red-700"}`}>{publishResult.success ? "Published successfully!" : "Publish failed"}</p>
                  {publishResult.error && <p className="text-xs text-red-700 mt-1">{publishResult.error}</p>}
                </div>
              ) : (
                <div className="space-y-3 mb-5">
                  <div>
                    <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">Article</label>
                    <select value={publishArticleId} onChange={(e) => setPublishArticleId(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40">
                      <option value="">Select article…</option>
                      {savedArticles.filter(a => a.status !== "published").map((a) => (
                        <option key={a.id} value={a.id}>{a.title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-[var(--ink-soft)] block mb-1">Channel</label>
                    {publishingChannels.length === 0 ? (
                      <p className="text-xs text-[var(--ink-faint)]">No channels — <button onClick={() => { setShowPublishModal(false); setShowAddChannel(true); }} className="text-red-700 underline">add one first</button></p>
                    ) : (
                      <select value={publishChannelId} onChange={(e) => setPublishChannelId(e.target.value)} className="w-full border border-[var(--line)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)]/40">
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
                <button onClick={() => { setShowPublishModal(false); setPublishResult(null); }} className="flex-1 text-sm border border-[var(--line)] rounded-lg py-2 hover:bg-[var(--line-soft)] transition-colors">
                  {publishResult ? "Close" : "Cancel"}
                </button>
                {!publishResult && (
                  <button onClick={publishNow} disabled={publishing || !publishArticleId || !publishChannelId} className="flex-1 text-sm font-medium bg-[var(--rust)] text-[var(--surface)] rounded-lg py-2 hover:bg-[var(--rust-deep)] disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
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
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowAddAlert(false)}>
          <div className="bg-[var(--surface)] rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-base font-semibold text-[var(--ink)]">Add alert destination</h3>
                  <p className="text-xs text-[var(--ink-faint)] mt-0.5">Get notified when your visibility changes, drops, or you gain new mentions</p>
                </div>
                <button onClick={() => setShowAddAlert(false)} className="text-[var(--ink-faint)]/70 hover:text-[var(--ink-soft)] text-xl leading-none ml-4 shrink-0">×</button>
              </div>

              <div className="space-y-4">
                {/* Kind selector — clickable cards */}
                <div>
                  <p className="text-xs font-semibold text-[var(--ink-soft)] uppercase tracking-widest mb-2">Where to send alerts</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                              ? "border-[var(--rust)] bg-[var(--rust)] text-[var(--surface)]"
                              : "border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--line)] hover:text-[var(--ink)]/80"
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
                    <ol className="space-y-1.5 text-xs text-[var(--ink-soft)]">
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
                    <ol className="space-y-1.5 text-xs text-[var(--ink-soft)]">
                      <li className="flex gap-2"><span className="text-[#4a154b] font-semibold shrink-0">1.</span>Go to <span className="font-mono bg-[#4a154b]/10 px-1 rounded">api.slack.com/apps</span> → Create New App → From Scratch</li>
                      <li className="flex gap-2"><span className="text-[#4a154b] font-semibold shrink-0">2.</span>Enable <span className="font-medium">Incoming Webhooks</span> → Add New Webhook to Workspace</li>
                      <li className="flex gap-2"><span className="text-[#4a154b] font-semibold shrink-0">3.</span>Pick a channel, then copy the webhook URL that starts with <span className="font-mono bg-[#4a154b]/10 px-1 rounded">hooks.slack.com/…</span></li>
                    </ol>
                  </div>
                )}

                {/* Name field */}
                <div>
                  <label className="text-xs font-semibold text-[var(--ink-soft)] block mb-1.5">Nickname</label>
                  <input
                    value={newAlert.name}
                    onChange={(e) => setNewAlert((p) => ({ ...p, name: e.target.value }))}
                    placeholder={newAlert.kind === "discord" ? "e.g. #alerts channel" : newAlert.kind === "slack" ? "e.g. #eng-team" : newAlert.kind === "email" ? "e.g. Me" : "e.g. My webhook"}
                    className="w-full border border-[var(--line)] rounded-xl px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none focus:ring-2 focus:ring-[var(--rust)]/40 focus:border-[var(--rust)]/50 transition-colors"
                  />
                </div>

                {/* URL / email field */}
                {newAlert.kind !== "email" ? (
                  <div>
                    <label className="text-xs font-semibold text-[var(--ink-soft)] block mb-1.5">Webhook URL</label>
                    <input
                      value={newAlert.url}
                      onChange={(e) => setNewAlert((p) => ({ ...p, url: e.target.value }))}
                      placeholder={newAlert.kind === "discord" ? "https://discord.com/api/webhooks/…" : newAlert.kind === "slack" ? "https://hooks.slack.com/services/…" : "https://…"}
                      className="w-full border border-[var(--line)] rounded-xl px-4 py-2.5 text-xs text-[var(--ink)] placeholder:text-[var(--ink-faint)] font-mono outline-none focus:ring-2 focus:ring-[var(--rust)]/40 focus:border-[var(--rust)]/50 transition-colors"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-xs font-semibold text-[var(--ink-soft)] block mb-1.5">Email address</label>
                    <input
                      type="email"
                      value={newAlert.email}
                      onChange={(e) => setNewAlert((p) => ({ ...p, email: e.target.value }))}
                      placeholder="you@company.com"
                      className="w-full border border-[var(--line)] rounded-xl px-4 py-2.5 text-sm text-[var(--ink)] placeholder:text-[var(--ink-faint)] outline-none focus:ring-2 focus:ring-[var(--rust)]/40 focus:border-[var(--rust)]/50 transition-colors"
                    />
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-5">
                <button onClick={() => setShowAddAlert(false)} className="flex-1 text-sm border border-[var(--line)] rounded-xl py-2.5 hover:bg-[var(--line-soft)] transition-colors text-[var(--ink-soft)]">Cancel</button>
                <button onClick={addAlertDestination} disabled={addingAlert || !newAlert.name} className="flex-1 text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] rounded-xl py-2.5 hover:bg-[var(--rust-deep)] disabled:opacity-40 transition-colors">
                  {addingAlert ? "Adding…" : "Add destination"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thread reply modal */}
      {activeThread && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setActiveThread(null)}>
          <div className="bg-[var(--surface)] rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1 pr-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-blue-700">r/{activeThread.subreddit}</span>
                    <span className="text-xs text-[var(--ink-faint)]">↑ {activeThread.score} · {activeThread.numComments} comments</span>
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--ink)]">{activeThread.title}</h3>
                </div>
                <button onClick={() => setActiveThread(null)} className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)] text-xl leading-none">×</button>
              </div>

              {activeThread.body && (
                <div className="bg-[var(--line-soft)] rounded-lg px-4 py-3 mb-4">
                  <p className="text-xs text-[var(--ink-soft)] leading-relaxed line-clamp-4">{activeThread.body}</p>
                </div>
              )}

              <div className="border-t border-[var(--line)] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-[var(--ink)]/80 uppercase tracking-wide">AI draft reply</p>
                  <button onClick={async () => { setDraftingReply(true); setDraftReply(""); const res = await fetch("/api/reddit/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: activeThread.id, brandId: brand?.id }) }); const d = await res.json(); setDraftReply(d.reply ?? ""); setDraftingReply(false); }} className="text-xs text-blue-700 hover:underline">Regenerate</button>
                </div>

                {draftingReply ? (
                  <div className="flex items-center gap-2 py-6 justify-center">
                    <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs text-[var(--ink-soft)]">Drafting reply…</span>
                  </div>
                ) : draftReply ? (
                  <div>
                    <textarea value={draftReply} onChange={(e) => setDraftReply(e.target.value)} rows={5} className="w-full border border-[var(--line)] rounded-lg px-3 py-2.5 text-sm text-[var(--ink)]/90 outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
                    <div className="flex items-center gap-2 mt-2">
                      <button onClick={() => navigator.clipboard.writeText(draftReply)} className="flex-1 text-sm font-medium border border-[var(--line)] rounded-lg py-2 hover:bg-[var(--line-soft)] transition-colors">Copy</button>
                      {redditConnected ? (
                        <button
                          onClick={postReply}
                          disabled={postingReply}
                          className="flex-1 text-sm font-medium bg-orange-400/100 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg py-2 transition-colors flex items-center justify-center gap-1.5"
                        >
                          {postingReply ? <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                          {postingReply ? "Posting…" : "Post on Reddit"}
                        </button>
                      ) : (
                        <a href={activeThread.url} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm font-medium bg-blue-600 text-white text-center rounded-lg py-2 hover:bg-blue-700 transition-colors">Open thread ↗</a>
                      )}
                    </div>
                    {!redditConnected && (
                      <p className="text-[10px] text-[var(--ink-faint)] mt-2 text-center">
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
      {showPaywallModal && <PaywallModal onClose={() => setShowPaywallModal(false)} />}
      {confirmingSubscription && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] flex items-center gap-2.5 bg-[var(--surface)] border border-[var(--rust)]/25 rounded-full pl-3 pr-4 py-2 shadow-lg">
          <span className="w-4 h-4 border-2 border-[var(--line)] border-t-[var(--rust)] rounded-full animate-spin shrink-0" />
          <span className="text-sm font-medium text-[var(--ink)]">Confirming your subscription…</span>
        </div>
      )}
      {/* ENGAGE PANEL */}
      {engageItem && (() => {
        const engagePlatform = getEngagePlatform(engageItem.url);
        const platformMeta = ENGAGE_PLATFORMS[engagePlatform];
        return (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => { setEngageItem(null); setTaskSubmitted(false); setEngageDraft(""); }} />
          <div className="w-full max-w-[420px] h-full bg-[var(--surface)] shadow-2xl flex flex-col overflow-hidden border-l border-[var(--line)]">
            {/* Header */}
            <div className="px-5 py-4 border-b border-[var(--line)] flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg ${platformMeta.bg} flex items-center justify-center shrink-0`}>
                {engagePlatform === "linkedin" ? (
                  <span className="text-white font-bold text-xs leading-none">in</span>
                ) : (
                  <svg viewBox="0 0 20 20" className="w-4 h-4" fill="none">
                    <circle cx="10" cy="10" r="10" fill="white" fillOpacity="0.2"/>
                    <path fill="white" d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z"/>
                  </svg>
                )}
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">Engage on {platformMeta.label}</p>
                <p className="text-xs text-[var(--ink-faint)]">Draft a reply to influence this citation</p>
              </div>
              <button onClick={() => { setEngageItem(null); setTaskSubmitted(false); setEngageDraft(""); }} className="ml-auto text-[var(--ink-faint)] hover:text-[var(--ink-soft)]">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Thread context */}
            <div className="px-5 py-4 border-b border-[var(--line)] bg-[var(--line-soft)]/50">
              <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest mb-2">Thread</p>
              <a
                href={engageItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-2 group"
              >
                <span className="text-xs text-blue-700 group-hover:underline break-all leading-relaxed">
                  {engageItem.url.replace(/^https?:\/\/(www\.)?/, "")}
                </span>
                <svg className="w-3 h-3 text-[var(--ink-faint)] mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
              </a>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-[var(--ink-faint)]">Cited by</span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${ENGINE_COLORS[engageItem.engine as AIEngine] ?? "bg-[var(--line)]"}`} />
                  <span className="text-[10px] font-medium text-[var(--ink-soft)]">{ENGINE_LABELS[engageItem.engine as AIEngine] ?? engageItem.engine}</span>
                </div>
                <span className="text-[10px] text-[var(--ink-faint)]">for prompt:</span>
                <span className="text-[10px] text-[var(--ink-soft)] italic truncate max-w-[140px]">{engageItem.promptText.slice(0, 50)}{engageItem.promptText.length > 50 ? "…" : ""}</span>
              </div>
            </div>

            {/* Draft area */}
            <div className="flex-1 flex flex-col px-5 py-4 gap-3 overflow-y-auto">
              {taskSubmitted ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-8">
                  <div className="w-14 h-14 rounded-full bg-[var(--rust)]/10 flex items-center justify-center">
                    <svg className="w-7 h-7 text-[var(--rust)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-[var(--ink)] mb-1">Marked as engaged!</p>
                    <p className="text-xs text-[var(--ink-soft)]">Want to boost it? Order upvotes from the Tasks tab.</p>
                  </div>
                  <button onClick={() => { navTo("tasks"); setEngageItem(null); setTaskSubmitted(false); }} className={`text-xs font-medium ${platformMeta.text} hover:underline`}>
                    View in Tasks →
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest">Reply draft</p>
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
                                content: `Write a short, helpful ${platformMeta.label} comment (2-3 sentences) that naturally and authentically mentions ${brand.name} in the context of this post. The post appeared when someone searched: "${engageItem.promptText}". Keep it genuine and conversational — not promotional. Just reply with the comment text, no preamble.`,
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
                    rows={6}
                    className="w-full text-sm text-[var(--ink)]/90 placeholder:text-[var(--ink-faint)] border border-[var(--line)] rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand/40 bg-[var(--line-soft)]"
                  />
                  {engageDraft && (
                    <p className="text-xs text-[var(--ink-faint)]">{engageDraft.trim().split(/\s+/).length} words · edit freely before posting</p>
                  )}

                  {/* Ordering upvotes lives in one place — the Tasks tab. These are two
                      distinct hand-offs, kept visually and textually separate on purpose:
                      boosting the post vs. boosting your own reply are different targets
                      on BuyUpvotes' side (different links, different services). */}
                  {engagePlatform === "reddit" && (
                    <div className="space-y-2">
                      <button
                        onClick={() => {
                          setRedditOrderUrl(engageItem.url);
                          setRedditOrderService("post_upvote");
                          setEngageItem(null);
                          navTo("tasks");
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 border border-[var(--line)] rounded-xl hover:bg-[var(--line-soft)] transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#FF4500]/10 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-[#FF4500]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" /></svg>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[var(--ink)]/90">Boost this post</p>
                          <p className="text-[10px] text-[var(--ink-faint)]">Upvotes on the whole thread — opens Tasks with this link pre-filled</p>
                        </div>
                        <svg className="w-4 h-4 text-[var(--ink-faint)] ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                      <button
                        onClick={() => {
                          setRedditOrderUrl("");
                          setRedditOrderService("comment_upvote");
                          setEngageItem(null);
                          navTo("tasks");
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 border border-[var(--line)] rounded-xl hover:bg-[var(--line-soft)] transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#FF4500]/10 flex items-center justify-center shrink-0">
                          <svg className="w-4 h-4 text-[#FF4500]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8-1.06 0-2.077-.163-3.02-.463L3 21l1.395-3.72C3.512 16.117 3 14.612 3 13c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-[var(--ink)]/90">Boost your comment, once it's posted</p>
                          <p className="text-[10px] text-[var(--ink-faint)]">Different from the post — after you post this reply on Reddit, come back and paste the comment's own link</p>
                        </div>
                        <svg className="w-4 h-4 text-[var(--ink-faint)] ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer actions */}
            {!taskSubmitted && (
              <div className="px-5 py-4 border-t border-[var(--line)] space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (engageDraft) {
                        navigator.clipboard.writeText(engageDraft);
                        setEngageCopied(true);
                        setTimeout(() => setEngageCopied(false), 2000);
                      }
                    }}
                    disabled={!engageDraft}
                    className="flex-1 text-sm font-medium border border-[var(--line)] text-[var(--ink)]/80 py-2.5 rounded-lg hover:bg-[var(--line-soft)] disabled:opacity-40 transition-colors"
                  >
                    {engageCopied ? "Copied!" : "Copy text"}
                  </button>
                  {engagePlatform === "reddit" ? (
                    <button
                      onClick={() => {
                        setRedditOrderUrl(engageItem.url);
                        setRedditOrderService("custom_comments");
                        setRedditOrderComment(engageDraft);
                        setEngageItem(null);
                        navTo("tasks");
                      }}
                      disabled={!engageDraft.trim()}
                      className={`flex-1 text-sm font-medium ${platformMeta.bg} text-white text-center py-2.5 rounded-lg ${platformMeta.hoverBg} disabled:opacity-40 transition-colors`}
                    >
                      Post comment →
                    </button>
                  ) : (
                    <a
                      href={engageItem.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex-1 text-sm font-medium ${platformMeta.bg} text-white text-center py-2.5 rounded-lg ${platformMeta.hoverBg} transition-colors`}
                    >
                      Open {platformMeta.label} →
                    </a>
                  )}
                </div>
                <button
                  onClick={async () => {
                    if (isFreeTier) { openPaywall(); return; }
                    setTaskSubmitting(true);
                    try {
                      const res = await fetch("/api/tasks", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          brandId: brand.id,
                          url: engageItem.url,
                          promptText: engageItem.promptText,
                          engine: engageItem.engine,
                          replyText: engageDraft || null,
                          upvotesOrdered: 0,
                          deliverySpeed: "normal",
                        }),
                      });
                      if (res.ok) {
                        const d = await res.json();
                        setEngageTasks((prev) => [d.task ? mapEngageTask(d.task) : prev[0], ...prev].filter(Boolean));
                        setTaskSubmitted(true);
                      }
                    } catch {}
                    setTaskSubmitting(false);
                  }}
                  disabled={taskSubmitting}
                  className="w-full text-xs text-[var(--ink-faint)] hover:text-[var(--ink-soft)] py-1 transition-colors"
                >
                  {taskSubmitting ? "Saving…" : "Mark as engaged"}
                </button>
              </div>
            )}
          </div>
        </div>
        );
      })()}
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
