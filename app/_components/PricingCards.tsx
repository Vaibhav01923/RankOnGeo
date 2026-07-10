"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export const PRICING = [
  {
    name: "Pro",
    planKey: "starter",
    desc: "For solo founders proving the channel.",
    price: 49,
    highlight: false,
    features: [
      "50 credits for Reddit upvotes, comments, comment upvotes & more",
      "50 tracked prompts",
      "3 AI engines",
      "1 website",
      "20,000 web + LLM analytics events / mo",
      "Unlimited SEO articles",
      "Gap detection & gap → article",
      "Daily visibility updates",
      "Competitor tracking",
      "Auto-publish to WordPress, Shopify & Framer",
      "Email support",
    ],
  },
  {
    name: "Business",
    planKey: "growth",
    desc: "For teams that want the loop on autopilot.",
    price: 99,
    highlight: true,
    features: [
      "100 credits for Reddit upvotes, comments, comment upvotes & more",
      "150 tracked prompts",
      "6 AI engines",
      "3 websites",
      "100,000 web + LLM analytics events / mo",
      "Unlimited SEO articles",
      "Gap detection & gap → article",
      "Daily visibility updates",
      "Competitor tracking",
      "Auto-publish to WordPress, Shopify & Framer",
      "Email support",
    ],
  },
  {
    name: "Scale",
    planKey: "enterprise",
    desc: "For agencies & multi-brand portfolios.",
    price: 149,
    highlight: false,
    features: [
      "150 credits for Reddit upvotes, comments, comment upvotes & more",
      "400 tracked prompts",
      "All 7 AI engines",
      "10 websites",
      "500,000 web + LLM analytics events / mo",
      "Unlimited SEO articles",
      "Gap detection & gap → article",
      "Daily visibility updates",
      "Competitor tracking",
      "Auto-publish to WordPress, Shopify & Framer",
      "Email support",
    ],
  },
];

export function PricingCards({ compact = false, early = false }: { compact?: boolean; early?: boolean }) {
  const router = useRouter();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  async function startCheckout(plan: string) {
    setCheckingOut(plan);
    try {
      const res = await fetch("/api/dodo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, cancelPath: window.location.pathname, ...(early ? { early: true } : {}) }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        router.push(`/auth?redirect=${encodeURIComponent(early ? "/early" : "/dashboard")}`);
      } else {
        alert(data.error ?? "Checkout failed. Try again.");
      }
    } finally {
      setCheckingOut(null);
    }
  }

  return (
    <div>
      <div className={`mb-6 flex justify-center ${early ? "hidden" : ""}`}>
        <div
          className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--surface)] p-1"
          role="group"
          aria-label="Billing period"
        >
          <button
            onClick={() => setBilling("monthly")}
            aria-pressed={billing === "monthly"}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)] ${
              billing === "monthly" ? "bg-[var(--rust-wash)] text-[var(--rust-deep)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("annual")}
            aria-pressed={billing === "annual"}
            className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)] ${
              billing === "annual" ? "bg-[var(--rust-wash)] text-[var(--rust-deep)]" : "text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
            }`}
          >
            Annual <span className="ml-1 text-xs font-semibold text-[var(--olive)]">−17%</span>
          </button>
        </div>
      </div>

      <div className={`grid grid-cols-1 items-stretch gap-6 md:grid-cols-3`}>
        {PRICING.map((plan) => {
          const base = billing === "annual" && !early ? Math.round(plan.price * 0.83) : plan.price;
          const price = early ? Math.round(plan.price / 2) : base;
          return (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-3xl transition-transform duration-500 hover:-translate-y-1.5 ${compact ? "p-6" : "p-8"} ${
                plan.highlight
                  ? "bg-[var(--surface)] border-2 border-[var(--rust)]/30"
                  : "bg-[var(--surface)] border border-[var(--line)]"
              }`}
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--rust)] px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--surface)]">
                  Most picked
                </div>
              )}
              <h3
                className={`text-sm font-semibold uppercase tracking-[0.14em] ${
                  plan.highlight ? "text-[var(--rust)]" : "text-[var(--ink-soft)]"
                }`}
              >
                {plan.name}
              </h3>
              <div className="mb-1 mt-5 flex items-baseline gap-2">
                {early && (
                  <span className="font-signal-mono text-2xl text-[var(--ink-faint)] line-through decoration-[var(--rust)]/60">
                    ${plan.price}
                  </span>
                )}
                <span className="font-signal-mono text-5xl font-semibold tracking-tight text-[var(--ink)]">${price}</span>
                <span className="text-sm text-[var(--ink-faint)]">/ month</span>
              </div>
              <p className="mb-7 text-sm text-[var(--ink-soft)]">{plan.desc}</p>
              <ul className="mb-8 flex-1 space-y-2.5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--ink-soft)]">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-[var(--rust)]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                      <path d="M13 4.5L6.5 11 3 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => startCheckout(plan.planKey)}
                disabled={checkingOut === plan.planKey}
                className={`w-full rounded-full py-3 text-center text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cream)] disabled:opacity-60 ${
                  plan.highlight
                    ? "bg-[var(--rust)] text-[var(--surface)] hover:bg-[var(--rust-deep)]"
                    : "bg-[var(--line-soft)] text-[var(--ink)] hover:bg-[var(--line)]"
                }`}
              >
                {checkingOut === plan.planKey ? "Redirecting…" : early ? "Claim 50% off" : "Get started"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
