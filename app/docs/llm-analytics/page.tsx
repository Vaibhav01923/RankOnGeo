"use client";

import { useState } from "react";
import { WebPageJsonLd, BreadcrumbJsonLd } from "../../_components/WebPageJsonLd";

const CURL_SNIPPET = `curl -X POST https://www.rankongeo.com/api/track/bot \\
  -H "Content-Type: application/json" \\
  -d '{
    "siteKey": "YOUR_SITE_KEY",
    "path": "/current/path",
    "userAgent": "User-Agent header from the request",
    "referrer": "Referer header from the request"
  }'`;

const NEXTJS_SNIPPET = `import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  fetch("https://www.rankongeo.com/api/track/bot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteKey: "YOUR_SITE_KEY",
      path: req.nextUrl.pathname,
      userAgent: req.headers.get("user-agent") ?? "",
      referrer: req.headers.get("referer") ?? "",
    }),
  }).catch(() => {}); // never let tracking break the request

  return NextResponse.next();
}`;

const TOC = [
  { href: "#setup-guide", label: "AI Analytics Setup Guide" },
  { href: "#crawlers", label: "AI Crawlers, Bots that we track" },
  { href: "#debugging", label: "Debugging" },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-4 py-3 font-mono text-[13px] text-[var(--ink)]/90 overflow-x-auto mb-4 whitespace-pre">
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

export default function LlmAnalyticsDocsPage() {
  const [tab, setTab] = useState<"rest" | "nextjs">("rest");

  return (
    <div className="flex items-start gap-10">
      <WebPageJsonLd
        name="AI Search, Crawler, Bot Analytics Setup Guide"
        description="Track AI search engines, crawlers, and bots visiting your website. Get insights into traffic from AI platforms like ChatGPT, Claude, and Perplexity."
        path="/docs/llm-analytics"
      />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "" }, { name: "Docs", path: "/docs" }, { name: "LLM Analytics", path: "/docs/llm-analytics" }]} />
      <div className="max-w-2xl min-w-0">
        <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">AI Search, Crawler, Bot Analytics</h1>
        <p className="text-[var(--ink-soft)] mb-10">Track AI search engines, crawlers, and bots visiting your website. Get insights into traffic from AI platforms like ChatGPT, Claude, and Perplexity.</p>

        <h2 id="setup-guide" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">AI Analytics Setup Guide</h2>
        <div className="bg-[var(--rust-wash)] border border-[var(--rust)]/25 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-[var(--rust-deep)]">
            Server-side analytics tracks AI agents, crawlers, and other bots that don&apos;t run JavaScript. You need to add this to your server&apos;s middleware.
          </p>
        </div>
        <p className="text-sm text-[var(--ink-soft)] mb-4">You can use our REST API, or a Next.js middleware if that&apos;s what you&apos;re running.</p>

        <div className="flex gap-1 border-b border-[var(--line)] mb-4">
          {(["rest", "nextjs"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                tab === t ? "border-[var(--rust)] text-[var(--rust-deep)]" : "border-transparent text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
              }`}
            >
              {t === "rest" ? "REST API" : "Next.js"}
            </button>
          ))}
        </div>

        {tab === "rest" ? (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-3">Use this endpoint from your server middleware:</p>
            <p className="text-sm text-[var(--ink-soft)] mb-3"><code className="text-[var(--rust-deep)]">POST https://www.rankongeo.com/api/track/bot</code></p>
            <CodeBlock code={CURL_SNIPPET} />
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-3">Drop this in your <code className="text-[var(--rust-deep)]">middleware.ts</code> so every request gets checked:</p>
            <CodeBlock code={NEXTJS_SNIPPET} />
          </>
        )}
        <p className="text-xs text-[var(--ink-faint)] mb-10">
          Only recognized AI bot user-agents get stored — calling this for every request (including regular human traffic) is safe and expected; non-bot requests are silently ignored.
        </p>

        <h2 id="crawlers" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">AI Crawlers, Bots that we track</h2>
        <ul className="text-sm text-[var(--ink-soft)] space-y-1.5 mb-10 list-disc pl-5">
          <li><strong className="text-[var(--ink)]">ChatGPT</strong> — OpenAI&apos;s conversational AI and search (GPTBot, ChatGPT-User, OAI-SearchBot)</li>
          <li><strong className="text-[var(--ink)]">Claude</strong> — Anthropic&apos;s AI assistant (ClaudeBot, anthropic-ai)</li>
          <li><strong className="text-[var(--ink)]">Perplexity</strong> — AI-powered search engine (PerplexityBot)</li>
          <li><strong className="text-[var(--ink)]">Gemini</strong> — Google&apos;s AI platform (Google-Extended)</li>
          <li><strong className="text-[var(--ink)]">DeepSeek</strong> — Advanced AI search</li>
          <li><strong className="text-[var(--ink)]">Others</strong> — CCBot, Bytespider, Amazonbot, and other AI crawlers</li>
        </ul>

        <h2 id="debugging" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">Debugging</h2>
        <p className="text-sm font-semibold text-[var(--ink)]/90 mb-2">Not seeing AI traffic?</p>
        <ul className="text-sm text-[var(--ink-soft)] space-y-2 list-disc pl-5">
          <li>Verify your <code className="text-[var(--rust-deep)]">siteKey</code> from the LLM Analytics tab.</li>
          <li>Add a log line to confirm your middleware is actually running on the routes you expect.</li>
          <li>AI crawlers visit on their own schedule, not a fixed interval — it can take time before real traffic shows up. Use &quot;Send test event&quot; in the dashboard to confirm the pipeline itself works.</li>
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
