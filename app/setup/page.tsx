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

type Step = "url" | "brand" | "prompts" | "trial";

const STEPS: { key: Step; label: string }[] = [
  { key: "url", label: "Your website" },
  { key: "brand", label: "Brand info" },
  { key: "prompts", label: "Tracked prompts" },
  { key: "trial", label: "Start free trial" },
];

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("url");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 1 fields
  const [domain, setDomain] = useState(searchParams.get("domain") ?? "");

  useEffect(() => {
    createSupabaseBrowserClient()
      .from("user_plans")
      .select("plan, dodo_subscription_id")
      .single()
      .then(({ data }) => { if (data?.dodo_subscription_id) setUserPlan(data.plan); });
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
  const [userPlan, setUserPlan] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const addPromptRef = useRef<HTMLDivElement>(null);

  // Step 4: trial signup
  const [trialEmail, setTrialEmail] = useState("");
  const [trialPlan, setTrialPlan] = useState(PRICING[0].planKey);
  const [trialSubmitting, setTrialSubmitting] = useState(false);
  const [trialError, setTrialError] = useState("");

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

  function addPrompt() {
    const trimmed = newPrompt.trim();
    if (!trimmed) return;
    // Gate on the plan's total cap vs. what's currently selected — not a fixed
    // "custom slots" number — so deselecting an AI-generated prompt always
    // opens room to write a replacement, on every plan including Pro.
    const totalCap = userPlan ? PLAN_PROMPT_LIMITS[userPlan] ?? FREE_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
    const selectedCount = prompts.filter((p) => !deselectedIds.has(p.id)).length;
    if (selectedCount >= totalCap) return;
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

  async function handleStart() {
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

    stashPendingBrandEdits(currentEdits());
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
        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-10">
          {(() => {
            const currentIndex = STEPS.findIndex((s) => s.key === step);
            return STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-signal-mono font-medium transition-colors ${
                  i === currentIndex ? "bg-[var(--rust)] text-[var(--surface)]" :
                  i < currentIndex
                    ? "bg-[var(--olive-wash)] text-[var(--olive)]"
                    : "bg-[var(--line-soft)] text-[var(--ink-faint)]"
                }`}>
                  {i + 1}
                </div>
                <span className={`text-sm ${i === currentIndex ? "text-[var(--ink)] font-medium" : "text-[var(--ink-faint)]"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <span className="text-[var(--line)] ml-1">—</span>}
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
              const totalCap = userPlan ? PLAN_PROMPT_LIMITS[userPlan] ?? FREE_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
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
                      onChange={(e) => setNewPrompt(e.target.value)}
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
                  {remaining <= 0 && (
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
                onClick={handleStart}
                disabled={saving || prompts.filter((p) => !deselectedIds.has(p.id)).length === 0}
                className="flex-1 bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
              >
                {saving ? "Saving…" : "Continue"}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Trial signup */}
        {step === "trial" && (
          <div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">See what AI says about you — free</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-8">
              ChatGPT, Gemini, Google AI Search, Perplexity, and Claude — we&apos;ll show you exactly what each one
              says about your brand for every prompt above, and whether you get mentioned at all.
            </p>

            <div className="mb-6">
              <p className="text-sm font-medium text-[var(--ink)] mb-2">Choose your plan</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {PRICING.map((p) => (
                  <button
                    key={p.planKey}
                    type="button"
                    onClick={() => setTrialPlan(p.planKey)}
                    className={`text-left rounded-lg border px-4 py-3 transition-colors ${
                      trialPlan === p.planKey
                        ? "border-[var(--rust)] bg-[var(--rust-wash)]"
                        : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--rust)]/30"
                    }`}
                  >
                    <p className="text-sm font-semibold text-[var(--ink)]">{p.name}</p>
                    <p className="text-xs text-[var(--ink-soft)] mt-0.5">${p.price}/mo after trial</p>
                  </button>
                ))}
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
                  onClick={() => setStep("prompts")}
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
