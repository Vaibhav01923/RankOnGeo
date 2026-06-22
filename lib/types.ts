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

