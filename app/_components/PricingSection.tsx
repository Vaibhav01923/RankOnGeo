"use client";
import { useState } from "react";

const PRICING = [
  {
    name: "Pro",
    desc: "For solopreneurs & small sites getting started with AI SEO.",
    price: 89,
    highlight: false,
    features: [
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
    desc: "For growing brands — multi-engine tracking, content automation, and gap detection.",
    price: 239,
    highlight: true,
    features: [
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
    desc: "For teams — full autopilot, unlimited seats.",
    price: 739,
    highlight: false,
    features: [
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
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  return (
    <section id="pricing" className="bg-[#080808] px-8 py-24">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h2
            className="text-4xl font-black tracking-tight mb-3 text-white"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Simple pricing. Every plan.
          </h2>
          <p className="text-[#555] mb-8">
            The full pipeline. The bigger the plan, the more brands, prompts, and articles.
          </p>
          <div
            className="inline-flex items-center gap-1 bg-[#161616] border border-white/[0.07] rounded-lg p-1"
            role="group"
            aria-label="Billing period"
          >
            <button
              onClick={() => setBilling("monthly")}
              aria-pressed={billing === "monthly"}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-[#161616] ${
                billing === "monthly"
                  ? "bg-[#2a2a2a] text-white shadow-sm"
                  : "text-[#666] hover:text-[#999]"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBilling("annual")}
              aria-pressed={billing === "annual"}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1 focus-visible:ring-offset-[#161616] ${
                billing === "annual"
                  ? "bg-[#2a2a2a] text-white shadow-sm"
                  : "text-[#666] hover:text-[#999]"
              }`}
            >
              Annual{" "}
              <span className="text-brand text-xs ml-1 font-semibold">−17%</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {PRICING.map((plan) => {
            const price =
              billing === "annual" ? Math.round(plan.price * 0.83) : plan.price;
            return (
              <div
                key={plan.name}
                className={`rounded-2xl p-7 border transition-all ${
                  plan.highlight
                    ? "bg-[#111] border-brand/35"
                    : "bg-[#111] border-white/[0.07]"
                }`}
                style={
                  plan.highlight
                    ? { boxShadow: "0 0 40px rgba(200,55,45,0.1)" }
                    : undefined
                }
              >
                {plan.highlight && (
                  <div className="text-xs bg-brand text-white px-3 py-1 rounded-full w-fit mb-4 font-semibold">
                    Most picked
                  </div>
                )}
                <h3 className="text-xl font-black mb-2 text-white">{plan.name}</h3>
                <p className="text-sm mb-5 text-[#555]">{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-4xl font-black text-white">${price}</span>
                  <span className="text-sm ml-1 text-[#555]">/ month</span>
                </div>
                <button
                  className={`w-full py-3 rounded-xl text-sm font-semibold mb-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#111] ${
                    plan.highlight
                      ? "bg-brand hover:bg-brand-dark text-white focus-visible:ring-white"
                      : "bg-white/[0.08] hover:bg-white/[0.14] text-white focus-visible:ring-brand"
                  }`}
                >
                  Get started
                </button>
                <ul className="space-y-2.5">
                  {plan.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-sm text-[#888]"
                    >
                      <span className="text-brand shrink-0 mt-0.5" aria-hidden="true">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
