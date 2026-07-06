"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { BrandData, TrackedPrompt } from "@/lib/types";
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

const PLAN_AUTO_COUNTS: Record<string, number> = { starter: 20, pro: 50, business: 150, scale: 400 };
const PLAN_CUSTOM_LIMITS: Record<string, number> = { starter: 5, pro: 10, business: 25, scale: 50 };

type Step = "url" | "brand" | "prompts";

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
      .select("plan")
      .single()
      .then(({ data }) => { if (data?.plan) setUserPlan(data.plan); });
  }, []);

  useEffect(() => {
    const d = searchParams.get("domain");
    const c = searchParams.get("competitors");
    if (d) {
      setDomain(d);
      if (c) setCompetitors(c.split(",").map((s) => s.trim()).filter(Boolean));
      // Auto-trigger analysis when arriving from audit page
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
  const [userPlan, setUserPlan] = useState("starter");
  const [saving, setSaving] = useState(false);

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

  function addPrompt() {
    const trimmed = newPrompt.trim();
    const customCount = prompts.filter((p) => p.category === "custom").length;
    const customLimit = PLAN_CUSTOM_LIMITS[userPlan] ?? 5;
    if (!trimmed || customCount >= customLimit) return;
    setPrompts([...prompts, { id: `custom-${Date.now()}`, text: trimmed, category: "custom" }]);
    setNewPrompt("");
  }

  async function handleStart() {
    if (!brand?.id) return;
    setSaving(true);
    await fetch("/api/brand", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: brand.id,
        name: editedName || brand.name,
        niche: editedNiche || brand.niche,
        competitors: editedCompetitors,
        targetAudience: editedAudience,
        prompts: prompts.filter((p) => !deselectedIds.has(p.id)).map((p) => ({ text: p.text, category: p.category })),
      }),
    });
    setSaving(false);
    router.push(`/dashboard?brandId=${brand.id}`);
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
          {(["url", "brand", "prompts"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-signal-mono font-medium transition-colors ${
                step === s ? "bg-[var(--rust)] text-[var(--surface)]" :
                (step === "brand" && s === "url") || (step === "prompts" && s !== "prompts")
                  ? "bg-[var(--olive-wash)] text-[var(--olive)]"
                  : "bg-[var(--line-soft)] text-[var(--ink-faint)]"
              }`}>
                {i + 1}
              </div>
              <span className={`text-sm ${step === s ? "text-[var(--ink)] font-medium" : "text-[var(--ink-faint)]"}`}>
                {s === "url" ? "Your website" : s === "brand" ? "Brand info" : "Tracked prompts"}
              </span>
              {i < 2 && <span className="text-[var(--line)] ml-1">—</span>}
            </div>
          ))}
        </div>

        {/* Step 1: URL */}
        {step === "url" && (
          <div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Enter your website</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-8">
              We&apos;ll crawl it to understand your brand and generate the right tracking prompts.
            </p>
            {loading && (
              <div className="flex flex-col items-center py-16 gap-4">
                <span className="w-8 h-8 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-[var(--ink-soft)]">Analyzing your site…</p>
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
              <button
                onClick={handleBrandNext}
                className="w-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
              >
                Continue to prompts
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Tracked prompts */}
        {step === "prompts" && (
          <div>
            <h1 className="font-signal-serif text-3xl text-[var(--ink)] mb-2">Review search queries</h1>
            <p className="text-[var(--ink-soft)] text-sm mb-2">
              These are questions people ask AI about businesses like yours. We&apos;ll track your brand&apos;s visibility for each.
            </p>
            {(() => {
              const selectedCount = prompts.filter((p) => !deselectedIds.has(p.id)).length;
              return (
                <p className="text-sm font-semibold text-[var(--olive)] mb-7">
                  {selectedCount}/{prompts.length} prompts selected
                </p>
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

            <div className="flex gap-2 mb-6">
              <input
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPrompt(); } }}
                placeholder="Add custom prompt…"
                className="flex-1 border border-[var(--line)] bg-[var(--surface)] rounded-lg px-4 py-2.5 text-sm outline-none text-[var(--ink)] focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
              />
              <button onClick={addPrompt} className="px-4 py-2.5 text-sm font-semibold bg-[var(--rust)] text-[var(--surface)] rounded-lg hover:bg-[var(--rust-deep)] transition-colors">
                Add
              </button>
            </div>

            <div className="bg-[var(--line-soft)] border border-[var(--line)] rounded-lg px-4 py-3 mb-6">
              <p className="text-xs font-semibold text-[var(--ink-soft)] mb-1.5">Prompt Tips</p>
              <ul className="space-y-1 text-xs text-[var(--ink-faint)]">
                <li>· Focus on questions your customers actually ask</li>
                <li>· Include your product category or service type</li>
                <li>· Avoid overly specific or branded terms</li>
              </ul>
            </div>

            {(() => {
              const customCount = prompts.filter((p) => p.category === "custom").length;
              const customLimit = PLAN_CUSTOM_LIMITS[userPlan] ?? 5;
              return customCount >= customLimit ? (
                <p className="text-xs text-[var(--rust-deep)] font-medium mb-4">Custom limit reached · <a href="/pricing" className="underline">upgrade for more</a></p>
              ) : null;
            })()}

            <button
              onClick={handleStart}
              disabled={saving || prompts.filter((p) => !deselectedIds.has(p.id)).length === 0}
              className="w-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] py-3 rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? "Saving…" : "Generate report"}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SetupPage() {
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
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable}`}
      style={{ ...signalVars, fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <Suspense><SetupContent /></Suspense>
    </div>
  );
}
