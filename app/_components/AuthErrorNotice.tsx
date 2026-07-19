"use client";

import { useEffect, useState } from "react";

// Supabase's own confirm/magic-link redirect lands the visitor back on
// whatever the Site URL is (not necessarily /dashboard or /auth) with the
// failure encoded as query params AND a matching #hash — read both. Until
// this existed, an expired link silently dropped the visitor on the
// homepage with no explanation at all.
const FRIENDLY_MESSAGES: Record<string, string> = {
  otp_expired: "That confirmation link has expired. Sign in below to get a fresh one.",
  access_denied: "That link is no longer valid. Sign in below to get a fresh one.",
};

export function AuthErrorNotice() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const errorCode = search.get("error_code") ?? hash.get("error_code");
    const description = search.get("error_description") ?? hash.get("error_description");
    const hasError = search.get("error") ?? hash.get("error");
    if (!hasError) return;

    // One-time read of a browser-navigation signal (the URL Supabase's own
    // redirect landed on), not derived from any React state/props — an
    // effect is the correct place for this, not a lazy useState initializer
    // (which would run during SSR/hydration and mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessage((errorCode && FRIENDLY_MESSAGES[errorCode]) || description || "That link is invalid or has expired.");

    // Strip the error params so a refresh or a shared/bookmarked copy of this
    // URL doesn't keep re-showing the same failed auth attempt.
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = "";
    window.history.replaceState({}, "", url.toString());
  }, []);

  if (!message) return null;

  return (
    <div className="fixed top-4 left-4 right-4 z-[100] mx-auto max-w-md rounded-xl border border-red-500/25 bg-[var(--surface)] shadow-lg sm:left-auto">
      <div className="flex items-start gap-3 px-4 py-3">
        <p className="flex-1 text-sm text-red-700">
          {message} <a href="/auth?mode=signin" className="font-medium underline underline-offset-2">Sign in →</a>
        </p>
        <button
          onClick={() => setMessage(null)}
          aria-label="Dismiss"
          className="shrink-0 text-red-700/60 hover:text-red-700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
