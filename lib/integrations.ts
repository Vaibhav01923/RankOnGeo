// Single source of truth for "how do I connect RankOnGeo to my site" — used by
// the dashboard's Analytics → Setup hub and the public docs so the steps can't
// drift apart.
//
// What "connected" means:
//  - Web analytics: ONE <script> tag in the site's <head> (human visitors,
//    including people arriving from ChatGPT/Perplexity/etc.).
//  - AI-crawler tracking: a server-side call, because GPTBot/ClaudeBot/etc.
//    never run JavaScript. Only possible where the site owner controls server
//    code (custom-built sites) or sits behind an edge layer like Cloudflare —
//    hosted builders (Wix, Squarespace, ...) have no such hook.
// For custom-built sites both are done in one step by handing the master
// prompt below to an AI coding assistant.

export const TRACK_SCRIPT_URL = "https://www.rankongeo.com/track.js";
export const BOT_ENDPOINT = "https://www.rankongeo.com/api/track/bot";

export function trackingScriptTag(siteKey: string): string {
  return `<script src="${TRACK_SCRIPT_URL}" data-site="${siteKey}" defer></script>`;
}

export type IntegrationPlatformId =
  | "wordpress" | "webflow" | "shopify" | "wix" | "gohighlevel"
  | "sanity" | "framer" | "squarespace" | "custom" | "other";

export type IntegrationPlatform = {
  id: IntegrationPlatformId;
  name: string;
  // Ordered, platform-specific place-the-script steps. Empty for platforms
  // where the right move is the master prompt instead.
  steps: string[];
  // Plan/limitation worth knowing before starting.
  note?: string;
  // True when the AI-assistant master prompt (script + AI-crawler tracking in
  // one go) is the recommended path for this platform.
  useMasterPrompt?: boolean;
  // How blog posts get published to this platform today — kept honest: only
  // "native" means one click from RankOnGeo.
  publishing: { method: "native" | "webhook" | "manual"; text: string };
};

export const INTEGRATION_PLATFORMS: IntegrationPlatform[] = [
  {
    id: "wordpress",
    name: "WordPress",
    steps: [
      "Install the free “WPCode” plugin (or any “header scripts” plugin) from Plugins → Add New.",
      "In WPCode open Code Snippets → Header & Footer and paste the script into the Header box.",
      "Save, then clear your caching plugin's cache so the script shows on every page.",
    ],
    note: "No plugin? Paste it into your theme's header.php just before </head>, or add it through a wp_head hook in a child theme.",
    publishing: { method: "native", text: "One-click publishing through the WordPress REST API." },
  },
  {
    id: "webflow",
    name: "Webflow",
    steps: [
      "Open Site settings → Custom code.",
      "Paste the script into the “Head code” box.",
      "Save, then Publish the site — custom code only goes live on publish.",
    ],
    note: "Custom code needs a paid Site plan.",
    publishing: { method: "manual", text: "Copy the article from RankOnGeo into your CMS collection, or route the webhook channel into it with Zapier/Make." },
  },
  {
    id: "shopify",
    name: "Shopify",
    steps: [
      "Go to Online Store → Themes → ⋯ → Edit code.",
      "Open layout/theme.liquid.",
      "Paste the script just before </head>, then Save.",
    ],
    note: "Shopify checkout pages don't load theme.liquid, so they aren't tracked — that's expected.",
    publishing: { method: "manual", text: "Copy the article from RankOnGeo into your blog, or route the webhook channel into it with Zapier/Make." },
  },
  {
    id: "wix",
    name: "Wix",
    steps: [
      "In your Wix dashboard open Settings → Advanced → Custom code.",
      "Click Add custom code, paste the script and name it “RankOnGeo”.",
      "Set “Add code to” → All pages and “Place code in” → Head, then Apply.",
    ],
    note: "Custom code needs a Premium plan with a connected domain.",
    publishing: { method: "manual", text: "Copy the article from RankOnGeo into your Wix blog, or route the webhook channel into it with Zapier/Make." },
  },
  {
    id: "gohighlevel",
    name: "GoHighLevel",
    steps: [
      "Open Sites → Websites (or Funnels) and select your site.",
      "Go to Settings → Tracking Code.",
      "Paste the script into “Header Code” and Save.",
    ],
    note: "GoHighLevel tracking code is set per site/funnel — repeat for each one you want tracked.",
    publishing: { method: "manual", text: "Copy the article from RankOnGeo into your blog, or route the webhook channel into it with Zapier/Make." },
  },
  {
    id: "sanity",
    name: "Sanity",
    steps: [],
    useMasterPrompt: true,
    note: "Sanity only stores content — the script belongs in whichever front-end renders it (Next.js, Remix, Astro, …). The master prompt below has your AI coding assistant add it, plus AI-crawler tracking.",
    publishing: { method: "webhook", text: "Auto-publish via the webhook channel — your endpoint writes the article into Sanity." },
  },
  {
    id: "framer",
    name: "Framer",
    steps: [
      "Open Site Settings → General → Custom Code.",
      "Paste the script into “Start of <head> tag”.",
      "Save, then Publish.",
    ],
    note: "Custom code needs a paid Framer plan.",
    publishing: { method: "manual", text: "Copy the article from RankOnGeo into your Framer CMS, or route the webhook channel into it with Zapier/Make." },
  },
  {
    id: "squarespace",
    name: "Squarespace",
    steps: [
      "Open Settings → Developer Tools → Code Injection (older editors: Settings → Advanced → Code Injection).",
      "Paste the script into the Header box.",
      "Save.",
    ],
    note: "Code injection needs a Business plan or higher.",
    publishing: { method: "manual", text: "Copy the article from RankOnGeo into your Squarespace blog, or route the webhook channel into it with Zapier/Make." },
  },
  {
    id: "custom",
    name: "Custom Built Site",
    steps: [],
    useMasterPrompt: true,
    note: "One copy-paste does everything: your AI coding assistant reads your project, adds the tracking script, and wires up AI-crawler tracking for your stack.",
    publishing: { method: "webhook", text: "Auto-publish via the webhook channel — the Publishing tab has a ready AI-assistant prompt for the receiving endpoint." },
  },
  {
    id: "other",
    name: "Other Website Editors",
    steps: [
      "Find your builder's “custom code”, “header scripts” or “tracking code” setting.",
      "Paste the script into the Head / Header section for all pages, then publish.",
      "No such setting? Use Google Tag Manager: create a Custom HTML tag containing the script, fire it on All Pages, and publish the container.",
    ],
    publishing: { method: "manual", text: "Copy the article from RankOnGeo into your editor, or route the webhook channel into it with Zapier/Make." },
  },
];

// ---------------------------------------------------------------------------
// Server-side AI-crawler tracking snippets. Every one fires and forgets — a
// tracking call must never delay or break a real response. RankOnGeo ignores
// non-bot user agents, so sending every page request is safe.
// ---------------------------------------------------------------------------

export function nextProxySnippet(siteKey: string): string {
  return `// proxy.ts  (Next.js 16+; on Next.js 15 and earlier name the file middleware.ts
// and the function \`middleware\`)
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";

export function proxy(req: NextRequest, event: NextFetchEvent) {
  // waitUntil keeps the call alive after the response is sent, without delaying it.
  event.waitUntil(
    fetch("${BOT_ENDPOINT}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey: "${siteKey}",
        path: req.nextUrl.pathname,
        userAgent: req.headers.get("user-agent") ?? "",
        referrer: req.headers.get("referer") ?? "",
      }),
    }).catch(() => {})
  );
  return NextResponse.next();
}

export const config = {
  // Page requests only — skip Next internals, API routes and static files.
  matcher: ["/((?!_next/|api/|.*\\\\..*).*)"],
};`;
}

export function expressSnippet(siteKey: string): string {
  return `// Express / Node 18+ (global fetch). Register before your routes.
app.use((req, res, next) => {
  const isPage = req.method === "GET" && !/\\.[a-z0-9]{2,5}$/i.test(req.path);
  if (isPage) {
    fetch("${BOT_ENDPOINT}", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteKey: "${siteKey}",
        path: req.path,
        userAgent: req.get("user-agent") || "",
        referrer: req.get("referer") || "",
      }),
    }).catch(() => {}); // fire and forget — never await on the request path
  }
  next();
});`;
}

export function cloudflareWorkerSnippet(siteKey: string): string {
  return `// Cloudflare Worker — works for ANY site proxied through Cloudflare,
// including hosted builders that give you no server access.
// Workers & Routes → Create Worker → paste → add a route like example.com/*
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const isPage = request.method === "GET" && !/\\.[a-z0-9]{2,5}$/i.test(url.pathname);
    if (isPage) {
      ctx.waitUntil(
        fetch("${BOT_ENDPOINT}", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            siteKey: "${siteKey}",
            path: url.pathname,
            userAgent: request.headers.get("user-agent") || "",
            referrer: request.headers.get("referer") || "",
          }),
        }).catch(() => {})
      );
    }
    return fetch(request); // pass the request through to your origin untouched
  },
};`;
}

export function curlTestSnippet(siteKey: string): string {
  return `curl -X POST ${BOT_ENDPOINT} \\
  -H "Content-Type: application/json" \\
  -d '{"siteKey":"${siteKey}","path":"/","userAgent":"GPTBot/1.0","referrer":""}'`;
}

// ---------------------------------------------------------------------------
// The master prompt for custom-built sites. Written to be pasted verbatim into
// Claude Code / Cursor / Copilot / Lovable / Bolt / v0 / ChatGPT.
// ---------------------------------------------------------------------------

export function buildIntegrationPrompt(siteKey: string, domain: string): string {
  const site = domain ? domain.replace(/^https?:\/\//, "").replace(/\/$/, "") : "this website";
  return `You are integrating RankOnGeo analytics into this project's codebase. Make the smallest possible change, add NO new dependencies, and don't touch unrelated code.

SITE ID (data-site / siteKey): ${siteKey}
SITE: ${site}

GOAL — make two things work:
  1. Web analytics: real human visitors, including people who arrive from ChatGPT, Perplexity, Claude and other AI answers. Done with ONE script tag.
  2. AI-crawler tracking: GPTBot, ClaudeBot, PerplexityBot and other AI crawlers. These never run JavaScript, so this must be a SERVER-SIDE call.

STEP 0 — INSPECT FIRST
Work out the framework and hosting (Next.js app/pages router, Nuxt, SvelteKit, Astro, Remix, Express/Fastify/Koa, Rails, Django/Flask, Laravel, Go, plain static site, …). State what you found in one line before changing anything. If you are not sure of a framework API (for example Next.js changed its middleware convention), read the docs that ship with the installed version instead of guessing.

STEP 1 — WEB ANALYTICS SCRIPT
Add exactly this tag ONCE, in the global <head> shared by every PUBLIC page (root layout / base template / index.html):

${trackingScriptTag(siteKey)}

- Do NOT load it on admin, dashboard, login, checkout or any authenticated area.
- Next.js App Router: in the root layout use next/script with strategy="afterInteractive" and pass data-site, or a plain <script defer> in <head>.
- It sends one pageview per full page load. That is expected — do not add extra tracking calls.

STEP 2 — AI-CRAWLER TRACKING (server-side)
On every incoming PAGE request, fire-and-forget a POST to ${BOT_ENDPOINT} with this JSON body:

  { "siteKey": "${siteKey}", "path": "<request path>", "userAgent": "<User-Agent header>", "referrer": "<Referer header>" }

Rules:
- NEVER await it on the request path and NEVER let it throw or slow down the response. Catch and ignore errors; use a short timeout (about 2s).
- Skip static assets (_next, images, css, js, fonts, favicon, sitemaps) and API routes. It is safe to send ALL page requests: RankOnGeo ignores non-bot user agents.
- On serverless/edge, use the platform's background primitive so the call is not cancelled when the response ends: Next.js proxy/middleware → event.waitUntil(...), Cloudflare Workers → ctx.waitUntil(...), Vercel/other → the framework's after()/waitUntil equivalent. On a long-running Node server a plain un-awaited fetch is fine.
- If the framework has no safe place for server code (pure static hosting), implement it as a Cloudflare Worker in front of the site instead.

Reference implementation — Next.js:
${nextProxySnippet(siteKey)}

Reference implementation — Express:
${expressSnippet(siteKey)}

Reference implementation — Cloudflare Worker:
${cloudflareWorkerSnippet(siteKey)}

STEP 3 — VERIFY
- Start the app and confirm it still builds/runs with no new warnings.
- Confirm the <script> tag appears in the rendered HTML of a public page and NOT on authenticated pages.
- Prove the crawler call works by running:
${curlTestSnippet(siteKey)}
  Then tell me to open RankOnGeo → Analytics → Setup and press "Test", or visit the site once, to confirm the connection turns green.

STEP 4 — REPORT
List every file you changed and what each change does, in a short bullet list. If you had to skip or adapt any step, say why.`;
}
