"use client";

import { useState } from "react";

// Floating "book a walkthrough call" prompt, bottom-right on every page —
// not a real live chat, just a lightweight nudge toward the same booking
// link used elsewhere (Reddit Marketing tab's "done for you" CTA).
const BOOKING_URL = "https://cal.com/vaibhav-kandpal/15min";

export function SupportChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[calc(100vw-2.5rem)] max-w-xs rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-xl p-4 animate-[fadeSlideIn_0.3s_ease_forwards]">
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-[var(--ink)]">Need a hand?</p>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Dismiss"
              className="text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-[var(--ink-soft)] mb-3">
            Want a guide on how to use the whole platform? Book a call with our team for a complete walkthrough — we&apos;ll answer any questions or suggestions too.
          </p>
          <a
            href={BOOKING_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full text-center text-sm font-semibold bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] px-4 py-2.5 rounded-lg transition-colors"
          >
            Book a call
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close support" : "Open support"}
        className="w-12 h-12 rounded-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] shadow-lg flex items-center justify-center transition-colors"
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 13a8 8 0 0 1 16 0v4.5a2.5 2.5 0 0 1-2.5 2.5H16v-6h3v-1a7 7 0 0 0-14 0v1h3v6H6.5A2.5 2.5 0 0 1 4 17.5V13z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
