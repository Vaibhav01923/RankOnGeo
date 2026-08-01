"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { createSupabaseBrowserClient } from "@/lib/supabase";

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

type Status = "checking" | "ready" | "expired";

function SetPasswordContent() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    // The recovery link's session gets established client-side from the URL
    // as soon as the Supabase browser client initializes — sometimes before
    // this listener attaches, sometimes after — so check both.
    let settled = false;
    const settle = (ready: boolean) => {
      if (settled) return;
      settled = true;
      setStatus(ready ? "ready" : "expired");
      // A live session here already proves this recovery link was opened
      // from the real inbox it was sent to — mark the account verified
      // right away rather than waiting on the separate custom verify-email
      // click-through, which this signup path never triggers in the first
      // place (see app/setup/page.tsx's throwaway-password signup).
      if (ready) fetch("/api/verify-email/mark-verified", { method: "POST" }).catch(() => {});
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) settle(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") settle(true);
    });

    const timeout = setTimeout(() => settle(false), 2500);
    return () => { sub.subscription.unsubscribe(); clearTimeout(timeout); };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }

    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setError(error.message); return; }
    router.replace("/dashboard?verified=1");
  }

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
            {status === "checking" && (
              <div className="flex flex-col items-center py-8 gap-3">
                <span className="w-6 h-6 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[var(--ink-soft)]">Verifying your link…</p>
              </div>
            )}

            {status === "expired" && (
              <>
                <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2 tracking-tight">Link expired</h1>
                <p className="text-sm text-[var(--ink-soft)] mb-6">
                  This link is invalid or has expired. Sign in to your dashboard and use &quot;Resend email&quot;
                  in the banner at the top to get a fresh one.
                </p>
                <a
                  href="/auth?mode=signin&redirect=/dashboard"
                  className="block w-full text-center bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] font-semibold py-3 rounded-full text-sm transition-colors"
                >
                  Go to sign in
                </a>
              </>
            )}

            {status === "ready" && (
              <>
                <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2 tracking-tight">Set your password</h1>
                <p className="text-sm text-[var(--ink-soft)] mb-8">
                  Choose a password so you can sign back in next time.
                </p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1.5 uppercase tracking-wide">New password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Min. 6 characters"
                      required
                      minLength={6}
                      className="w-full border border-[var(--line)] bg-[var(--cream)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] transition-shadow focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1.5 uppercase tracking-wide">Confirm password</label>
                    <input
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      placeholder="Retype your password"
                      required
                      minLength={6}
                      className="w-full border border-[var(--line)] bg-[var(--cream)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] transition-shadow focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-700 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] font-semibold py-3 rounded-full text-sm transition-colors"
                  >
                    {saving ? "Saving…" : "Set password →"}
                  </button>
                </form>
                <button
                  type="button"
                  onClick={() => router.replace("/dashboard")}
                  className="mt-4 w-full text-center text-xs font-medium text-[var(--ink-faint)] hover:text-[var(--ink-soft)]"
                >
                  Skip — I already have a password
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SetPasswordPage() {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} text-[var(--ink)]`}
      style={{ fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <Suspense><SetPasswordContent /></Suspense>
    </div>
  );
}
