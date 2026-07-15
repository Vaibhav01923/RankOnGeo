import type { Metadata } from "next";
import Link from "next/link";
import { WebPageJsonLd } from "../_components/WebPageJsonLd";

const DESCRIPTION =
  "Guides for setting up RankOnGeo web analytics and AI crawler tracking — see how humans and AI engines find your site.";

export const metadata: Metadata = {
  title: "Docs",
  description: DESCRIPTION,
  alternates: { canonical: "/docs" },
};

export default function DocsIndexPage() {
  return (
    <div className="max-w-2xl">
      <WebPageJsonLd name="RankOnGeo Docs" description={DESCRIPTION} path="/docs" />
      <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">Welcome to RankOnGeo Docs</h1>
      <p className="text-[var(--ink-soft)] mb-10">
        Guides for setting up the tools that track how your brand shows up — both to humans and to AI.
      </p>

      <div className="space-y-4">
        <Link
          href="/docs/web-analytics"
          className="block panel rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 hover:border-[var(--rust)]/40 transition-colors"
        >
          <p className="text-sm font-semibold text-[var(--ink)] mb-1">How to Set Up Web Analytics →</p>
          <p className="text-sm text-[var(--ink-soft)]">Track live visitors, pageviews, visit duration, and bounce rate with one script tag.</p>
        </Link>

        <Link
          href="/docs/llm-analytics"
          className="block panel rounded-xl border border-[var(--line)] bg-[var(--surface)] p-5 hover:border-[var(--rust)]/40 transition-colors"
        >
          <p className="text-sm font-semibold text-[var(--ink)] mb-1">How to Set Up AI Crawler &amp; Bot Analytics →</p>
          <p className="text-sm text-[var(--ink-soft)]">See when ChatGPT, Claude, Perplexity, and other AI crawlers actually visit your site.</p>
        </Link>
      </div>
    </div>
  );
}
