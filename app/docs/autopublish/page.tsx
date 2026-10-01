"use client";

import { useState } from "react";
import { WebPageJsonLd, BreadcrumbJsonLd } from "../../_components/WebPageJsonLd";
import { buildAutopublishPrompt } from "@/lib/autopublish-prompt";

const AI_PROMPT = buildAutopublishPrompt(
  `{your secret — copy it from the "Add channel" modal in your RankOnGeo dashboard when you create a webhook channel}`,
  "",
);

const PAYLOAD_JSON = `POST <your endpoint URL>
Header: X-RankOnGeo-Secret: <your secret>
Content-Type: application/json

{
  "title": "string — article headline",
  "content": "string — full article body, as GitHub-flavored Markdown (may include tables); the title is not repeated in it",
  "keyword": "string — the target SEO keyword",
  "description": "string — optional, may be empty",
  "tags": "string[] — optional, may be empty",
  "image_url": "string — optional, may be empty",
  "status": "publish",
  "source": "rankongeo",
  "action": "update",          // only when replacing a post sent before
  "external_id": "string"      // only with "action": "update" — the id you returned
}

Respond: 200 { "ok": true, "id": "<post id>", "url": "<public post URL>" }`;

const TOC = [
  { href: "#how-it-works", label: "How it works" },
  { href: "#wordpress", label: "WordPress setup" },
  { href: "#discord", label: "Discord setup" },
  { href: "#webhook", label: "Your website or CMS" },
  { href: "#payload-reference", label: "Payload reference" },
  { href: "#troubleshooting", label: "Troubleshooting" },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-4 py-3 font-mono text-xs text-[var(--ink)]/90 overflow-x-auto mb-4 whitespace-pre">
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

export default function AutopublishDocsPage() {
  return (
    <div className="flex items-start gap-10">
      <WebPageJsonLd
        name="How to Set Up Auto-Publishing"
        description="Connect WordPress, Discord, or your own website/CMS so finished articles publish automatically."
        path="/docs/autopublish"
      />
      <BreadcrumbJsonLd items={[{ name: "Home", path: "" }, { name: "Docs", path: "/docs" }, { name: "Auto-Publishing", path: "/docs/autopublish" }]} />
      <div className="max-w-2xl min-w-0">
        <h1 className="text-3xl font-bold text-[var(--ink)] mb-2">Auto-Publishing</h1>
        <p className="text-[var(--ink-soft)] mb-10">
          Connect a channel once, then every article you finish can go out automatically — no copy-pasting into your CMS.
        </p>

        <h2 id="how-it-works" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">How it works</h2>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          In the dashboard&apos;s <strong className="text-[var(--ink)]">Publishing</strong> tab, click <strong className="text-[var(--ink)]">+ Add channel</strong> and pick one of three types:
          <strong className="text-[var(--ink)]"> WordPress</strong> (one click, publishes straight to your blog),
          <strong className="text-[var(--ink)]"> Discord</strong> (posts a rich embed to a channel), or
          <strong className="text-[var(--ink)]"> your own website / CMS</strong> (a webhook — works with literally anything, including CMS platforms that don&apos;t have a dedicated integration).
        </p>
        <p className="text-sm text-[var(--ink-soft)] mb-10">
          Once a channel is connected, finished articles can be sent to it from the article editor&apos;s <strong className="text-[var(--ink)]">Publish now</strong> button, or from the Publishing tab&apos;s <strong className="text-[var(--ink)]">Publish article</strong> action. Every attempt — success or failure — shows up in the tab&apos;s activity log, and a failing channel shows its last error right on the channel card.
        </p>

        <h2 id="wordpress" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">WordPress setup</h2>
        <ol className="text-sm text-[var(--ink-soft)] space-y-2 mb-4 list-decimal pl-5">
          <li>In WP Admin, go to <strong className="text-[var(--ink)]">Users → Profile</strong> (your own user).</li>
          <li>Scroll to <strong className="text-[var(--ink)]">Application Passwords</strong>, name it &quot;RankOnGeo&quot;, click <strong className="text-[var(--ink)]">Add New Application Password</strong>.</li>
          <li>Copy the generated password — WordPress only shows it once.</li>
          <li>In RankOnGeo, add a WordPress channel with your site URL, your WordPress <strong className="text-[var(--ink)]">username</strong> (exactly as shown on the Users page, not your display name), and the application password.</li>
        </ol>
        <p className="text-sm text-[var(--ink-soft)] mb-10">
          If publishing fails with a 401, a security plugin may be blocking the REST API — allowlist <code className="text-[var(--rust-deep)]">/wp-json/wp/v2/posts</code>.
        </p>

        <h2 id="discord" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">Discord setup</h2>
        <ol className="text-sm text-[var(--ink-soft)] space-y-2 mb-10 list-decimal pl-5">
          <li>Open your Discord server → right-click the channel you want articles posted in.</li>
          <li>Click <strong className="text-[var(--ink)]">Edit Channel</strong> → <strong className="text-[var(--ink)]">Integrations</strong> → <strong className="text-[var(--ink)]">Webhooks</strong>.</li>
          <li>Click <strong className="text-[var(--ink)]">New Webhook</strong>, name it, then click <strong className="text-[var(--ink)]">Copy Webhook URL</strong>.</li>
          <li>Paste that URL into RankOnGeo&apos;s Discord channel field — it starts with <code className="text-[var(--rust-deep)]">discord.com/api/webhooks/…</code>.</li>
        </ol>

        <h2 id="webhook" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">Your website or CMS</h2>
        <p className="text-sm text-[var(--ink-soft)] mb-4">
          There&apos;s no plugin needed — RankOnGeo POSTs a JSON payload to any URL you give it, so this works with a hand-coded site, Webflow, Shopify, Ghost, or anything else with an API or database you can write to. The fastest way to build the receiving endpoint is to hand this prompt to an AI coding assistant (Claude Code, Cursor, ChatGPT) — fill in the two bracketed lines first with your stack and the real secret shown when you create the channel in the dashboard:
        </p>
        <CodeBlock code={AI_PROMPT} />
        <p className="text-sm text-[var(--ink-soft)] mb-10">
          Once your assistant builds and deploys the endpoint, paste its URL into RankOnGeo&apos;s &quot;Your endpoint URL&quot; field and you&apos;re done.
        </p>

        <h2 id="payload-reference" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">Payload reference</h2>
        <p className="text-sm text-[var(--ink-soft)] mb-3">If you&apos;d rather wire it up by hand, here&apos;s exactly what RankOnGeo sends:</p>
        <CodeBlock code={PAYLOAD_JSON} />
        <p className="text-xs text-[var(--ink-faint)] mb-10">
          The secret is only sent for webhook channels (WordPress uses your application password; Discord doesn&apos;t need one). Respond with a 2xx status on success — anything else is logged as a failed delivery. Include the post&apos;s <code className="text-[var(--rust-deep)]">id</code> and public <code className="text-[var(--rust-deep)]">url</code> in the response: Autopilot uses them to measure the post and to send improved versions back as <code className="text-[var(--rust-deep)]">&quot;action&quot;: &quot;update&quot;</code>. And serve the post and your /blog list as server-rendered HTML — crawlers mostly don&apos;t run JavaScript, so a body loaded in the browser is invisible to them.
        </p>

        <h2 id="troubleshooting" className="text-lg font-semibold text-[var(--ink)] mb-3 scroll-mt-20">Troubleshooting</h2>
        <ul className="text-sm text-[var(--ink-soft)] space-y-2 list-disc pl-5">
          <li><strong className="text-[var(--ink)]">WordPress 401</strong> — wrong username or application password, or a security plugin blocking the REST API. Double-check the username matches exactly what&apos;s shown on your WP Users page.</li>
          <li><strong className="text-[var(--ink)]">Discord returns 400 or 404</strong> — the webhook was deleted or regenerated in Discord; create a new one and update the channel URL in RankOnGeo.</li>
          <li><strong className="text-[var(--ink)]">Webhook delivery failing</strong> — check the error shown on the channel card and in the activity log, confirm your endpoint checks the <code className="text-[var(--rust-deep)]">X-RankOnGeo-Secret</code> header correctly, and confirm the endpoint is publicly reachable (not behind auth or a local-only URL).</li>
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
