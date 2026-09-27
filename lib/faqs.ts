// Plain data, deliberately not in FAQSection.tsx: that file is "use client",
// and Next.js wraps every export of a client module in a client reference
// (even non-component data), so a server component importing it sees a proxy,
// not the real array — see lib/pricing.ts for the same note. app/page.tsx
// builds FAQPage schema from this array, and FAQSection.tsx renders it, so
// the two can never say different things.
export const FAQS = [
  {
    q: "What's the difference between SEO and what RankOnGeo does?",
    a: "Classic SEO earns you a blue link on a results page. GEO — generative engine optimization — earns you a citation inside the answer itself. RankOnGeo measures how often AI engines mention and recommend your brand, then produces the content those engines actually pull from. The two compound: everything we publish is technically sound SEO too.",
  },
  {
    q: "Which AI engines do you track?",
    a: "Five: ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews. One plan, and it tracks all five.",
  },
  {
    q: "How is this different from Peec AI, Otterly, or similar tools?",
    a: "Monitoring tools tell you you're invisible — and stop there. RankOnGeo closes the loop: it finds the queries where you're missing, writes source-grounded articles engineered for citation, publishes them straight to your CMS, then re-measures to prove the lift. Diagnosis and treatment in one platform.",
  },
  {
    q: "Will I get penalized for AI-generated content?",
    a: "No. Google's guidance is explicit: it rewards helpful content, however it's produced. Every RankOnGeo article is source-grounded, structured with schema and FAQ blocks, and built to answer real queries. Thin, unedited AI spam is what gets penalized — that's not what this is.",
  },
  {
    q: "How fast can I expect to see results?",
    a: "Your first visibility score lands in about 60 seconds. Published content typically starts earning AI citations within 2–6 weeks depending on how often the engines refresh their sources — and you'll watch the score move on your dashboard the whole way.",
  },
];
