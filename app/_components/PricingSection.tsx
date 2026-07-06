"use client";
import { PricingCards } from "./PricingCards";

export function PricingSection() {
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
        </div>

        <PricingCards />
        <p className="mt-9 text-center text-sm text-[var(--ink-faint)]">
          Not sure yet? <span className="text-[var(--rust-deep)]">Run the free analysis first</span> — see your score before you
          spend a cent.
        </p>
      </div>
    </section>
  );
}
