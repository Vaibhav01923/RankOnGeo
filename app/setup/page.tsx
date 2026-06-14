"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BrandData, TrackedPrompt } from "@/lib/types";
import { createSupabaseBrowserClient } from "@/lib/supabase";

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
    const d = searchParams.get("domain");
    const c = searchParams.get("competitors");
    if (d) {
      setDomain(d);
      if (c) setCompetitors(c.split(",").map((s) => s.trim()).filter(Boolean));
      // Auto-trigger analysis when arriving from audit page
      triggerAnalyze(d, c ? c.split(",").map((s) => s.trim()).filter(Boolean) : []);
    }
  }, []);
  const [competitorInput, setCompetitorInput] = useState("");
  const [competitors, setCompetitors] = useState<string[]>([]);

  // Step 2 & 3 data
  const [brand, setBrand] = useState<BrandData | null>(null);
  const [editedName, setEditedName] = useState("");
  const [editedNiche, setEditedNiche] = useState("");
  const [editedCompetitors, setEditedCompetitors] = useState<string[]>([]);
  const [prompts, setPrompts] = useState<TrackedPrompt[]>([]);
  const [newPrompt, setNewPrompt] = useState("");

  function addCompetitor() {
    const trimmed = competitorInput.trim();
    if (trimmed && !competitors.includes(trimmed)) {
      setCompetitors([...competitors, trimmed]);
    }
    setCompetitorInput("");
  }

  async function triggerAnalyze(d: string, comps: string[]) {
    if (!d.trim()) return;
    setLoading(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: { user } } = await supabase.auth.getUser();
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: d.trim(), competitors: comps, userId: user?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setBrand(data);
      setEditedName(data.name);
      setEditedNiche(data.niche);
      setEditedCompetitors(data.competitors);
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

  function handleBrandNext() {
    if (!brand) return;
    setBrand({ ...brand, name: editedName, niche: editedNiche, competitors: editedCompetitors });
    setStep("prompts");
  }

  function removePrompt(id: string) {
    setPrompts(prompts.filter((p) => p.id !== id));
  }

  function addPrompt() {
    const trimmed = newPrompt.trim();
    if (!trimmed) return;
    setPrompts([...prompts, { id: `custom-${Date.now()}`, text: trimmed, category: "custom" }]);
    setNewPrompt("");
  }

  function handleStart() {
    if (!brand?.id) return;
    router.push(`/dashboard?brandId=${brand.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-100 px-6 py-4">
        <a href="/" className="font-bold text-xl tracking-tight">
          SEO<span className="text-emerald-500">itis</span>
        </a>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* Steps indicator */}
        <div className="flex items-center gap-2 mb-10">
          {(["url", "brand", "prompts"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                step === s ? "bg-emerald-500 text-white" :
                (step === "brand" && s === "url") || (step === "prompts" && s !== "prompts")
                  ? "bg-emerald-100 text-emerald-600"
                  : "bg-gray-100 text-gray-400"
              }`}>
                {i + 1}
              </div>
              <span className={`text-sm ${step === s ? "text-gray-900 font-medium" : "text-gray-400"}`}>
                {s === "url" ? "Your website" : s === "brand" ? "Brand info" : "Tracked prompts"}
              </span>
              {i < 2 && <span className="text-gray-200 ml-1">—</span>}
            </div>
          ))}
        </div>

        {/* Step 1: URL */}
        {step === "url" && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Enter your website</h1>
            <p className="text-gray-500 text-sm mb-8">
              We&apos;ll crawl it to understand your brand and generate the right tracking prompts.
            </p>
            {loading && (
              <div className="flex flex-col items-center py-16 gap-4">
                <span className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500">Analyzing your site…</p>
              </div>
            )}
            {!loading && <form onSubmit={handleAnalyze} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Website URL</label>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="yoursite.com"
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none text-gray-900 focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Known competitors <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={competitorInput}
                    onChange={(e) => setCompetitorInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
                    placeholder="Competitor name"
                    className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none text-gray-900 focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                  />
                  <button type="button" onClick={addCompetitor} className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                    Add
                  </button>
                </div>
                {competitors.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {competitors.map((c) => (
                      <span key={c} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                        {c}
                        <button onClick={() => setCompetitors(competitors.filter((x) => x !== c))} className="text-gray-400 hover:text-gray-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{error}</p>}
              <button
                type="submit"
                disabled={loading || !domain.trim()}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-lg text-sm font-medium transition-colors"
              >
                Analyze site
              </button>
            </form>}
          </div>
        )}

        {/* Step 2: Brand info */}
        {step === "brand" && brand && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Review your brand info</h1>
            <p className="text-gray-500 text-sm mb-8">We extracted this from your site. Edit anything that looks off.</p>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Brand name</label>
                <input
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none text-gray-900 focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Niche</label>
                <input
                  value={editedNiche}
                  onChange={(e) => setEditedNiche(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm outline-none text-gray-900 focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-3 border border-gray-100">{brand.description}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Target audience</label>
                <div className="flex flex-wrap gap-1.5">
                  {brand.targetAudience.map((a) => (
                    <span key={a} className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full">{a}</span>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Competitors</label>
                <div className="flex flex-wrap gap-1.5">
                  {editedCompetitors.map((c) => (
                    <span key={c} className="flex items-center gap-1 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                      {c}
                      <button onClick={() => setEditedCompetitors(editedCompetitors.filter((x) => x !== c))} className="text-gray-400 hover:text-gray-600">×</button>
                    </span>
                  ))}
                </div>
              </div>
              <button
                onClick={handleBrandNext}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg text-sm font-medium transition-colors"
              >
                Continue to prompts
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Tracked prompts */}
        {step === "prompts" && (
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Tracked prompts</h1>
            <p className="text-gray-500 text-sm mb-8">
              These are the queries we&apos;ll submit to AI engines to measure your visibility. Remove any that don&apos;t fit, or add your own.
            </p>

            {/* Group by category */}
            {["discovery", "comparison", "how-to", "recommendation", "custom"].map((cat) => {
              const catPrompts = prompts.filter((p) => p.category === cat);
              if (!catPrompts.length) return null;
              return (
                <div key={cat} className="mb-6">
                  <h3 className="text-xs uppercase tracking-wide text-gray-400 font-medium mb-2">{cat}</h3>
                  <div className="space-y-2">
                    {catPrompts.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-lg px-4 py-2.5">
                        <span className="flex-1 text-sm text-gray-700">{p.text}</span>
                        <button onClick={() => removePrompt(p.id)} className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none">×</button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-2 mt-4 mb-8">
              <input
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addPrompt(); } }}
                placeholder="Add a custom prompt..."
                className="flex-1 border border-gray-200 rounded-lg px-4 py-2.5 text-sm outline-none text-gray-900 focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
              />
              <button onClick={addPrompt} className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                Add
              </button>
            </div>

            <p className="text-xs text-gray-400 mb-4">{prompts.length} prompts selected</p>
            <button
              onClick={handleStart}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-lg text-sm font-medium transition-colors"
            >
              Start tracking
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default function SetupPage() {
  return <Suspense><SetupContent /></Suspense>;
}
