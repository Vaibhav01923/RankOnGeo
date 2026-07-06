"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const PRICING = [
  {
    name: "Pro",
    planKey: "starter",
    desc: "For solo founders proving the channel.",
    price: 49,
    highlight: false,
    features: [
      "50 credits for Reddit upvotes",
      "10 SEO articles per month",
      "50 tracked prompts",
      "4,000 AI search responses / mo",
      "1 website · 1 team seat",
      "3 AI engines",
      "Weekly full refresh",
      "Google Search Console + GA4",
      "Webhook CMS publishing",
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
      "100 credits for Reddit upvotes",
      "Everything in Pro, plus:",
      "50 SEO articles per month",
      "150 tracked prompts",
      "6,000 AI search responses / mo",
      "3 websites · 5 team seats",
      "6 AI engines",
      "Daily visibility updates",
      "7 competitor brands",
      "Gap detection & gap → article",
      "Auto-publish to WordPress, Shopify & Framer",
    ],
  },
  {
    name: "Scale",
    planKey: "enterprise",
    desc: "For agencies & multi-brand portfolios.",
    price: 149,
    highlight: false,
    features: [
      "150 credits for Reddit upvotes",
      "Everything in Business, plus:",
      "150 SEO articles per month",
      "400 tracked prompts",
      "15,000 AI search responses / mo",
      "10 websites · Unlimited seats",
      "All 7 AI engines",
      "Expanded confidence checks",
      "25 competitor brands",
      "Full autopilot (gap → article → publish)",
      "Priority support",
    ],
  },
];

export function PricingSection() {
  const router = useRouter();
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [checkingOut, setCheckingOut] = useState<string | null>(null);

  async function startCheckout(plan: string) {
    setCheckingOut(plan);
    try {
      const res = await fetch("/api/dodo/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (res.status === 401) {
        router.push("/auth?redirect=/dashboard");
      } else {
        alert(data.error ?? "Checkout failed. Try again.");
      }
    } finally {
      setCheckingOut(null);
    }
  }

  return (
    <section id="pricing" className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <div className="mb-14 text-center">
          <h2
            className="mb-4 font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)] sm:text-5xl"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Plans that scale with your <em className="italic text-[var(--rust)]">visibility</em>
          </h2>
          <p className="mb-9 text-[var(--ink-soft)]">
            Every plan starts free — your first visibility score costs nothing.
          </p>
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

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
          {PRICING.map((plan) => {
            const price = billing === "annual" ? Math.round(plan.price * 0.83) : plan.price;
            return (
              <div
                key={plan.name}
                className={`relative flex flex-col rounded-3xl p-8 transition-transform duration-500 hover:-translate-y-1.5 ${
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
                <div className="mb-1 mt-5 flex items-baseline gap-1.5">
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
                  {checkingOut === plan.planKey ? "Redirecting…" : "Get started"}
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-9 text-center text-sm text-[var(--ink-faint)]">
          Not sure yet? <span className="text-[var(--rust-deep)]">Run the free analysis first</span> — see your score before you
          spend a cent.
        </p>
      </div>
    </section>
  );
}
