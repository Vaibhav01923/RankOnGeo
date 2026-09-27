// A small, hand-verified bank of real, dated industry facts the blog writer is
// allowed to cite (see lib/article-writer.ts and app/api/admin/blog/generate).
// The model has no web access and can't check its own claims, so it may cite
// ONLY what's here, verbatim, with the exact source and link — never invent a
// study, a statistic, or a source of its own. Each entry names its own date so
// a claim never gets read as "current"; re-verify and refresh every few months,
// since stats like these age within a year.
export type GeoFact = { fact: string; source: string; url: string };

export const GEO_FACTS: GeoFact[] = [
  {
    fact: "ChatGPT reached 900 million weekly active users in February 2026, more than double the 400 million it had a year earlier",
    source: "TechCrunch, February 2026",
    url: "https://techcrunch.com/2026/02/27/chatgpt-reaches-900m-weekly-active-users",
  },
  {
    fact: "Google AI Overviews appeared in 13.14% of U.S. desktop searches in March 2025, up from 6.49% in January — a 102% jump in two months, per an analysis of over 10 million keywords",
    source: "Search Engine Land, citing Semrush and Datos data, May 2025",
    url: "https://searchengineland.com/google-ai-overviews-13-searches-455057",
  },
  {
    fact: "69% of B2B buyers say they still turn to a human sales rep to validate insights a generative AI tool gave them, per a survey of 645 B2B buyers",
    source: "Gartner, May 2026",
    url: "https://www.gartner.com/en/newsroom/press-releases/2026-05-20-gartner-survey-finds-sixty-nine-percent-of-b-two-b-buyers-turn-to-sales-reps-to-validate-ai-generated-insights",
  },
];

export function geoFactsBlock(): string {
  return GEO_FACTS.map((f) => `- "${f.fact}" — ${f.source}: ${f.url}`).join("\n");
}
