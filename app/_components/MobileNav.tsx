"use client";
import { useState } from "react";
import { DEMO_CALL_URL } from "@/lib/links";

const LINKS = [
  { label: "Platform", href: "/#platform" },
  { label: "How it works", href: "/#loop" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
  { label: "Blog", href: "/blog" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Toggle navigation menu"
        className="rounded p-2 text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          {open ? (
            <path d="M4 4L16 16M4 16L16 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          ) : (
            <path d="M3 6h14M3 10h14M3 14h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          )}
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 flex flex-col gap-1 border-b border-[var(--line)] bg-[var(--surface)] px-8 py-4 shadow-lg">
          {LINKS.map(({ label, href }) => (
            <a
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="rounded py-3 text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--rust)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
            >
              {label}
            </a>
          ))}
          <a
            href={DEMO_CALL_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="rounded py-3 text-sm font-medium text-[var(--rust)] transition-colors hover:text-[var(--rust-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
          >
            Book a demo
          </a>
          <a
            href="/auth?mode=signin"
            rel="nofollow"
            onClick={() => setOpen(false)}
            className="rounded py-3 text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--rust)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]"
          >
            Login
          </a>
        </div>
      )}
    </div>
  );
}
