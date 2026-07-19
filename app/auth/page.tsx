"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { AuthForm } from "../_components/AuthForm";

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

const workSans = Work_Sans({
  variable: "--font-work-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Must be a same-origin relative path, not "//evil.com" or an absolute
  // URL — the param comes straight from the query string (mirrors the same
  // guard in proxy.ts, which handles the already-signed-in case server-side).
  const redirectParam = searchParams.get("redirect");
  const redirect = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">(searchParams.get("mode") === "signin" ? "signin" : "signup");

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    // If already logged in, redirect
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(redirect);
    });
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-[var(--cream)]">
      <nav className="px-8 py-4 border-b border-[var(--line)]">
        <a href="/" className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="6" stroke="var(--rust)" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="12.5" stroke="var(--rust)" strokeWidth="1.8" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
            <circle cx="26.5" cy="9" r="2.5" fill="var(--olive)" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-[var(--ink)]">
            RankOn<span className="text-[var(--rust)]">Geo</span>
          </span>
        </a>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl bg-[var(--surface)] border border-[var(--line)] p-8 shadow-sm">
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2 tracking-tight">
              {mode === "signup" ? "Create your account" : "Welcome back"}
            </h1>
            <p className="text-sm text-[var(--ink-soft)] mb-8">
              {mode === "signup"
                ? "Start tracking your brand's AI visibility for free."
                : "Sign in to access your dashboard."}
            </p>

            <AuthForm mode={mode} onModeChange={setMode} onSignedIn={() => router.replace(redirect)} />
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-[var(--ink-faint)]">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.2l-3.8 2 .7-4.2-3.1-3 4.3-.6L8 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
            Free visibility score in ~60 seconds · No credit card
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} text-[var(--ink)]`}
      style={{ fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <Suspense><AuthContent /></Suspense>
    </div>
  );
}
