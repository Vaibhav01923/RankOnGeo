"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { PRICING, TRIAL_DAYS, formatPlanPrice, pricePerDay } from "@/lib/pricing";
import type { OfferAction } from "@/lib/setup-funnel";

const FOUNDER_EMAIL = "vaibhavkandpal81@gmail.com";

// One row per thing the plan does, revealed one after another. The gap is short
// on purpose: the whole reveal (features, price, offer) lands in about three seconds.
const STAGGER_MS = 380;

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {path}
  </svg>
);

const FEATURES: { title: string; body: string; icon: ReactNode }[] = [
  {
    title: "AI Citation Report",
    body: "See exactly when ChatGPT, Gemini, Perplexity, Claude and Google AI mention you, and when they don't.",
    icon: icon(<><path d="M9 3h6l4 4v14H5V3h4z" /><path d="M9 14l2 2 4-4" /></>),
  },
  {
    title: "Finds the keywords worth ranking on",
    body: "Real search volumes for what your buyers actually type, picked for your business.",
    icon: icon(<><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></>),
  },
  {
    title: "Publishes blog posts to rank you (SEO)",
    body: "Written, published and refreshed for you, as often as a post every day.",
    icon: icon(<><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>),
  },
  {
    title: "Gets you mentioned by AI (GEO)",
    body: "We close the gaps where ChatGPT, Gemini and Google's AI search answer without naming you.",
    icon: icon(<><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" /><path d="M19 17l.7 1.8L21.5 19.5l-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7L19 17z" /></>),
  },
  {
    title: "Reddit marketing",
    body: "Upvotes and comments in the threads where your buyers ask for recommendations.",
    icon: icon(<><path d="M4 5h16v11H9l-5 4V5z" /><path d="M8.5 10h7" /></>),
  },
];

// Reveal steps after the last feature: the price, then the gold offer card.
const EXTRA_STEPS = 2;

type Props = {
  brandName: string;
  domain: string;
  onBack: () => void;
  onContinue: () => void;
  onAction: (action: OfferAction) => void;
};

export default function OfferStep({ brandName, domain, onBack, onContinue, onAction }: Props) {
  const plan = PRICING[0];
  const total = FEATURES.length + EXTRA_STEPS;
  const [shown, setShown] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? total : 0
  );
  const done = shown >= total;

  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setShown((n) => Math.min(total, n + 1)), STAGGER_MS);
    return () => clearInterval(id);
  }, [done, total]);

  // The parent dedupes actions per page load, so a re-render here can't double-count.
  const onActionRef = useRef(onAction);
  useEffect(() => {
    onActionRef.current = onAction;
  });
  useEffect(() => {
    if (done) onActionRef.current("features_seen");
  }, [done]);

  const reveal = (visible: boolean) =>
    `transition-all duration-300 ease-out motion-reduce:transition-none ${visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`;

  return (
    <div>
      <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Meet your new marketing employee</h1>
      <p className="text-[var(--ink-soft)] text-sm mb-6">
        RankOnGeo looks after {brandName || "your brand"}&apos;s marketing around the clock, for {formatPlanPrice(plan.price)}/mo.
      </p>

      <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--ink-faint)] mb-3">What you get</p>
      <ul className="space-y-2.5 mb-6">
        {FEATURES.map((f, i) => (
          <li
            key={f.title}
            className={`flex gap-3 bg-[var(--surface)] border border-[var(--line)] rounded-xl px-4 py-3 ${reveal(shown > i)}`}
          >
            <span className="w-9 h-9 rounded-lg bg-[var(--rust-wash)] text-[var(--rust-deep)] flex items-center justify-center shrink-0">{f.icon}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--ink)]">{f.title}</p>
              <p className="text-xs text-[var(--ink-soft)] mt-0.5">{f.body}</p>
            </div>
            <span
              className={`self-center w-5 h-5 rounded-full bg-[var(--olive)] text-white flex items-center justify-center shrink-0 transition-transform duration-300 delay-150 motion-reduce:transition-none ${shown > i ? "scale-100" : "scale-0"}`}
              aria-hidden="true"
            >
              <svg viewBox="0 0 24 24" className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
          </li>
        ))}
      </ul>

      <div className={`rounded-xl border border-[var(--rust)] bg-[var(--rust-wash)] px-5 py-4 mb-5 text-center ${reveal(shown > FEATURES.length)}`}>
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--rust-deep)] mb-1">All of it, one plan</p>
        <p className="text-[var(--ink)]">
          <span className="font-signal-serif text-5xl">{formatPlanPrice(plan.price)}</span>
          <span className="text-sm text-[var(--ink-soft)]"> /month</span>
        </p>
        <p className="text-xs text-[var(--ink-soft)] mt-1">About {pricePerDay(plan.price)} a day. Start with a {TRIAL_DAYS}-day free trial, cancel anytime.</p>
      </div>

      <div
        className={`relative overflow-hidden rounded-2xl p-5 mb-6 border border-[#d8a93a] shadow-[0_8px_28px_-10px_rgba(190,140,20,0.55)] ${reveal(shown > FEATURES.length + 1)}`}
        style={{ background: "linear-gradient(135deg, #fff3c4 0%, #f6d77c 48%, #e8b53f 100%)", color: "#3d2a00" }}
      >
        <span
          className="offer-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/60 to-transparent"
          aria-hidden="true"
        />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em]" style={{ background: "#3d2a00", color: "#ffe9a8" }}>
            ★ Limited-time offer · until October 2026
          </span>
          <p className="font-signal-serif text-2xl mt-3 mb-1">Earn a backlink from RankOnGeo</p>
          <p className="text-sm" style={{ color: "#5a3f05" }}>
            Subscribe while this offer is on and RankOnGeo links to {brandName || "your site"}, a backlink that supports your search rankings.
          </p>
          <p className="text-sm mt-3" style={{ color: "#5a3f05" }}>
            To claim it, email the founder at{" "}
            <a
              href={`mailto:${FOUNDER_EMAIL}?subject=${encodeURIComponent(`Backlink request: ${domain.trim() || brandName || "my site"}`)}`}
              onClick={() => onAction("backlink_email_clicked")}
              className="font-bold underline"
            >
              {FOUNDER_EMAIL}
            </a>
            , or submit your backlink request in the Feedback tab of your dashboard once you&apos;ve subscribed.
          </p>
        </div>
      </div>

      <div className={`flex gap-3 ${reveal(done)} ${done ? "" : "pointer-events-none"}`}>
        <button
          type="button"
          onClick={() => {
            onAction("back_clicked");
            onBack();
          }}
          className="px-5 py-3 border border-[var(--line)] text-[var(--ink-soft)] rounded-lg text-sm font-medium hover:bg-[var(--line-soft)] transition-colors"
        >
          ← Back
        </button>
        <button
          type="button"
          disabled={!done}
          onClick={() => {
            onAction("cta_clicked");
            onContinue();
          }}
          className="flex-1 bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] py-3 rounded-lg text-sm font-semibold transition-colors disabled:cursor-default"
        >
          Start my free trial →
        </button>
      </div>
      <p className={`text-xs text-[var(--ink-faint)] mt-4 text-center ${reveal(done)}`}>
        We&apos;ve run Reddit marketing for Cluely, Tsenta, Affogato AI, and Interview Coder, and helped them grow.
      </p>
    </div>
  );
}
