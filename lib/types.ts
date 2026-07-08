export type BrandData = {
  id?: string;
  domain: string;
  name: string;
  niche: string;
  description: string;
  targetAudience: string[];
  competitors: string[];
  trackedPrompts: TrackedPrompt[];
};

export type TrackedPrompt = {
  id: string;
  text: string;
  category: string;
  status?: "active" | "paused";
  cadence?: "daily" | "weekly";
};

export type AIEngine = "chatgpt" | "claude" | "gemini" | "perplexity" | "google" | "grok";

export type ScanResult = {
  promptId: string;
  promptText: string;
  engine: AIEngine;
  response: string;
  brandMentioned: boolean;
  brandRank: number | null;
  competitorMentions: { name: string; rank: number | null }[];
  citations: string[];
  scannedAt: string;
};

export type VisibilityScore = {
  engine: AIEngine;
  score: number;
  mentionCount: number;
  totalPrompts: number;
  avgRank: number | null;
};

export type DashboardData = {
  brand: BrandData;
  results: ScanResult[];
  scores: VisibilityScore[];
  overallScore: number;
  gaps: GapItem[];
};

export type GapItem = {
  promptText: string;
  engines: AIEngine[];
  topCompetitor: string | null;
  recommendation: string;
};

export type SocialKeyword = {
  id: string;
  keyword: string;
  createdAt: string;
};

export type RedditServiceType = "post_upvote" | "post_downvote" | "custom_comments";

export type EngageTask = {
  id: string;
  brandId: string;
  url: string;
  promptText: string | null;
  engine: string | null;
  replyText: string | null;
  upvotesOrdered: number;
  deliverySpeed: string;
  serviceType: RedditServiceType;
  creditsCharged: number;
  providerOrderId: string | null;
  status: "queued" | "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: string;
  completedAt: string | null;
};

export type AdminTask = EngageTask & { userEmail: string; userId: string };

export type RedditThread = {
  id: string;
  keyword: string;
  redditId: string;
  subreddit: string;
  title: string;
  url: string;
  body: string;
  score: number;
  numComments: number;
  redditCreatedAt: string;
  discoveredAt: string;
  status: "new" | "read" | "replied";
  draftedReply: string | null;
};

