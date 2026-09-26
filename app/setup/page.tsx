"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { BrandData, TrackedPrompt } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import { PLAN_PROMPT_LIMITS, FREE_PROMPT_LIMIT } from "@/lib/plan-limits";
import { PRICING } from "@/lib/pricing";
import { stashPendingBrandEdits } from "@/lib/pending-brand";

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

type Step = "url" | "brand" | "prompts" | "reddit" | "trial";
const STEP_NUMBERS: Record<Step, number> = { url: 1, brand: 2, prompts: 3, reddit: 4, trial: 5 };

const STEPS: { key: Step; label: string }[] = [
  { key: "url", label: "Your website" },
  { key: "brand", label: "Brand info" },
  { key: "prompts", label: "Tracked prompts" },
  { key: "reddit", label: "Reddit opportunities" },
  { key: "trial", label: "Start free trial" },
];

type RedditOpportunityThread = {
  keyword: string;
  redditId: string;
  subreddit: string;
  title: string;
  url: string;
  body: string;
  score: number;
  numComments: number;
  createdAt: string | null;
  subredditSubscribers: number | null;
  estimatedViews: number;
};

type SuggestedRedditPost = {
  subreddit: string;
  subscribers: number | null;
  title: string;
  estimatedViewsLow: number;
  estimatedViewsHigh: number;
};

function formatCompactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

// Anonymous visitors going through the trial funnel aren't capped at a
// specific plan's limit while selecting prompts in step 3 — instead, step 4
// auto-recommends whichever plan actually covers how many they picked, so
// there's never a "you built 18, only 10 will be tracked" bait-and-switch.
// This is the platform-wide ceiling on how many they can select at all.
const ANONYMOUS_TRIAL_BROWSE_CAP = Math.max(...Object.values(PLAN_PROMPT_LIMITS));

function recommendedPlanFor(_promptCount: number): string {
  return "starter";
}

const SOURCE_OPTIONS = ["Twitter / X", "Google search", "Referral", "LinkedIn", "Product Hunt", "Blog / Article", "Reddit", "Email", "Other"];

// Cycled behind the Reddit opportunities intro card so the wait (the search
// runs in the background regardless of whether the intro's been dismissed)
// reads as real progress instead of a static message.
const REDDIT_SCAN_MESSAGES = [
  "Scanning Reddit for live conversations…",
  "Finding people actively asking for alternatives…",
  "Filtering for genuine high-intent buying signals…",
  "Ranking threads by real reach and relevance…",
];

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("url");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 fields
  const [domain, setDomain] = useState(searchParams.get("domain") ?? "");

  // Funnel-reach tracking for /admin/stats — one event per step a visitor
  // actually reaches. Deduped per page load (stepsLoggedRef) so clicking
  // Back and forward again doesn't double-count; fire-and-forget, never
  // blocks the wizard.
  const stepsLoggedRef = useRef<Set<Step>>(new Set());
  function trackStep(s: Step) {
    if (stepsLoggedRef.current.has(s)) return;
    stepsLoggedRef.current.add(s);
    fetch("/api/track/step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: STEP_NUMBERS[s], stepName: s, domain: domain.trim() }),
    }).catch(() => {});
  }
  useEffect(() => {
    trackStep("url");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Optional "how did you hear about us" — pops up once analysis starts and
  // stays up (a closable corner card, not tied to the loading spinner) across
  // every later step until answered or dismissed, so people who don't get to
  // it during the ~10-20s wait can still answer afterward. Tracked in
  // funnel_events (event_type: acquisition_source) for the admin stats page.
  // Never blocks the actual analysis or wizard flow.
  const [sourcePopupVisible, setSourcePopupVisible] = useState(false);
  const [sourceAnswer, setSourceAnswer] = useState<string | null>(null);
  const [hideSourceAsk, setHideSourceAsk] = useState(false);
  const [showSourceOther, setShowSourceOther] = useState(false);
  const [sourceOtherInput, setSourceOtherInput] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem("acquisitionSourceAnswered")) setHideSourceAsk(true);
    } catch {}
  }, []);

  useEffect(() => {
    if (loading) setSourcePopupVisible(true);
  }, [loading]);

  function dismissSourceAsk() {
    setHideSourceAsk(true);
    try { localStorage.setItem("acquisitionSourceAnswered", "1"); } catch {}
  }

  function submitAcquisitionSource(source: string) {
    setSourceAnswer(source);
    try { localStorage.setItem("acquisitionSourceAnswered", "1"); } catch {}
    fetch("/api/track/source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain: domain.trim(), source }),
    }).catch(() => {});
    // Brief "Thanks!" state, then fold the popup away on its own.
    setTimeout(() => setHideSourceAsk(true), 1600);
  }

  useEffect(() => {
    createSupabaseBrowserClient()
      .from("user_plans")
      .select("plan, dodo_subscription_id")
      .single()
      .then(({ data }) => { if (data?.dodo_subscription_id) setUserPlan(data.plan); });
  }, []);

  // Distinguishes "signed in but never subscribed" (still capped at the free
  // limit — they skip step 4 entirely via handleStart's signed-in branch, so
  // there's no step 4 to auto-pick a plan big enough for whatever they
  // selected) from "anonymous visitor going through the trial funnel" (gets
  // the generous browse cap below).
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    createSupabaseBrowserClient().auth.getUser().then(({ data: { user } }) => setHasSession(!!user));
  }, []);

  useEffect(() => {
    const d = searchParams.get("domain");
    const c = searchParams.get("competitors");
    if (d) {
      setDomain(d);
      if (c) setCompetitors(c.split(",").map((s) => s.trim()).filter(Boolean));
      // Auto-trigger analysis when arriving with a domain already in hand
      // (e.g. from the landing page's hero input)
      triggerAnalyze(d, c ? c.split(",").map((s) => s.trim()).filter(Boolean) : []);
    }
  }, []);
  const [competitors, setCompetitors] = useState<string[]>([]);

  // Step 2 & 3 data
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedNiche, setEditedNiche] = useState("");
  const [editedCompetitors, setEditedCompetitors] = useState<string[]>([]);
  const [editedAudience, setEditedAudience] = useState<string[]>([]);
  const [newCompetitorInput, setNewCompetitorInput] = useState("");
  const [suggestedCompetitors, setSuggestedCompetitors] = useState<string[]>([]);
  const [newAudienceInput, setNewAudienceInput] = useState("");
  const [prompts, setPrompts] = useState<TrackedPrompt[]>([]);
  const [deselectedIds, setDeselectedIds] = useState<Set<string>>(new Set());
  const [newPrompt, setNewPrompt] = useState("");
  const [promptError, setPromptError] = useState("");
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const addPromptRef = useRef<HTMLDivElement>(null);

  // Step 4: Reddit opportunities (live threads + suggested posts)
  const [redditLoading, setRedditLoading] = useState(false);
  const [redditError, setRedditError] = useState("");
  const [redditThreads, setRedditThreads] = useState<RedditOpportunityThread[]>([]);
  const [redditSuggestedPosts, setRedditSuggestedPosts] = useState<SuggestedRedditPost[]>([]);
  const [redditTotalFound, setRedditTotalFound] = useState(0);
  const [redditFetchedForBrandId, setRedditFetchedForBrandId] = useState<string | null>(null);
  // The search runs as soon as the step is reached regardless of this — it
  // only gates whether the intro card or the actual results are on screen,
  // so nothing is wasted if they click through before the fetch finishes.
  const [redditIntroAcknowledged, setRedditIntroAcknowledged] = useState(false);
  const [redditScanMessageIndex, setRedditScanMessageIndex] = useState(0);

  async function fetchRedditOpportunities(brandId: string) {
    setRedditLoading(true);
    setRedditError("");
    try {
      const res = await fetch("/api/setup/reddit-opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setRedditThreads(data.threads ?? []);
      setRedditSuggestedPosts(data.suggestedPosts ?? []);
      setRedditTotalFound(data.totalFound ?? 0);
      setRedditFetchedForBrandId(brandId);
    } catch (err) {
      setRedditError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setRedditLoading(false);
    }
  }

  useEffect(() => {
    if (step === "reddit" && brand?.id && redditFetchedForBrandId !== brand.id) {
      fetchRedditOpportunities(brand.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, brand?.id]);

  // Cycles the status line under the intro card's button while the search
  // is still running in the background — stops once they've moved past the
  // intro (the real loading spinner takes over from there).
  useEffect(() => {
    if (step !== "reddit" || redditIntroAcknowledged) return;
    const interval = setInterval(() => {
      setRedditScanMessageIndex((i) => (i + 1) % REDDIT_SCAN_MESSAGES.length);
    }, 1800);
    return () => clearInterval(interval);
  }, [step, redditIntroAcknowledged]);

  // Step 5: trial signup
  const [trialEmail, setTrialEmail] = useState("");
  const [trialPlan, setTrialPlan] = useState(PRICING[0].planKey);
  const [trialPlanTouched, setTrialPlanTouched] = useState(false);
  const [trialSubmitting, setTrialSubmitting] = useState(false);
  const [trialError, setTrialError] = useState("");

  // Auto-recommend whichever plan actually covers how many prompts they
  // selected — 11 selected quietly recommends Business instead of either
  // capping them at 10 or (worse) letting them build a list Pro can't
  // track. Only while they haven't manually picked a plan themselves;
  // once they click a card directly, their choice sticks.
  useEffect(() => {
    if (trialPlanTouched) return;
    const selectedCount = prompts.filter((p) => !deselectedIds.has(p.id)).length;
    setTrialPlan(recommendedPlanFor(selectedCount));
  }, [prompts, deselectedIds, trialPlanTouched]);

  // Draw attention to the "add your own" slot as soon as the generated
  // prompts are on screen, instead of leaving it below the fold where people
  // never scroll down far enough to notice it's there.
  useEffect(() => {
    if (step !== "prompts") return;
    const t = setTimeout(() => addPromptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
    return () => clearTimeout(t);
  }, [step]);

  async function triggerAnalyze(d: string, comps: string[]) {
    if (!d.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d.trim(), competitors: comps }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setBrand(data);
      setEditedName(data.name);
      setEditedNiche(data.niche);
      const autoDetected: string[] = data.competitors ?? [];
      setSuggestedCompetitors(autoDetected);
      setEditedCompetitors(Array.from(new Set([...comps, ...autoDetected])));
      setEditedAudience(data.targetAudience ?? []);
      setDeselectedIds(new Set());
      setPrompts(data.trackedPrompts);
      trackStep("brand");
      setStep("brand");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    await triggerAnalyze(domain, competitors);
  }

  function addEditedCompetitor() {
    const t = newCompetitorInput.trim();
    if (t && !editedCompetitors.includes(t)) setEditedCompetitors([...editedCompetitors, t]);
    setNewCompetitorInput("");
  }

  function addAudience() {
    const t = newAudienceInput.trim();
    if (t && !editedAudience.includes(t)) setEditedAudience([...editedAudience, t]);
    setNewAudienceInput("");
  }

  function handleBrandNext() {
    if (!brand) return;
    setBrand({ ...brand, name: editedName, niche: editedNiche, competitors: editedCompetitors, targetAudience: editedAudience });
    trackStep("prompts");
    setStep("prompts");
  }

  function togglePrompt(id: string) {
    setDeselectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function deselectAllPrompts() {
    setDeselectedIds(new Set(prompts.map((p) => p.id)));
  }

  function selectAllPrompts() {
    setDeselectedIds(new Set());
  }

  // Gate on the plan's total cap vs. what's currently selected — not a fixed
  // "custom slots" number — so deselecting an AI-generated prompt always
  // opens room to write a replacement. Anonymous visitors (the trial funnel)
  // get the generous platform-wide ceiling since step 4 auto-recommends
  // whichever plan actually fits their selection. Signed-in-but-unpaid users
  // stay capped at the free/Pro limit — they skip step 4 entirely via
  // handleStart's signed-in branch, so there's no later step to pick a
  // bigger plan for them.
  function currentPromptCap(): number {
    if (userPlan) return PLAN_PROMPT_LIMITS[userPlan] ?? FREE_PROMPT_LIMIT;
    return hasSession ? FREE_PROMPT_LIMIT : ANONYMOUS_TRIAL_BROWSE_CAP;
  }

  function addPrompt() {
    const trimmed = newPrompt.trim();
    if (!trimmed) return;
    setPromptError("");
    const normalized = trimmed.toLowerCase();
    if (prompts.some((p) => p.text.trim().toLowerCase() === normalized)) {
      setPromptError("You're already tracking this exact prompt.");
      return;
    }
    const selectedCount = prompts.filter((p) => !deselectedIds.has(p.id)).length;
    if (selectedCount >= currentPromptCap()) return;
    setPrompts([...prompts, { id: `custom-${Date.now()}`, text: trimmed, category: "custom" }]);
    setNewPrompt("");
  }

  function currentEdits() {
    return {
      name: editedName || brand?.name || "",
      niche: editedNiche || brand?.niche || "",
      competitors: editedCompetitors,
      targetAudience: editedAudience,
      prompts: prompts.filter((p) => !deselectedIds.has(p.id)).map((p) => ({ id: p.id, text: p.text, category: p.category })),
    };
  }

  // Prompts step's "Continue" — just advances to the Reddit opportunities
  // step now; the actual save-and-redirect (or move to trial signup) happens
  // once they're done there, in finishSetup.
  function handleContinueFromPrompts() {
    trackStep("reddit");
    setStep("reddit");
  }

  async function finishSetup() {
    if (!brand?.id) return;
    const { data: { user } } = await createSupabaseBrowserClient().auth.getUser();

    if (user) {
      setSaving(true);
      await fetch("/api/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: brand.id, ...currentEdits() }),
      });
      setSaving(false);
      router.push(`/dashboard?brandId=${brand.id}`);
      return;
    }

    // No account yet — move on to the trial signup step instead of an
    // inline gate. The anonymous brand row stays put (RLS blocks writing to
    // it directly); its edits get stashed right before the trial checkout
    // redirect in handleClaimTrial.
    trackStep("trial");
    setStep("trial");
  }

  async function handleClaimTrial(e: React.FormEvent) {
    e.preventDefault();
    if (!brand?.id || trialSubmitting) return;
    setTrialError("");
    setTrialSubmitting(true);

    const supabase = createSupabaseBrowserClient();
    // Thrown away immediately after use — never stored, never sent to our
    // own backend. Signup works without the user typing a password because
    // this Supabase project has email confirmation disabled, so signUp()
    // returns a live session right away; they set a real password later via
    // the emailed recovery link (see /api/setup/send-password-link).
    const randomPassword = `${crypto.randomUUID()}${crypto.randomUUID()}`;
    const { data, error } = await supabase.auth.signUp({ email: trialEmail.trim(), password: randomPassword });

    // Same dual-signal "already registered" detection as AuthForm — but
    // unlike AuthForm we can't retry with the password the user typed
    // (there isn't one), so just point them at sign-in.
    const alreadyRegistered =
      error?.message === "User already registered" ||
      (data?.user && data.user.identities && data.user.identities.length === 0);

    if (alreadyRegistered) {
      setTrialSubmitting(false);
      setTrialError("You already have a RankOnGeo account with this email — sign in to continue.");
      return;
    }
    if (error || !data.session || !data.user) {
      setTrialSubmitting(false);
      setTrialError(error?.message ?? "Something went wrong. Please try again.");
      return;
    }

    // Safety net, not the common path: step 4 auto-recommends a plan that
    // covers the full selection, but if they manually override to a smaller
    // one, trim quietly to what it actually allows rather than saving more
    // prompts than the plan (and billing) supports.
    const edits = currentEdits();
    const planCap = PLAN_PROMPT_LIMITS[trialPlan] ?? FREE_PROMPT_LIMIT;
    stashPendingBrandEdits({ ...edits, prompts: edits.prompts.slice(0, planCap) });
    fetch("/api/setup/send-password-link", { method: "POST" }).catch(() => {});

    const res = await fetch("/api/dodo/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: trialPlan, trialDays: 1, cancelPath: "/setup" }),
    });
    const checkoutData = await res.json();
    if (!res.ok || !checkoutData.url) {
      setTrialSubmitting(false);
      setTrialError(checkoutData.error ?? "Couldn't start checkout. Please try again.");
      return;
    }
    window.location.href = checkoutData.url;
  }

  return (
    <div className="min-h-screen bg-[var(--cream)] text-[var(--ink)]">
      <header className="bg-[var(--surface)] border-b border-[var(--line)] px-6 py-4">
        <a href="/" className="font-bold text-xl tracking-tight">
          RankOn<span className="text-[var(--rust)]">Geo</span>
        </a>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Steps indicator — only steps reached so far are shown, each one
            animating in as the user arrives at it, instead of spoiling the
            full length of the wizard up front. */}
        <div className="flex items-center gap-2 mb-10">
          {(() => {
            const currentIndex = STEPS.findIndex((s) => s.key === step);
            const visibleSteps = STEPS.slice(0, currentIndex + 1);
            return visibleSteps.map((s, i) => (
              <div
                key={s.key}
                className="flex items-center gap-2"
                style={i === currentIndex ? { animation: "fadeSlideIn 0.35s ease forwards" } : undefined}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-signal-mono font-medium transition-colors ${
                  i === currentIndex ? "bg-[var(--rust)] text-[var(--surface)]" : "bg-[var(--olive-wash)] text-[var(--olive)]"
                }`}>
                  {i + 1}
                </div>
                <span className={`text-sm ${i === currentIndex ? "text-[var(--ink)] font-medium" : "text-[var(--ink-faint)]"}`}>
                  {s.label}
                </span>
                {i < visibleSteps.length - 1 && <span className="text-[var(--line)] ml-1">—</span>}
              </div>
            ));
          })()}
        </div>

        {/* Step 1: URL */}
        {step === "url" && (
          <div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Enter your website</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-8">
              We&apos;ll crawl it to understand your brand and generate the right tracking prompts —
              RankOnGeo doesn&apos;t just score your AI visibility, it closes the gap and gets you mentioned.
            </p>
            {loading && (
              <div className="flex flex-col items-center py-16 gap-4">
                <span className="w-8 h-8 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[var(--ink-soft)]">Analyzing your site…</p>
                <p className="text-xs text-[var(--ink-faint)] max-w-xs text-center">
                  In a moment you&apos;ll see where ChatGPT, Claude, Gemini, Perplexity and Google AI mention you today —
                  then the research and content that get them to mention you more.
                </p>
              </div>
            )}
            {!loading && <form onSubmit={handleAnalyze} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[var(--ink)]/80 mb-1.5">Website URL</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="yoursite.com"
                  className="w-full border border-[var(--line)] bg-[var(--surface)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                />
              </div>
              {error && <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3">{error}</p>}
              <button
                type="submit"
                disabled={loading || !domain.trim()}
                className="w-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
              >
                Analyze site
              </button>
            </form>}
          </div>
        )}

        {/* Step 2: Brand info */}
        {step === "brand" && brand && (
          <div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Review your brand info</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-8">We extracted this from your site. Edit anything that looks off.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[var(--ink)]/80 mb-1.5">Brand name</label>
                <input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full border border-[var(--line)] bg-[var(--surface)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink)]/80 mb-1.5">Niche</label>
                <input
                  value={editedNiche}
                  onChange={(e) => setEditedNiche(e.target.value)}
                  className="w-full border border-[var(--line)] bg-[var(--surface)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink)]/80 mb-1.5">Description</label>
                <p className="text-sm text-[var(--ink-soft)] bg-[var(--line-soft)] rounded-lg px-4 py-3 border border-[var(--line)]">{brand.description}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink)]/80 mb-1.5">Target audience</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {editedAudience.map((a) => (
                    <span key={a} className="flex items-center gap-1 text-xs bg-[var(--rust-wash)] text-[var(--rust-deep)] px-2.5 py-1 rounded-full">
                      {a}
                      <button onClick={() => setEditedAudience(editedAudience.filter((x) => x !== a))} className="text-[var(--rust-deep)]/60 hover:text-[var(--rust-deep)]">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={newAudienceInput}
                    onChange={(e) => setNewAudienceInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addAudience(); } }}
                    placeholder="Add audience segment"
                    className="flex-1 border border-[var(--line)] bg-[var(--surface)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                  />
                  <button type="button" onClick={addAudience} className="px-3 py-2 text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] rounded-lg hover:bg-[var(--rust-deep)] transition-colors">Add</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--ink)]/80 mb-1.5">Competitors</label>
                <div className="flex gap-2 mb-3">
                  <input
                    value={newCompetitorInput}
                    onChange={(e) => setNewCompetitorInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEditedCompetitor(); } }}
                    placeholder="Add competitor domain"
                    className="flex-1 border border-[var(--line)] bg-[var(--surface)] rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                  />
                  <button type="button" onClick={addEditedCompetitor} className="px-3 py-2 text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] rounded-lg hover:bg-[var(--rust-deep)] transition-colors">Add</button>
                </div>
                {(() => {
                  const allCompetitorOptions = Array.from(new Set([...suggestedCompetitors, ...editedCompetitors]));
                  if (allCompetitorOptions.length === 0) return null;
                  return (
                    <div>
                      <p className="text-xs font-medium text-[var(--ink-soft)] mb-2">Detected automatically — click to remove any you don&apos;t want tracked</p>
                      <div className="flex flex-wrap gap-2">
                        {allCompetitorOptions.map((c) => {
                          const added = editedCompetitors.includes(c);
                          const domain = c.includes(".") ? c : `${c}.com`;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() =>
                                added
                                  ? setEditedCompetitors(editedCompetitors.filter((x) => x !== c))
                                  : setEditedCompetitors([...editedCompetitors, c])
                              }
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                                added
                                  ? "bg-[var(--rust-wash)] border-[var(--rust)]/30 text-[var(--rust-deep)]"
                                  : "bg-[var(--surface)] border-[var(--line)] text-[var(--ink-soft)] hover:bg-[var(--line-soft)]"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`https://www.google.com/s2/favicons?domain=${domain}&sz=16`}
                                alt=""
                                className="w-3.5 h-3.5 rounded-sm"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                              />
                              {c}
                              <span className={`ml-0.5 ${added ? "text-[var(--olive)]" : "text-[var(--ink-faint)]"}`}>{added ? "✓" : "+"}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("url")}
                  className="px-5 py-3 border border-[var(--line)] text-[var(--ink-soft)] rounded-lg text-sm font-medium hover:bg-[var(--line-soft)] transition-colors"
                >
                  ← Back
                </button>
                <button
                  onClick={handleBrandNext}
                  className="flex-1 bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
                >
                  Continue to prompts
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Tracked prompts */}
        {step === "prompts" && (
          <div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Review search queries</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-2">
              These are questions people ask AI about businesses like yours. We&apos;ll track your brand&apos;s visibility for each —
              go through the list below and deselect anything that doesn&apos;t fit before you continue. If you&apos;re not showing up
              in a response, RankOnGeo helps you get mentioned and change what AI says about you.
            </p>
            {(() => {
              const selectedCount = prompts.filter((p) => !deselectedIds.has(p.id)).length;
              const allSelected = selectedCount === prompts.length;
              return (
                <div className="flex items-center justify-between mb-7">
                  <p className="text-sm font-semibold text-[var(--olive)]">
                    {selectedCount}/{prompts.length} prompts selected
                  </p>
                  <button
                    type="button"
                    onClick={allSelected ? deselectAllPrompts : selectAllPrompts}
                    className="text-xs font-medium text-[var(--rust)] hover:text-[var(--rust-deep)]"
                  >
                    {allSelected ? "Deselect all — I'll write my own" : "Select all"}
                  </button>
                </div>
              );
            })()}

            <div className="space-y-2 mb-5">
              {prompts.map((p) => {
                const selected = !deselectedIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePrompt(p.id)}
                    className={`w-full flex items-center gap-3 bg-[var(--surface)] border rounded-lg px-4 py-3 text-left transition-colors group ${
                      selected ? "border-[var(--line)] hover:border-[var(--rust)]/30" : "border-[var(--line)] opacity-50 hover:opacity-70"
                    }`}
                  >
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                      selected ? "bg-[var(--rust)] border-[var(--rust)]" : "border-[var(--line)] bg-[var(--surface)]"
                    }`}>
                      {selected && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" aria-hidden="true">
                          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className={`flex-1 text-sm ${selected ? "text-[var(--ink)]/80" : "text-[var(--ink-faint)]"}`}>{p.text}</span>
                  </button>
                );
              })}
            </div>

            {(() => {
              const totalCap = currentPromptCap();
              const selectedCount = prompts.filter((p) => !deselectedIds.has(p.id)).length;
              const remaining = totalCap - selectedCount;
              return (
                <div ref={addPromptRef} className="mb-6">
                  <p className="text-sm font-medium text-[var(--ink)] mb-2">
                    Add your own (optional) —{" "}
                    {remaining > 0 ? `${remaining} more slot${remaining === 1 ? "" : "s"} available` : "limit reached"}
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={newPrompt}
                      onChange={(e) => { setNewPrompt(e.target.value); setPromptError(""); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPrompt(); } }}
                      placeholder="Add custom prompt…"
                      disabled={remaining <= 0}
                      className="flex-1 border border-[var(--line)] bg-[var(--surface)] rounded-lg px-4 py-2.5 text-sm outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent disabled:opacity-50"
                    />
                    <button
                      onClick={addPrompt}
                      disabled={remaining <= 0}
                      className="px-4 py-2.5 text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] rounded-lg hover:bg-[var(--rust-deep)] disabled:opacity-50 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {promptError && (
                    <p className="text-xs text-[var(--rust-deep)] font-medium mt-2">{promptError}</p>
                  )}
                  {!promptError && remaining <= 0 && (
                    <p className="text-xs text-[var(--rust-deep)] font-medium mt-2">
                      Limit reached — deselect a prompt above to write your own, or <a href="/pricing" className="underline">upgrade for more</a>
                    </p>
                  )}
                </div>
              );
            })()}

            <div className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-4 py-3 mb-6">
              <p className="text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Prompt Tips</p>
              <ul className="space-y-1 text-xs text-[var(--ink-faint)]">
                <li>· Focus on questions your customers actually ask</li>
                <li>· Include your product category or service type</li>
                <li>· Avoid overly specific or branded terms</li>
              </ul>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("brand")}
                disabled={saving}
                className="px-5 py-3 border border-[var(--line)] text-[var(--ink-soft)] rounded-lg text-sm font-medium hover:bg-[var(--line-soft)] disabled:opacity-50 transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={handleContinueFromPrompts}
                disabled={prompts.filter((p) => !deselectedIds.has(p.id)).length === 0}
                className="flex-1 bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Reddit opportunities */}
        {step === "reddit" && brand && (
          <div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Where you can get mentioned right now</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-8">
              We searched Reddit for live threads where people in your space are comparing options, asking for
              alternatives, or looking for recommendations — a well-placed comment in one of these gets seen.
            </p>

            {!redditIntroAcknowledged && (
              <div>
                <div className="flex items-center justify-center mb-5">
                  <div className="relative w-16 h-16 rounded-full bg-[var(--rust-wash)] flex items-center justify-center">
                    <span className="absolute inset-0 rounded-full bg-[var(--rust)]/20 animate-ping" />
                    <svg className="relative w-7 h-7 text-[var(--rust)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                </div>

                <h2 className="text-center text-xl font-bold text-[var(--ink)] mb-2">These aren&apos;t random threads</h2>
                <p className="text-center text-sm text-[var(--ink-soft)] max-w-md mx-auto mb-6">
                  Every thread we&apos;re about to show you is from someone actively comparing options, asking for
                  alternatives, or looking for a recommendation in your exact category — not casual browsers, but
                  high-intent buyers already looking for something like {brand.name}. Your ideal customers.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7">
                  <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg px-4 py-4 text-center">
                    <p className="text-lg mb-1">🎯</p>
                    <p className="text-xs font-semibold text-[var(--ink)] mb-1">High intent</p>
                    <p className="text-[11px] text-[var(--ink-faint)]">Actively searching, not casually scrolling</p>
                  </div>
                  <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg px-4 py-4 text-center">
                    <p className="text-lg mb-1">🧑‍💼</p>
                    <p className="text-xs font-semibold text-[var(--ink)] mb-1">Your ideal customer</p>
                    <p className="text-[11px] text-[var(--ink-faint)]">Matches exactly who you&apos;re trying to reach</p>
                  </div>
                  <div className="bg-[var(--surface)] border border-[var(--line)] rounded-lg px-4 py-4 text-center">
                    <p className="text-lg mb-1">📈</p>
                    <p className="text-xs font-semibold text-[var(--ink)] mb-1">Built to convert</p>
                    <p className="text-[11px] text-[var(--ink-faint)]">People this close to deciding convert best</p>
                  </div>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setRedditIntroAcknowledged(true)}
                    className="px-8 py-3 bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] rounded-lg text-sm font-semibold transition-colors"
                  >
                    Show me the threads →
                  </button>
                  <p className="text-xs text-[var(--ink-faint)] flex items-center gap-1.5 min-h-[1rem]">
                    {redditLoading ? (
                      <>
                        <span className="w-3 h-3 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin shrink-0" />
                        {REDDIT_SCAN_MESSAGES[redditScanMessageIndex]}
                      </>
                    ) : (
                      <>✓ Ready — searching finished in the background</>
                    )}
                  </p>
                </div>
              </div>
            )}

            {redditIntroAcknowledged && (
              <>
            {redditLoading && (
              <div className="flex flex-col items-center py-16 gap-4">
                <span className="w-8 h-8 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[var(--ink-soft)]">Scanning Reddit for live conversations…</p>
                <p className="text-xs text-[var(--ink-faint)] max-w-xs text-center">
                  Searching for threads where people ask for alternatives, comparisons, and recommendations near &ldquo;{brand.niche}&rdquo;.
                </p>
              </div>
            )}

            {!redditLoading && redditError && (
              <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3 mb-6">{redditError}</p>
            )}

            {!redditLoading && !redditError && redditThreads.length === 0 && (
              <div className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-4 py-4 mb-8">
                <p className="text-sm text-[var(--ink-soft)]">
                  No live threads turned up for this exact niche yet — RankOnGeo keeps monitoring Reddit after
                  you&apos;re set up, and you can add your own keywords anytime from the dashboard.
                </p>
              </div>
            )}

            {!redditLoading && redditThreads.length > 0 && (
              <>
                <p className="text-sm font-semibold text-[var(--olive)] mb-4">
                  {redditThreads.length} live thread{redditThreads.length === 1 ? "" : "s"} found
                </p>

                <div className="space-y-3 mb-4">
                  {redditThreads.map((t) => (
                    <a
                      key={t.redditId}
                      href={t.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block bg-[var(--surface)] border border-[var(--line)] hover:border-[var(--rust)]/30 rounded-lg px-4 py-3.5 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-orange-700 bg-orange-500/10 px-2 py-0.5 rounded-full">
                          <svg viewBox="0 0 20 20" className="w-3 h-3 fill-[#FF4500]" aria-hidden="true">
                            <path d="M16.67 10a1.46 1.46 0 00-2.47-1 7.12 7.12 0 00-3.85-1.23l.65-3.07 2.13.45a1 1 0 101.07-1 1 1 0 00-.96.68l-2.38-.5a.19.19 0 00-.22.14l-.73 3.44a7.14 7.14 0 00-3.89 1.23 1.46 1.46 0 10-1.61 2.39 2.87 2.87 0 000 .44c0 2.24 2.61 4.06 5.83 4.06s5.83-1.82 5.83-4.06a2.87 2.87 0 000-.44 1.46 1.46 0 00.51-1.53zM7.27 11a1 1 0 111 1 1 1 0 01-1-1zm5.58 2.65a3.55 3.55 0 01-2.85.86 3.55 3.55 0 01-2.85-.86.19.19 0 01.27-.27 3.16 3.16 0 002.58.65 3.16 3.16 0 002.58-.65.19.19 0 01.27.27zm-.17-1.65a1 1 0 111-1 1 1 0 01-1 1z" />
                          </svg>
                          r/{t.subreddit}
                        </span>
                        {!!t.subredditSubscribers && (
                          <span className="text-[11px] text-[var(--ink-faint)]">{formatCompactNumber(t.subredditSubscribers)} members</span>
                        )}
                        {t.createdAt && <span className="text-[11px] text-[var(--ink-faint)]">· {formatTimeAgo(t.createdAt)}</span>}
                      </div>
                      <p className="text-sm font-medium text-[var(--ink)]/90 mb-2 leading-snug">{t.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[11px] font-medium text-[var(--ink-soft)] bg-[var(--line-soft)] px-2 py-0.5 rounded-full">↑ {t.score}</span>
                        <span className="text-[11px] font-medium text-[var(--ink-soft)] bg-[var(--line-soft)] px-2 py-0.5 rounded-full">💬 {t.numComments}</span>
                        <span className="text-[11px] font-semibold text-[var(--rust-deep)] bg-[var(--rust-wash)] px-2 py-0.5 rounded-full">
                          ~{formatCompactNumber(t.estimatedViews)} views
                        </span>
                      </div>
                    </a>
                  ))}
                </div>

                {redditTotalFound > redditThreads.length && (
                  <p className="text-xs text-[var(--ink-faint)] mb-8">
                    +{redditTotalFound - redditThreads.length} more relevant thread{redditTotalFound - redditThreads.length === 1 ? "" : "s"} found —
                    see the full list and submit comments from your dashboard.
                  </p>
                )}

                <div className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-5 py-5 mb-8">
                  <p className="text-sm font-semibold text-[var(--ink)] mb-3">How a comment gets posted through RankOnGeo</p>
                  <ol className="space-y-2.5 text-xs text-[var(--ink-soft)]">
                    <li className="flex gap-2">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--rust)] text-[var(--surface)] text-[10px] font-bold flex items-center justify-center mt-0.5">1</span>
                      <span>Pick a thread — we draft a natural, genuinely helpful reply that mentions {brand.name} only where it fits.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--rust)] text-[var(--surface)] text-[10px] font-bold flex items-center justify-center mt-0.5">2</span>
                      <span>Submit it — it lands in your <strong className="text-[var(--ink)]">Tasks tab</strong>, ready to go.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--rust)] text-[var(--surface)] text-[10px] font-bold flex items-center justify-center mt-0.5">3</span>
                      <span>Posted within <strong className="text-[var(--ink)]">24 hours</strong> through one of our established, high-karma Reddit accounts — not a fresh throwaway that gets auto-filtered.</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 w-4 h-4 rounded-full bg-[var(--rust)] text-[var(--surface)] text-[10px] font-bold flex items-center justify-center mt-0.5">4</span>
                      <span>Because it&apos;s a real, aged account replying inside an already-active discussion, it survives Reddit&apos;s spam filters and tends to earn genuine upvotes.</span>
                    </li>
                  </ol>
                  {(() => {
                    const views = redditThreads.map((t) => t.estimatedViews);
                    const min = Math.min(...views);
                    const max = Math.max(...views);
                    return (
                      <p className="text-xs font-medium text-[var(--ink)]/90 mt-4 pt-4 border-t border-[var(--line)]">
                        Based on the threads above, a comment posted here typically gets seen by{" "}
                        {min === max ? `~${formatCompactNumber(min)} people` : `~${formatCompactNumber(min)}–${formatCompactNumber(max)} people`}
                        {" "}who are actively looking for a service like {brand.name} — genuine high-intent buyers, not casual scrollers.
                      </p>
                    );
                  })()}
                </div>
              </>
            )}

            {!redditLoading && redditSuggestedPosts.length > 0 && (
              <div className="mb-8">
                <p className="text-sm font-semibold text-[var(--ink)] mb-1">Suggested posts to make</p>
                <p className="text-xs text-[var(--ink-faint)] mb-3">
                  Starting your own thread in the right subreddit works even better than commenting on someone else&apos;s.
                </p>
                <div className="space-y-2.5">
                  {redditSuggestedPosts.map((p) => (
                    <div key={p.subreddit} className="bg-[var(--surface)] border border-[var(--line)] rounded-lg px-4 py-3.5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-[11px] font-semibold text-orange-700 bg-orange-500/10 px-2 py-0.5 rounded-full">r/{p.subreddit}</span>
                        {!!p.subscribers && <span className="text-[11px] text-[var(--ink-faint)]">{formatCompactNumber(p.subscribers)} members</span>}
                      </div>
                      <p className="text-sm text-[var(--ink)]/90 mb-1.5">&ldquo;{p.title}&rdquo;</p>
                      <p className="text-xs text-[var(--ink-soft)]">
                        Typically ~{formatCompactNumber(p.estimatedViewsLow)}–{formatCompactNumber(p.estimatedViewsHigh)} views and steady upvotes when it resonates.
                      </p>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-[var(--ink-faint)] mt-3">More subreddits and posting options are available in your dashboard.</p>
              </div>
            )}
              </>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("prompts")}
                disabled={saving}
                className="px-5 py-3 border border-[var(--line)] text-[var(--ink-soft)] rounded-lg text-sm font-medium hover:bg-[var(--line-soft)] disabled:opacity-50 transition-colors"
              >
                ← Back
              </button>
              {redditIntroAcknowledged && (
                <button
                  onClick={finishSetup}
                  disabled={saving}
                  className="flex-1 bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? "Saving…" : "Continue"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Step 5: Trial signup */}
        {step === "trial" && (
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--olive-wash)] px-3 py-1 text-xs font-medium text-[var(--olive)] mb-3">
              <span>✓</span>
              <span>Free trial granted specially for {editedName || brand?.name || "your brand"}</span>
            </div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">See what AI says about you — free</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-8">
              ChatGPT, Gemini, Google AI Search, Perplexity, and Claude — we&apos;ll show you exactly what each one
              says about your brand for every prompt above, and whether you get mentioned at all. Then we help close
              the gap — RankOnGeo improves your odds of actually getting mentioned, not just measures them.
            </p>

            <div className="mb-6">
              <p className="text-sm font-medium text-[var(--ink)] mb-2">Your plan</p>
              <div className="rounded-lg border border-[var(--rust)] bg-[var(--rust-wash)] px-4 py-3.5">
                <p className="text-sm font-semibold text-[var(--ink)]">
                  {PRICING[0].name} — ${PRICING[0].price}/mo after trial
                </p>
                <p className="text-xs text-[var(--ink-soft)] mt-1">
                  Get access to the app, your AI visibility report, and Reddit marketing for your brand.
                </p>
                <p className="text-xs text-[var(--ink-faint)] mt-2">
                  We&apos;ve run Reddit marketing for Cluely, Tsenta, Affogato AI, and Interview Coder, and helped
                  them grow.
                </p>
              </div>
            </div>

            <form onSubmit={handleClaimTrial} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-[var(--ink)]/80 mb-1.5">Email</label>
                <input
                  type="email"
                  value={trialEmail}
                  onChange={(e) => setTrialEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                  className="w-full border border-[var(--line)] bg-[var(--surface)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                />
              </div>

              {trialError && (
                <p className="text-sm text-red-700 bg-red-500/10 border border-red-500/25 rounded-lg px-4 py-3">
                  {trialError}{" "}
                  {trialError.includes("sign in") && (
                    <a href="/auth?mode=signin&redirect=/dashboard" className="underline font-medium">Sign in →</a>
                  )}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep("reddit")}
                  disabled={trialSubmitting}
                  className="px-5 py-3 border border-[var(--line)] text-[var(--ink-soft)] rounded-lg text-sm font-medium hover:bg-[var(--line-soft)] disabled:opacity-50 transition-colors"
                >
                  ← Back
                </button>
                <button
                  type="submit"
                  disabled={trialSubmitting || !trialEmail.trim()}
                  className="flex-1 bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
                >
                  {trialSubmitting ? "Starting your trial…" : "Start free trial →"}
                </button>
              </div>

              <p className="text-xs text-[var(--ink-faint)] text-center">
                You won&apos;t be charged today — card required to prevent abuse. After your 1-day free trial ends,
                you&apos;ll be charged $
                {PRICING.find((p) => p.planKey === trialPlan)?.price ?? PRICING[0].price}/mo unless you cancel
                before then. Cancel anytime from Settings.
              </p>
            </form>
          </div>
        )}
      </main>

      {sourcePopupVisible && !hideSourceAsk && (
        <div className="fixed bottom-5 right-5 z-50 w-[calc(100%-2.5rem)] max-w-xs rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-lg p-4 animate-[fadeSlideIn_0.3s_ease_forwards]">
          <button
            type="button"
            onClick={dismissSourceAsk}
            aria-label="Dismiss"
            className="absolute top-2.5 right-2.5 text-[var(--ink-faint)] hover:text-[var(--ink)] transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
          {sourceAnswer ? (
            <p className="text-xs text-[var(--olive)] font-medium">Thanks!</p>
          ) : (
            <>
              <p className="text-xs font-medium text-[var(--ink)] mb-2.5 pr-4">
                Quick one while you&apos;re here — how&apos;d you find RankOnGeo?
              </p>
              <div className="flex flex-wrap gap-1.5">
                {SOURCE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => (opt === "Other" ? setShowSourceOther(true) : submitAcquisitionSource(opt))}
                    className="text-xs px-2.5 py-1.5 rounded-full border border-[var(--line)] text-[var(--ink-soft)] hover:border-[var(--rust)]/40 hover:text-[var(--ink)] transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {showSourceOther && (
                <div className="flex gap-2 mt-2.5">
                  <input
                    value={sourceOtherInput}
                    onChange={(e) => setSourceOtherInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && sourceOtherInput.trim()) { e.preventDefault(); submitAcquisitionSource(sourceOtherInput.trim()); }
                    }}
                    placeholder="Tell us…"
                    autoFocus
                    className="flex-1 border border-[var(--line)] bg-[var(--cream)] rounded-lg px-3 py-1.5 text-xs outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => sourceOtherInput.trim() && submitAcquisitionSource(sourceOtherInput.trim())}
                    className="px-3 py-1.5 text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] rounded-lg hover:bg-[var(--rust-deep)] transition-colors"
                  >
                    Send
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function SetupPage() {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable}`}
      style={{ fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <Suspense><SetupContent /></Suspense>
    </div>
  );
}
