import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How to Set Up Web Analytics",
  description:
    "Track live visitors, pageviews, visit duration, and bounce rate on your site with a single RankOnGeo script tag.",
  alternates: { canonical: "/docs/web-analytics" },
};

export default function WebAnalyticsDocsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
