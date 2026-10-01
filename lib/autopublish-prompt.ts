// A ready-to-paste prompt for an AI coding assistant (Claude Code, Cursor,
// ChatGPT) to build the receiving endpoint — and the blog it publishes into —
// on the customer's own site. This is what makes "any website or CMS" an
// auto-publish target without RankOnGeo needing a dedicated integration for
// each one. Shared by the dashboard's Add Channel modal and /docs/autopublish.
//
// Must stay in sync with the webhook branch of lib/publish-article.ts: the
// request body and header name it sends, the `action: "update"` +
// `external_id` it sends for rewrites, and the `{ id, url }` it reads back
// (without them Autopilot can't measure a post or update it in place).
//
// The server-rendering and display steps exist because receivers built from
// the earlier prompt served the post body and the /blog list from browser
// JavaScript only (crawlers saw empty pages), left tables unstyled, and showed
// the title twice.
export function buildAutopublishPrompt(secret: string, stack: string): string {
  const stackLine = stack.trim() || `{describe your site/CMS/stack here — e.g. "Next.js app router blog", "Vite + React SPA on Vercel with Supabase", "Webflow CMS collection", "custom Express + Postgres site"}`;
  return `I want to receive blog posts automatically from RankOnGeo and publish them on my site.

My site/stack: ${stackLine}

RankOnGeo will POST to an endpoint I create whenever a new article is ready, and again whenever it improves an article it already sent. If this project already has a RankOnGeo endpoint or blog, upgrade that one so it meets everything below instead of building a second one.

Before changing anything, work out the framework, how its pages are rendered (on the server, at build time, or in the browser) and where it is hosted, and state that in one line.

1. RECEIVE — create an API endpoint (in whatever way fits my stack) that accepts POST requests with this JSON body:
   {
     "title": string,        // article headline
     "content": string,      // full article body, as GitHub-flavored Markdown (may include tables); the title is not repeated in it
     "keyword": string,      // the target SEO keyword this article targets
     "description": string,  // optional — SEO meta description, may be empty
     "tags": string[],       // optional — topic tags, may be empty
     "image_url": string,    // optional — cover image URL, may be empty
     "status": "publish",
     "source": "rankongeo",
     "action": "update",     // only present when RankOnGeo is replacing a post it sent before
     "external_id": string   // only present with "action": "update" — the id you returned for that post
   }

2. VERIFY — reject (401) any request where the \`X-RankOnGeo-Secret\` header doesn't exactly equal: ${secret}

3. SAVE — store the post through my site's existing content system (CMS API, database, Markdown files — whatever fits my stack).
   - New post: give it a unique, readable slug from the title and its own URL, e.g. /blog/<slug>.
   - "action": "update": overwrite the post whose id is external_id. Keep its slug and URL unchanged, keep the existing cover image if image_url is empty, and never create a duplicate.
   - If my site has no blog yet, create one: a listing page at /blog and a page for each post, styled to match the rest of my site, with a link to /blog from the main navigation or footer.

4. SERVER-RENDER THE BLOG — this is the most important step.
   Google's first pass and AI crawlers (GPTBot, ClaudeBot, PerplexityBot) read the HTML the server sends and mostly don't run JavaScript, so a post whose text only appears after JavaScript runs is effectively invisible to them. With JavaScript turned off:
   - Each post's URL must return, in its initial HTML: the <title>, meta description, a canonical link to itself, an <h1> with the title, and the FULL article body — the Markdown converted to HTML on the server (headings, paragraphs, lists, links, images).
   - /blog must return, in its initial HTML, a real <a href> link to every published post, newest first (paginate with plain links if there are many).
   - A new or updated post must show up on both pages within a few minutes, with no manual rebuild or redeploy.
   Fetching posts in the browser (useEffect, fetch, a Supabase/Firebase client) does NOT meet this, and neither does putting only the meta tags in the server HTML. Pick the approach that fits my stack:
   - Server-rendered framework (Next.js, Nuxt, SvelteKit, Remix, Astro with server output, Rails, Django, Laravel, PHP, Express with templates): render both pages on the server. If they're cached or statically generated, revalidate them from the endpoint after each save.
   - Client-side single-page app (Vite/CRA React, Vue or Svelte SPA, Lovable, Bolt and similar): route /blog and /blog/* to a server function on my host (e.g. a Vercel, Netlify or Cloudflare function, via rewrites). It loads the post(s), converts the Markdown to HTML, and returns the app's index.html with the meta tags AND the article body or post list already inside the root element. The app can take over in the browser afterwards.
   - Static site generator (Hugo, Jekyll, Eleventy, Gatsby, static Astro): save the post as a Markdown file and trigger a rebuild (commit through the Git provider's API, or call a deploy hook).
   - Hosted CMS (Webflow, Shopify, Ghost, Wix and similar): create the post through the CMS's own API — the CMS renders it on its server.

5. DISPLAY THE ARTICLE PROPERLY — the posts must look like they belong on my site, on desktop and on a phone:
   - Title: show "title" once, as the page's only <h1>. The content's own headings start at ## (H2) and ### (H3). If a post's content does start with a "# " heading line (older posts), drop that line rather than showing the title twice.
   - Markdown: the content is GitHub-flavored Markdown and regularly includes tables. Use a renderer that supports GFM tables (e.g. markdown-it or marked do by default; react-markdown needs the remark-gfm plugin). Raw "| a | b |" pipes on the page mean the renderer doesn't support them.
   - Style every element the content can contain, matching my site's design: ## and ### headings, paragraphs, bold and italic, links, bulleted and numbered lists, blockquotes, inline code, and images (full width of the article column, with their alt text). CSS resets such as Tailwind's preflight remove heading sizes, list bullets and table borders, so check those are styled back.
   - Tables: a visibly distinct header row, padding in every cell, borders or dividers between rows, and on narrow screens the table scrolls sideways inside its own box instead of squeezing the columns.
   - Cover image: if image_url is set, show it above the article and use it as the post's og:image.

6. MAKE IT DISCOVERABLE — every published post must be in my XML sitemap as soon as it's published: generate the sitemap from the stored posts (not only at build time), create one if none exists, and reference it in robots.txt. Nothing in robots.txt, meta robots tags or X-Robots-Tag headers may block /blog or the posts, and an unknown post URL must return a real 404 status.

7. RESPOND — on success return a 200 with { "ok": true, "id": "<stable id of the post>", "url": "<full public https URL of the post>" }. RankOnGeo stores both to track how the post performs and to send improved versions later. On failure return a clear error status and message (RankOnGeo shows the response back to me).

8. TEST IT — don't report this as done until every check passes (locally if it isn't deployed yet, and on the live site once it is):
   - Send a test post to the endpoint with curl, including the X-RankOnGeo-Secret header. Give its content a ## heading, a ### heading, a bulleted list, a link, an image and a 3-column table.
   - curl -s <the post's URL> — the raw HTML must contain exactly one <h1> (the title), a sentence from the middle of the article body, and a real <table> with <th> cells (not literal | pipes).
   - curl -s <my site>/blog — the raw HTML must contain a link to the test post.
   - The sitemap must list the test post's URL.
   - Open the post in a browser at desktop and at phone width: the headings, list, image and table are all styled, and the table scrolls sideways on the phone instead of crushing its columns.
   - Then delete the test post.
   If you can't run commands or open a browser yourself, give me the exact commands and tell me what to look for.

9. End your reply with a clearly labeled "What to do next" section for me, spelling out:
   - The exact endpoint URL to paste into RankOnGeo's "Your endpoint URL" field
   - Any manual step I still need to do myself (deploy, set an env var, restart something, etc.)
   Put this at the very end and make it stand out — I might not read back through the rest of this prompt.`;
}
