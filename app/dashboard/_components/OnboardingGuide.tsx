"use client";

import { useEffect, useState } from "react";
import type { OnboardingItem } from "./OnboardingChecklist";

// First-run walkthrough for a new account: what RankOnGeo does for them, the
// few things they do to switch it on, and an honest picture of the timeline.
// Deliberately makes no numeric promise about traffic or rankings — those
// depend on niche and competition, and are measured in the dashboard instead.

const DOES_FOR_YOU: { title: string; body: string }[] = [
  { title: "Measures your AI visibility", body: "Every 3 days we ask ChatGPT, Claude, Gemini, Perplexity and Google AI the questions your customers ask, and record whether you are recommended and who is instead." },
  { title: "Finds the gaps", body: "The questions where AI answers without mentioning you become your content to-do list." },
  { title: "Writes the articles", body: "Full SEO- and AI-optimised posts for those gaps, written in your niche's language and grounded in what your product actually does." },
  { title: "Publishes them for you", body: "With Autopilot on, new posts go out to your website on a schedule you choose. Or save them as drafts and approve each one." },
  { title: "Improves what is not working", body: "After 45 days each post is checked. Ones that are not getting seen or clicked are rewritten to cover the searches they should win." },
  { title: "Shows you the results", body: "Your traffic, the visitors arriving from AI answers, which AI crawlers read your pages, and your Google Search performance, all in one Analytics tab." },
];

const TIMELINE: { when: string; what: string }[] = [
  { when: "Day 1", what: "Your first scan runs and sets your baseline AI visibility score. Everything after is measured against it." },
  { when: "Weeks 1 to 4", what: "Your first posts go live. Search engines and AI crawlers need a little time to find and index them." },
  { when: "Months 2 to 3", what: "Rankings and AI citations start to move for the topics you cover. You will see it in Analytics and in your visibility score." },
  { when: "Months 4 to 6", what: "It compounds. Older posts keep earning, refreshed ones improve, and every new post builds on a larger base." },
];

const PAGES = ["What we do", "Set up", "What to expect"] as const;

export function OnboardingGuide({
  open,
  onClose,
  onStartTour,
  items,
  domain,
}: {
  open: boolean;
  onClose: () => void;
  onStartTour: () => void;
  items: OnboardingItem[];
  domain: string;
}) {
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (open) setPage(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const last = page === PAGES.length - 1;
  const core = items.filter((i) => !i.optional);
  const doneCount = core.filter((i) => i.done).length;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="bg-[var(--surface)] rounded-2xl w-full max-w-2xl max-h-[92vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-5 pb-4 border-b border-[var(--line)] flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold text-[var(--rust)] uppercase tracking-widest">
              Getting started · {page + 1} of {PAGES.length}
            </p>
            <h2 id="onboarding-title" className="text-lg font-semibold text-[var(--ink)] mt-1">
              {page === 0 && `Welcome. Here is what RankOnGeo does for ${domain || "your site"}`}
              {page === 1 && "Set it up in about 5 minutes"}
              {page === 2 && "What to expect"}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="text-[var(--ink-faint)] hover:text-[var(--ink-soft)] text-xl leading-none shrink-0">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto">
          {page === 0 && (
            <>
              <p className="text-sm text-[var(--ink-soft)] leading-relaxed mb-5">
                Your customers now ask AI assistants what to buy, and Google answers with AI too. RankOnGeo works to get your brand recommended in those answers and to grow the search traffic that follows. Most of it runs on its own once you switch it on.
              </p>
              <div className="space-y-3">
                {DOES_FOR_YOU.map((d, i) => (
                  <div key={d.title} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-[var(--rust-wash)] text-[var(--rust-deep)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    <div>
                      <p className="text-sm font-semibold text-[var(--ink)]">{d.title}</p>
                      <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-0.5">{d.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {page === 1 && (
            <>
              <p className="text-sm text-[var(--ink-soft)] leading-relaxed mb-4">
                {doneCount} of {core.length} done. Each step opens the right screen, and it turns green here on its own once it is working.
              </p>
              <div className="space-y-2.5">
                {items.map((item) => (
                  <div key={item.id} className="flex items-start gap-3 border border-[var(--line)] rounded-xl px-3.5 py-3">
                    <span
                      className={`mt-0.5 w-5 h-5 rounded-full shrink-0 flex items-center justify-center text-[11px] font-bold ${
                        item.done ? "bg-[var(--olive)] text-[var(--surface)]" : "border border-[var(--line)] text-transparent"
                      }`}
                      aria-hidden="true"
                    >
                      ✓
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[var(--ink)]">
                        {item.title}
                        {item.optional && <span className="ml-2 text-[10px] font-medium text-[var(--ink-faint)] uppercase tracking-wide">Optional</span>}
                      </p>
                      <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-0.5">{item.body}</p>
                    </div>
                    {!item.done && (
                      <button
                        onClick={() => { item.onClick(); onClose(); }}
                        className="shrink-0 text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-3 py-1.5 rounded-lg hover:bg-[var(--rust-deep)] transition-colors whitespace-nowrap self-center"
                      >
                        {item.cta}
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--ink-faint)] mt-4">You can skip any of these and come back. The checklist stays on your Overview page until they are done.</p>
            </>
          )}

          {page === 2 && (
            <>
              <p className="text-sm text-[var(--ink-soft)] leading-relaxed mb-5">
                Search and AI visibility build over time. Here is the realistic shape of it:
              </p>
              <div className="space-y-4 border-l-2 border-[var(--line)] pl-4 ml-1">
                {TIMELINE.map((t) => (
                  <div key={t.when}>
                    <p className="text-sm font-semibold text-[var(--ink)]">{t.when}</p>
                    <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-0.5">{t.what}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--ink-soft)] leading-relaxed mt-5 bg-[var(--line-soft)] rounded-lg px-3.5 py-3">
                Content compounds, so the longer it runs the more it does. How fast it moves depends on your niche and how crowded it is, so we measure everything against your starting point and show you your own numbers rather than promising a figure.
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[var(--line)] flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {PAGES.map((p, i) => (
              <span key={p} className={`h-1.5 rounded-full transition-all ${i === page ? "w-5 bg-[var(--rust)]" : "w-1.5 bg-[var(--line)]"}`} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {page > 0 ? (
              <button onClick={() => setPage(page - 1)} className="text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--ink)] px-3 py-2 transition-colors">Back</button>
            ) : (
              <button onClick={onClose} className="text-xs font-medium text-[var(--ink-faint)] hover:text-[var(--ink-soft)] px-3 py-2 transition-colors">Skip for now</button>
            )}
            {last ? (
              <>
                <button onClick={() => { onClose(); onStartTour(); }} className="text-xs font-semibold border border-[var(--line)] text-[var(--ink-soft)] px-3.5 py-2 rounded-lg hover:bg-[var(--line-soft)] transition-colors">Show me around</button>
                <button onClick={onClose} className="text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">Go to my dashboard</button>
              </>
            ) : (
              <button onClick={() => setPage(page + 1)} className="text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] px-4 py-2 rounded-lg hover:bg-[var(--rust-deep)] transition-colors">Next</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
