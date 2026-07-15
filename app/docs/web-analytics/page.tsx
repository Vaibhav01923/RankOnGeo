"use client";

import { useState } from "react";
import { WebPageJsonLd, BreadcrumbJsonLd } from "../../_components/WebPageJsonLd";

const SNIPPET = `<script src="https://www.rankongeo.com/track.js" data-site="YOUR_SITE_KEY" defer></script>`;

const TOC = [
  { href: "#setup-guide", label: "Web Analytics Setup Guide" },
  { href: "#metrics-explained", label: "Metrics explained" },
  { href: "#debugging", label: "Debugging" },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-4 py-3 font-mono text-sm text-[var(--ink)]/90 overflow-x-auto mb-4 whitespace-pre">
      {code}
      <button
        onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
        className="absolute top-2 right-2 text-[10px] font-semibold border border-[var(--line)] bg-[var(--surface)] px-2 py-1 rounded-md text-[var(--ink-soft)] hover:bg-[var(--line-soft)] transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export default function WebAnalyticsDocsPage() {
  return (
    <div className="flex items-start gap-10">
      <WebPageJsonLd
        name="Web Analytics Setup Guide"
        description="Privacy-first analytics for your website — live visitors, pageviews, visit duration, and bounce rate."
        path="/docs/web-analytics"
      />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "" }, { name: "Docs", path: "/docs" }, { name: "Web Analytics", path: "/docs/web-analytics" }]} />
      <div className="max-w-2xl min-w-0">
        <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">Web Analytics</h1>
        <p className="text-[var(--ink-soft)] mb-10">Privacy-first analytics for your website — live visitors, pageviews, visit duration, and bounce rate.</p>

        <h2 id="setup-guide" className="text-lg font-semibold text-[var(--ink)] mb-4 scroll-mt-20">Web Analytics Setup Guide</h2>

        <h3 className="text-sm font-semibold text-[var(--ink)]/90 mb-2">1. Get your Website ID</h3>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          Open the Web Analytics tab in your dashboard — your site&apos;s ID is shown there, and gets substituted into the snippet below automatically.
        </p>

        <h3 className="text-sm font-semibold text-[var(--ink)]/90 mb-2">2. Add the tracking script</h3>
        <p className="text-sm text-[var(--ink-soft)] mb-3">Paste this into the <code className="text-[var(--rust-deep)]">&lt;head&gt;</code> section of every page you want tracked:</p>
        <CodeBlock code={SNIPPET} />
        <p className="text-xs text-[var(--ink-faint)] mb-6">
          The script sets a first-party cookie to distinguish visitors and sessions, then sends one pageview event per page load. No cross-site tracking, no third-party cookies.
        </p>

        <h3 className="text-sm font-semibold text-[var(--ink)]/90 mb-2">3. Confirm it&apos;s working</h3>
        <p className="text-sm text-[var(--ink-soft)] mb-10">
          Visit a page on your site, then check the Web Analytics tab — a pageview should show up within a few seconds. You can also click &quot;Send test event&quot; in the dashboard to see the layout populate before deploying the script.
        </p>

        <h2 id="metrics-explained" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">Metrics explained</h2>
        <ul className="text-sm text-[var(--ink-soft)] space-y-2 mb-10 list-disc pl-5">
          <li><strong className="text-[var(--ink)]">Live Visitors</strong> — distinct visitors seen in the last 5 minutes.</li>
          <li><strong className="text-[var(--ink)]">Visitors</strong> — distinct visitors in the last 30 days.</li>
          <li><strong className="text-[var(--ink)]">Pageviews</strong> — total page loads in the last 30 days.</li>
          <li><strong className="text-[var(--ink)]">Visit Duration</strong> — average time between a session&apos;s first and last pageview.</li>
          <li><strong className="text-[var(--ink)]">Bounce Rate</strong> — share of sessions with only a single pageview.</li>
        </ul>

        <h2 id="debugging" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">Debugging</h2>
        <p className="text-sm font-semibold text-[var(--ink)]/90 mb-2">Not seeing data?</p>
        <ul className="text-sm text-[var(--ink-soft)] space-y-2 list-disc pl-5">
          <li>Confirm the script tag&apos;s <code className="text-[var(--rust-deep)]">data-site</code> matches the Website ID shown in your dashboard.</li>
          <li>Open your browser&apos;s network tab and confirm a request to <code className="text-[var(--rust-deep)]">www.rankongeo.com/api/track/pageview</code> is firing and returning 200.</li>
          <li>Ad blockers occasionally block analytics scripts by name — this is a known limitation of any client-side analytics tool.</li>
        </ul>
      </div>

      <nav className="w-48 shrink-0 hidden xl:block sticky top-24">
        <p className="text-[10px] font-semibold text-[var(--ink-faint)] uppercase tracking-widest mb-2">On this page</p>
        <div className="space-y-2 border-l border-[var(--line)] pl-3">
          {TOC.map((t) => (
            <a key={t.href} href={t.href} className="block text-xs text-[var(--ink-soft)] hover:text-[var(--rust)] transition-colors">{t.label}</a>
          ))}
        </div>
      </nav>
    </div>
  );
}
