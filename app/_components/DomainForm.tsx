"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function DomainForm({ variant = "hero" }: { variant?: "hero" | "cta" }) {
  const router = useRouter();
  const [domain, setDomain] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = domain.trim();
    const params = new URLSearchParams();
    if (d) params.set("domain", d);
    router.push(`/setup${params.size ? `?${params}` : ""}`);
  }

  const inputId = variant === "hero" ? "domain-hero" : "domain-cta";

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor={inputId} className="sr-only">
        Your website domain
      </label>
      <div className="flex gap-2.5 max-sm:flex-col">
        <div className="flex flex-1 items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--surface)] px-5 transition-colors focus-within:border-[var(--rust)]/50">
          <svg className="h-4 w-4 shrink-0 text-[var(--ink-faint)]" fill="none" viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
            <path d="M2.5 8h11M8 2c1.8 1.7 2.6 3.8 2.6 6S9.8 12.3 8 14c-1.8-1.7-2.6-3.8-2.6-6S6.2 3.7 8 2z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <input
            id={inputId}
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yoursite.com"
            className="flex-1 bg-transparent py-3.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
          />
        </div>
        <button
          type="submit"
          className="flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[var(--rust)] px-7 py-3.5 text-sm font-semibold text-[var(--surface)] shadow-[0_8px_20px_-8px_oklch(0.56_0.15_38_/_55%)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--rust-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cream)]"
        >
          Free analysis
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </form>
  );
}
