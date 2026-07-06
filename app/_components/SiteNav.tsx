"use client";
import { useEffect, useState } from "react";
import { MobileNav } from "./MobileNav";

function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="14" stroke="var(--line)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6" stroke="var(--rust)" strokeWidth="2" />
      <circle cx="16" cy="16" r="12.5" stroke="var(--rust)" strokeWidth="1.4" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
      <circle cx="26.5" cy="9" r="2.2" fill="var(--olive)" />
    </svg>
  );
}

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed inset-x-0 top-0 z-50 border-b transition-all duration-500 ${
        scrolled ? "border-[var(--line)] bg-[var(--surface)]" : "border-transparent bg-transparent"
      }`}
      aria-label="Main navigation"
    >
      <div className="relative mx-auto flex max-w-6xl items-center gap-9 px-6 py-4">
        <a
          href="#top"
          className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)] rounded"
        >
          <LogoMark />
          RankOnGeo
        </a>
        <div className="hidden flex-1 items-center gap-7 text-sm text-[var(--ink-soft)] md:flex">
          <a href="#platform" className="rounded py-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">Platform</a>
          <a href="#loop" className="rounded py-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">How it works</a>
          <a href="#pricing" className="rounded py-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">Pricing</a>
          <a href="#faq" className="rounded py-2 transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">FAQ</a>
        </div>
        <div className="ml-auto flex items-center gap-4">
          <a
            href="/auth?mode=signin"
            className="hidden rounded text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)] md:block"
          >
            Login
          </a>
          <a
            href="/dashboard"
            className="rounded-full bg-[var(--rust)] px-5 py-2 text-sm font-semibold text-[var(--surface)] shadow-[0_8px_20px_-8px_oklch(0.56_0.15_38_/_55%)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[var(--rust-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cream)]"
          >
            Dashboard
          </a>
          <MobileNav />
        </div>
      </div>
    </nav>
  );
}
