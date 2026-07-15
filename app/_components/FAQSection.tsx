"use client";
import { useState } from "react";

const FAQS = [
  {
    q: "What's the difference between SEO and what RankOnGeo does?",
    a: "Classic SEO earns you a blue link on a results page. GEO — generative engine optimization — earns you a citation inside the answer itself. RankOnGeo measures how often AI engines mention and recommend your brand, then produces the content those engines actually pull from. The two compound: everything we publish is technically sound SEO too.",
  },
  {
    q: "Which AI engines do you track?",
    a: "Five: ChatGPT, Claude, Gemini, Perplexity, and Google AI Overviews. Every plan — Pro, Business, and Scale — tracks all five; higher tiers get more tracked prompts and websites, not more engines.",
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

export function FAQSection() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <section id="faq" className="px-6 pb-28 pt-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-12 text-center">
          <h2
            className="font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)]"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Asked <em className="italic text-[var(--rust)]">&amp;</em> answered
          </h2>
        </div>
        <div className="divide-y divide-[var(--line)]">
          {FAQS.map((faq, i) => {
            const open = openFaq === i;
            return (
              <div key={i}>
                <button
                  className="group flex w-full items-center justify-between gap-6 rounded px-1 py-6 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
                  onClick={() => setOpenFaq(open ? null : i)}
                  aria-expanded={open}
                  aria-controls={`faq-answer-${i}`}
                >
                  <span className="text-[16px] font-medium text-[var(--ink)] transition-colors group-hover:text-[var(--rust)]">
                    {faq.q}
                  </span>
                  <span
                    className={`relative h-[30px] w-[30px] shrink-0 rounded-full border border-[var(--line)] transition-all duration-500 ${
                      open ? "rotate-[135deg] border-[var(--rust)]/40" : ""
                    }`}
                    aria-hidden="true"
                  >
                    <span className={`absolute left-1/2 top-1/2 h-[1.5px] w-3 -translate-x-1/2 -translate-y-1/2 ${open ? "bg-[var(--rust)]" : "bg-[var(--ink-soft)]"}`} />
                    <span className={`absolute left-1/2 top-1/2 h-3 w-[1.5px] -translate-x-1/2 -translate-y-1/2 ${open ? "bg-[var(--rust)]" : "bg-[var(--ink-soft)]"}`} />
                  </span>
                </button>
                {/* Always rendered (not conditionally mounted) so every answer is
                    present in server HTML for crawlers/AI engines — only the
                    visual expand/collapse is CSS-driven via max-height. (A
                    grid-template-rows 0fr/1fr approach was tried first, but grid
                    track sizing still reserves space for the item's padding even
                    at min-height:0 — max-height + overflow:hidden clips it fully.) */}
                <div
                  id={`faq-answer-${i}`}
                  role="region"
                  aria-hidden={!open}
                  className="overflow-hidden transition-[max-height] duration-500 ease-out"
                  style={{ maxHeight: open ? "500px" : "0px" }}
                >
                  <div className="max-w-[640px] px-1 pb-7 text-[15px] leading-relaxed text-[var(--ink-soft)]">
                    {faq.a}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-[var(--ink-faint)]">
          Still have questions?{" "}
          <a
            href="mailto:hello@rankongeo.com"
            className="rounded text-[var(--rust)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
          >
            Drop us a line
          </a>{" "}
          and we&apos;ll reply within a business day.
        </p>
      </div>
    </section>
  );
}
