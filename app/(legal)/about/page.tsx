import type { Metadata } from "next";
import { MarkdownArticle } from "../../_components/MarkdownArticle";
import { WebPageJsonLd } from "../../_components/WebPageJsonLd";

const DESCRIPTION =
  "RankOnGeo is an AI search visibility platform that tracks how often brands are mentioned across ChatGPT, Claude, Gemini, Perplexity, and Google AI.";

export const metadata: Metadata = {
  title: "About",
  description: DESCRIPTION,
};

const CONTENT = `
RankOnGeo is an AI search visibility platform. We track how often brands are mentioned when people ask ChatGPT, Claude, Gemini, Perplexity, and Google AI — the assistants your customers already use instead of typing a search query — then close the gaps with research, generated content, and one-click publishing.

## Why we built this

Search used to mean a results page. Increasingly, it means a single answer from an AI assistant — and that answer either includes your brand or it doesn't. Classic SEO tools have no visibility into that shift. RankOnGeo does: we run your brand's real questions through the actual engines your customers use, show you exactly where you're missing, and generate the citation-ready content to fix it.

## What we do

- **Measure** — composite visibility score across ChatGPT, Claude, Gemini, Perplexity, and Google AI, refreshed on a schedule.
- **Research** — surface the exact questions where competitors show up and you don't.
- **Write** — generate articles engineered to be cited by AI answer engines, not just ranked by classic search.
- **Publish** — push straight to WordPress, Shopify, Framer, or a custom webhook.

## Get in touch

Questions, feedback, or partnership ideas — email us at **support@rankongeo.com**.
`;

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <WebPageJsonLd type="AboutPage" name="About RankOnGeo" description={DESCRIPTION} path="/about" />
      <header className="mb-10">
        <h1 className="font-signal-serif text-4xl font-[350] leading-tight tracking-tight text-[var(--ink)] sm:text-5xl">
          About RankOnGeo
        </h1>
      </header>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-8 py-9 sm:px-10">
        <MarkdownArticle content={CONTENT} />
      </div>
    </div>
  );
}
