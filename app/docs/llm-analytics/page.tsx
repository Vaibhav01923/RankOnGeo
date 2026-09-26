"use client";

import { useState } from "react";
import { WebPageJsonLd, BreadcrumbJsonLd } from "../../_components/WebPageJsonLd";
import { cloudflareWorkerSnippet, expressSnippet, nextProxySnippet } from "@/lib/integrations";

const CURL_SNIPPET = `curl -X POST https://www.rankongeo.com/api/track/bot \\
  -H "Content-Type: application/json" \\
  -d '{
    "siteKey": "YOUR_SITE_KEY",
    "path": "/current/path",
    "userAgent": "User-Agent header from the request",
    "referrer": "Referer header from the request"
  }'`;

const NEXTJS_SNIPPET = nextProxySnippet("YOUR_SITE_KEY");
const EXPRESS_SNIPPET = expressSnippet("YOUR_SITE_KEY");
const WORKER_SNIPPET = cloudflareWorkerSnippet("YOUR_SITE_KEY");

type Tab = "rest" | "nextjs" | "express" | "worker";
const TAB_LABELS: Record<Tab, string> = { rest: "REST API", nextjs: "Next.js", express: "Express", worker: "Cloudflare Worker" };

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
  const [tab, setTab] = useState<Tab>("rest");

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
            Server-side analytics tracks AI agents, crawlers, and other bots that don&apos;t run JavaScript. It has to run on your server (or in front of it), because a browser script never sees them.
          </p>
        </div>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          Fastest way: open <strong className="text-[var(--ink)]">Analytics → Connections → Connect → Custom Built Site</strong> in your dashboard and copy the prompt — paste it into Claude Code, Cursor, Copilot, Lovable, Bolt or v0 and it adds both the tracking script and this server-side call for your stack. To do it by hand, pick your setup:
        </p>

        <div className="flex gap-1 border-b border-[var(--line)] mb-4 overflow-x-auto">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                tab === t ? "border-[var(--rust)] text-[var(--rust-deep)]" : "border-transparent text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "rest" && (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-3">Call this endpoint from your server, on every page request:</p>
            <p className="text-sm text-[var(--ink-soft)] mb-3"><code className="text-[var(--rust-deep)]">POST https://www.rankongeo.com/api/track/bot</code></p>
            <CodeBlock code={CURL_SNIPPET} />
          </>
        )}
        {tab === "nextjs" && (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-3">
              Drop this in <code className="text-[var(--rust-deep)]">proxy.ts</code> (Next.js 16+ — on Next.js 15 and earlier the file is called <code className="text-[var(--rust-deep)]">middleware.ts</code> and the function <code className="text-[var(--rust-deep)]">middleware</code>). <code className="text-[var(--rust-deep)]">event.waitUntil</code> lets the call finish after the response is sent; an un-awaited fetch can be cancelled on serverless hosts.
            </p>
            <CodeBlock code={NEXTJS_SNIPPET} />
          </>
        )}
        {tab === "express" && (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-3">Register this before your routes (Node 18+ for the global <code className="text-[var(--rust-deep)]">fetch</code>):</p>
            <CodeBlock code={EXPRESS_SNIPPET} />
          </>
        )}
        {tab === "worker" && (
          <>
            <p className="text-sm text-[var(--ink-soft)] mb-3">
              No server access — Webflow, Framer, Squarespace, Wix, Shopify and similar? If your domain is proxied through Cloudflare, this Worker adds AI-crawler tracking without touching your site.
            </p>
            <CodeBlock code={WORKER_SNIPPET} />
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
          <li>Verify your <code className="text-[var(--rust-deep)]">siteKey</code> from Analytics → Connections.</li>
          <li>Add a log line to confirm your middleware is actually running on the routes you expect.</li>
          <li>AI crawlers visit on their own schedule, not a fixed interval — it can take time before real traffic shows up. Use &quot;Send test AI-crawler hit&quot; in Analytics → Connections to confirm the pipeline itself works, or run the curl command from the REST API tab with a bot user-agent such as GPTBot/1.0.</li>
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
