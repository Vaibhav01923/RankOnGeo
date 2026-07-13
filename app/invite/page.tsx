"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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

type InviteInfo = {
  ownerEmail: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expired: boolean;
  invitedEmail: string;
};

function InviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [infoError, setInfoError] = useState("");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");

  const supabase = createSupabaseBrowserClient();

  const missingToken = !token;

  useEffect(() => {
    if (!token) return;
    fetch(`/api/team/invite-info?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error ?? "Invite not found");
        setInfo(await res.json());
      })
      .catch((e) => setInfoError(e instanceof Error ? e.message : "Invite not found"));
  }, [token]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserEmail(user?.email ?? null);
      setCheckedAuth(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function accept() {
    setAccepting(true);
    setAcceptError("");
    const res = await fetch("/api/team/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      window.location.href = "/dashboard";
      return;
    }
    const body = await res.json().catch(() => ({}));
    setAcceptError(body.error ?? "Could not accept the invite — try again");
    setAccepting(false);
  }

  async function signOutAndSwitch() {
    await supabase.auth.signOut();
    window.location.href = `/auth?mode=signin&redirect=${encodeURIComponent(`/invite?token=${token}`)}`;
  }

  const authRedirect = encodeURIComponent(`/invite?token=${token}`);
  const dead = info && info.status !== "pending";

  return (
    <div className="min-h-screen flex flex-col bg-[var(--cream)]">
      <nav className="px-8 py-4 border-b border-[var(--line)]">
        <Link href="/" className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="6" stroke="var(--rust)" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="12.5" stroke="var(--rust)" strokeWidth="1.8" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
            <circle cx="26.5" cy="9" r="2.5" fill="var(--olive)" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-[var(--ink)]">
            RankOn<span className="text-[var(--rust)]">Geo</span>
          </span>
        </Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl bg-[var(--surface)] border border-[var(--line)] p-8 shadow-sm">
            {missingToken || infoError ? (
              <>
                <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2 tracking-tight">Invite not found</h1>
                <p className="text-sm text-[var(--ink-soft)]">{missingToken ? "This invite link is missing its token." : infoError}</p>
              </>
            ) : !info || !checkedAuth ? (
              <div className="flex items-center justify-center py-10">
                <span className="w-5 h-5 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : dead ? (
              <>
                <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2 tracking-tight">
                  {info.status === "accepted" ? "Already accepted" : info.status === "expired" ? "Invite expired" : "Invite revoked"}
                </h1>
                <p className="text-sm text-[var(--ink-soft)]">
                  {info.status === "accepted"
                    ? "This invite has already been used. If that was you, your shared workspace is in your dashboard."
                    : `Ask ${info.ownerEmail} to send you a fresh invite.`}
                </p>
                {info.status === "accepted" && (
                  <a
                    href="/dashboard"
                    className="mt-6 block w-full text-center bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] font-semibold py-3 rounded-full text-sm transition-colors"
                  >
                    Open dashboard →
                  </a>
                )}
              </>
            ) : (
              <>
                <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2 tracking-tight">Join a workspace</h1>
                <p className="text-sm text-[var(--ink-soft)] mb-8">
                  <strong className="text-[var(--ink)]">{info.ownerEmail}</strong> invited you
                  ({info.invitedEmail}) to their RankOnGeo workspace — shared brands, scans, articles, and analytics.
                </p>

                {acceptError && (
                  <div className="mb-4">
                    <p className="text-xs text-red-700 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{acceptError}</p>
                    <button onClick={signOutAndSwitch} className="mt-2 text-xs text-[var(--rust)] font-medium hover:underline">
                      Sign out and use the invited email →
                    </button>
                  </div>
                )}

                {userEmail ? (
                  <button
                    onClick={accept}
                    disabled={accepting}
                    className="w-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] font-semibold py-3 rounded-full text-sm transition-colors"
                  >
                    {accepting ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-[var(--surface)] border-t-transparent rounded-full animate-spin" />
                        Joining...
                      </span>
                    ) : (
                      `Accept invite as ${userEmail}`
                    )}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <a
                      href={`/auth?redirect=${authRedirect}`}
                      className="block w-full text-center bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] font-semibold py-3 rounded-full text-sm transition-colors"
                    >
                      Sign up to accept →
                    </a>
                    <a
                      href={`/auth?mode=signin&redirect=${authRedirect}`}
                      className="block w-full text-center border border-[var(--line)] hover:border-[var(--rust)] text-[var(--ink)] font-semibold py-3 rounded-full text-sm transition-colors"
                    >
                      I already have an account
                    </a>
                    <p className="text-xs text-[var(--ink-faint)] text-center">
                      Use the email the invite was sent to: {info.invitedEmail}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  const signalVars = {
    "--cream": "oklch(0.965 0.013 80)",
    "--surface": "oklch(0.99 0.006 80)",
    "--ink": "oklch(0.19 0.014 55)",
    "--ink-soft": "oklch(0.46 0.02 55)",
    "--ink-faint": "oklch(0.62 0.02 60)",
    "--rust": "oklch(0.56 0.15 38)",
    "--rust-deep": "oklch(0.46 0.14 36)",
    "--rust-wash": "oklch(0.56 0.15 38 / 12%)",
    "--olive": "oklch(0.52 0.1 130)",
    "--olive-wash": "oklch(0.52 0.1 130 / 12%)",
    "--line": "oklch(0.19 0.014 55 / 10%)",
    "--line-soft": "oklch(0.19 0.014 55 / 6%)",
  } as React.CSSProperties;

  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} text-[var(--ink)]`}
      style={{ ...signalVars, fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <Suspense><InviteContent /></Suspense>
    </div>
  );
}
