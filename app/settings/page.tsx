"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter } from "next/navigation";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { PricingCards, PRICING } from "@/app/_components/PricingCards";
import { ThemeToggle } from "@/app/_components/ThemeToggle";
import { BRAND_LIMITS, FREE_BRAND_LIMIT } from "@/lib/plan-limits";

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

// Same marketing names shown on the pricing cards the user actually picked
// from, rather than raw plan keys like "starter" — single source of truth.
const PLAN_NAME: Record<string, string> = Object.fromEntries(PRICING.map((p) => [p.planKey, p.name]));

type SubscriptionInfo = {
  plan: string | null;
  isFree: boolean;
  isLapsed: boolean;
  graceDaysLeft: number | null;
  hasBillingAccount: boolean;
  status: string | null;
  nextBillingDate: string | null;
  cancelAtNextBillingDate: boolean;
};

function SettingsContent() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [brandCount, setBrandCount] = useState(0);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [userEmail, setUserEmail] = useState("");
  // Dodo's hosted customer portal only covers payment method, invoices, and
  // cancellation — not plan or billing-frequency changes (there's no such
  // toggle in customers.customerPortal.create, and change-plan is a separate
  // server-side API). So the pricing cards are the only way to actually
  // switch plans; keep them reachable but not dumped on the page by default
  // for someone who's already paying.
  const [showPlans, setShowPlans] = useState(false);

  useEffect(() => {
    createSupabaseBrowserClient().auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/auth?redirect=/settings"); return; }
      setUserEmail(user.email ?? "");
    });
    Promise.all([
      fetch("/api/dodo/subscription").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
    ])
      .then(([subData, brandsData]) => {
        setSub(subData);
        setBrandCount(
          ((brandsData.brands ?? []) as { role?: string }[]).filter((b) => b.role !== "member").length
        );
      })
      .finally(() => setLoading(false));
  }, []);

  async function openBillingPortal() {
    setPortalLoading(true);
    setPortalError("");
    try {
      const res = await fetch("/api/dodo/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { setPortalError(data.error ?? "Couldn't open billing portal"); return; }
      window.location.href = data.url;
    } catch {
      setPortalError("Couldn't open billing portal");
    } finally {
      setPortalLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--cream)] flex items-center justify-center">
        <span className="w-7 h-7 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // user_plans.plan defaults to "starter" at the DB level for every row,
  // whether or not a real subscription ever existed — it's only meaningful
  // once isFree is false. Showing it unconditionally mislabeled every
  // never-subscribed (or trial-that-never-activated) account as "Pro".
  const planKey = sub?.isFree ? null : sub?.plan;
  const planLabel = planKey ? PLAN_NAME[planKey] ?? planKey : "Free";
  const brandLimit = planKey ? BRAND_LIMITS[planKey] ?? FREE_BRAND_LIMIT : FREE_BRAND_LIMIT;

  return (
    <div className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <header className="bg-[var(--surface)] border-b border-[var(--line)] px-6 py-4 flex items-center justify-between">
        <a href="/dashboard" className="font-bold text-xl tracking-tight">
          RankOn<span className="text-[var(--rust)]">Geo</span>
        </a>
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <a href="/dashboard" className="text-sm text-[var(--ink-soft)] hover:text-[var(--ink)] transition-colors">
            ← Back to dashboard
          </a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12 space-y-8">
        <div>
          <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-1">Settings</h1>
          <p className="text-sm text-[var(--ink-soft)]">{userEmail}</p>
        </div>

        <div className="rounded-3xl bg-[var(--surface)] border border-[var(--line)] p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--ink-faint)] mb-1">Current plan</p>
              <p className="font-signal-serif text-2xl text-[var(--ink)]">{planLabel}</p>
            </div>
            <span
              className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ${
                sub?.isLapsed
                  ? "bg-red-500/10 text-red-700"
                  : sub?.graceDaysLeft !== null && sub?.graceDaysLeft !== undefined
                  ? "bg-[var(--rust-wash)] text-[var(--rust-deep)]"
                  : sub?.isFree
                  ? "bg-[var(--line-soft)] text-[var(--ink-soft)]"
                  : "bg-[var(--olive-wash)] text-[var(--olive)]"
              }`}
            >
              {sub?.isLapsed
                ? "Locked — reactivate to restore access"
                : sub?.graceDaysLeft !== null && sub?.graceDaysLeft !== undefined
                ? "Payment failed"
                : sub?.isFree
                ? "Free"
                : sub?.cancelAtNextBillingDate
                ? "Cancels at period end"
                : "Active"}
            </span>
          </div>

          {sub?.graceDaysLeft !== null && sub?.graceDaysLeft !== undefined && (
            <p className="text-sm text-[var(--rust-deep)] bg-[var(--rust-wash)] border border-[var(--rust)]/25 rounded-lg px-3 py-2 mb-4">
              Your last payment failed. Update your payment method within {sub.graceDaysLeft} day{sub.graceDaysLeft === 1 ? "" : "s"} to avoid losing access.
            </p>
          )}

          {!sub?.isFree && sub?.nextBillingDate && (
            <p className="text-sm text-[var(--ink-soft)] mb-4">
              {sub.cancelAtNextBillingDate ? "Access ends" : "Renews"} on{" "}
              {new Date(sub.nextBillingDate).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
            </p>
          )}

          <p className="text-sm text-[var(--ink-soft)] mb-4">
            {brandCount} of {brandLimit} website{brandLimit === 1 ? "" : "s"} tracked
          </p>

          {portalError && (
            <p className="text-xs text-red-700 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2 mb-4">
              {portalError}
            </p>
          )}

          {sub?.hasBillingAccount ? (
            <div className="flex gap-3">
              <button
                onClick={openBillingPortal}
                disabled={portalLoading}
                className="flex-1 bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] font-semibold py-3 rounded-full text-sm transition-colors"
              >
                {portalLoading ? "Opening billing portal..." : "Manage billing →"}
              </button>
              {!sub?.isFree && (
                <button
                  type="button"
                  onClick={() => setShowPlans((v) => !v)}
                  className="px-5 py-3 border border-[var(--line)] text-[var(--ink-soft)] rounded-full text-sm font-medium hover:bg-[var(--line-soft)] transition-colors"
                >
                  {showPlans ? "Hide plans" : "Change plan"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-soft)]">Pick a plan below to unlock more websites, prompts, and engines.</p>
          )}
        </div>

        {(sub?.isFree || showPlans) && (
          <div>
            <h2 className="font-signal-serif text-xl text-[var(--ink)] mb-4">{sub?.isFree ? "Choose a plan" : "Change plan"}</h2>
            <PricingCards compact />
          </div>
        )}
      </main>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable}`}
      style={{ fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <Suspense><SettingsContent /></Suspense>
    </div>
  );
}
