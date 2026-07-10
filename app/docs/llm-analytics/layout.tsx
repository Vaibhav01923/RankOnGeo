import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to Set Up AI Crawler & Bot Analytics",
  description:
    "See when ChatGPT, Claude, Perplexity, and other AI crawlers actually visit your site with RankOnGeo bot analytics.",
  alternates: { canonical: "/docs/llm-analytics" },
};

export default function LlmAnalyticsDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
