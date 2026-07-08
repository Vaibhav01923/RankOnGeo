"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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

const QUICK_EDITS = [
  "Make it shorter and more concise",
  "Add an FAQ section at the end",
  "Improve the introduction to be more engaging",
  "Add more practical examples",
  "Make the tone more conversational",
  "Add a comparison table",
];

function ArticleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [article, setArticle] = useState("");
  const [title, setTitle] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [articleId, setArticleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  // AI refine
  const [aiInstruction, setAiInstruction] = useState("");
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState("");
  const [pendingContent, setPendingContent] = useState<{ article: string; title: string; wordCount: number } | null>(null);

  const gapPrompt = searchParams.get("gapPrompt") ?? "";
  const brandName = searchParams.get("brand") ?? "";
  const niche = searchParams.get("niche") ?? "";
  const topCompetitor = searchParams.get("competitor") ?? "";
  const missingEnginesRaw = searchParams.get("engines") ?? "[]";
  const brandId = searchParams.get("brandId") ?? "";
  const articleIdParam = searchParams.get("articleId") ?? "";

  useEffect(() => {
    if (articleIdParam) setArticleId(articleIdParam);
    if (!gapPrompt || !brandName) { setLoading(false); return; }

    const cacheKey = `article:${gapPrompt}:${brandName}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { article: a, title: t, wordCount: w, articleId: aid } = JSON.parse(cached);
      setArticle(a); setTitle(t); setWordCount(w);
      if (aid && !articleIdParam) setArticleId(aid);
      setLoading(false);
      return;
    }

    let missingEngines: string[] = [];
    try { missingEngines = JSON.parse(decodeURIComponent(missingEnginesRaw)); } catch {}

    fetch("/api/generate-article", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gapPrompt, brandName, niche, topCompetitor, missingEngines }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setArticle(data.article);
        setTitle(data.title);
        setWordCount(data.wordCount);

        if (brandId) {
          fetch("/api/articles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ brandId, title: data.title, content: data.article, keyword: gapPrompt, status: "draft", wordCount: data.wordCount }),
          })
            .then((r) => r.json())
            .then((d) => {
              const aid = d.article?.id ?? null;
              if (aid) setArticleId(aid);
              sessionStorage.setItem(cacheKey, JSON.stringify({ article: data.article, title: data.title, wordCount: data.wordCount, articleId: aid }));
            })
            .catch(() => {
              sessionStorage.setItem(cacheKey, JSON.stringify({ article: data.article, title: data.title, wordCount: data.wordCount }));
            });
        } else {
          sessionStorage.setItem(cacheKey, JSON.stringify({ article: data.article, title: data.title, wordCount: data.wordCount }));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function copyToClipboard() {
    navigator.clipboard.writeText(article);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function enterEditMode() {
    setEditedContent(article);
    setEditedTitle(title);
    setEditMode(true);
    setPendingContent(null);
  }

  async function saveEdits() {
    const newContent = editedContent;
    const newTitle = editedTitle;
    const newWordCount = newContent.split(/\s+/).filter(Boolean).length;

    setSaving(true);
    if (articleId) {
      await fetch(`/api/articles/${articleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent, title: newTitle }),
      }).catch(() => {});
    }
    setArticle(newContent);
    setTitle(newTitle);
    setWordCount(newWordCount);

    const cacheKey = `article:${gapPrompt}:${brandName}`;
    const cached = sessionStorage.getItem(cacheKey);
    const cachedData = cached ? JSON.parse(cached) : {};
    sessionStorage.setItem(cacheKey, JSON.stringify({ ...cachedData, article: newContent, title: newTitle, wordCount: newWordCount }));

    setSaving(false);
    setEditMode(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  async function applyAiEdit(instruction: string) {
    if (!instruction.trim() || !article) return;
    setRefining(true);
    setRefineError("");
    setPendingContent(null);

    try {
      const res = await fetch("/api/refine-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: article, title, instruction }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPendingContent({ article: data.article, title: data.title, wordCount: data.wordCount });
    } catch (e: unknown) {
      setRefineError(e instanceof Error ? e.message : "Failed to refine article");
    } finally {
      setRefining(false);
    }
  }

  async function acceptRefinement() {
    if (!pendingContent) return;
    setSaving(true);
    if (articleId) {
      await fetch(`/api/articles/${articleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: pendingContent.article, title: pendingContent.title }),
      }).catch(() => {});
    }
    setArticle(pendingContent.article);
    setTitle(pendingContent.title);
    setWordCount(pendingContent.wordCount);

    const cacheKey = `article:${gapPrompt}:${brandName}`;
    const cached = sessionStorage.getItem(cacheKey);
    const cachedData = cached ? JSON.parse(cached) : {};
    sessionStorage.setItem(cacheKey, JSON.stringify({ ...cachedData, article: pendingContent.article, title: pendingContent.title, wordCount: pendingContent.wordCount }));

    setPendingContent(null);
    setAiInstruction("");
    setSaving(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2500);
  }

  const articleBody = article.replace(/^# .+\n?/m, "").trim();

  return (
    <div className="min-h-screen bg-[var(--cream)]">
      <nav className="px-4 sm:px-8 py-4 border-b border-[var(--line)] flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] sticky top-0 z-20">
        <a href="/" className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="6" stroke="var(--rust)" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="12.5" stroke="var(--rust)" strokeWidth="1.8" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
            <circle cx="26.5" cy="9" r="2.5" fill="var(--olive)" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-[var(--ink)]">
            RankOn<span className="text-[var(--rust)]">Geo</span>
          </span>
        </a>
        <div className="flex flex-wrap items-center gap-2">
          {savedFlash && (
            <span className="text-xs text-[var(--rust-deep)] font-medium bg-[var(--rust-wash)] px-3 py-1.5 rounded-lg border border-[var(--rust)]/25">Saved</span>
          )}
          {article && !editMode && (
            <>
              <button onClick={copyToClipboard} className="text-sm px-4 py-2 border border-[var(--line)] rounded-lg hover:bg-[var(--line-soft)] transition-colors text-[var(--ink)]">
                {copied ? "Copied!" : "Copy Markdown"}
              </button>
              <button
                onClick={enterEditMode}
                className="text-sm px-4 py-2 border border-[var(--line)] rounded-lg hover:bg-[var(--line-soft)] transition-colors flex items-center gap-1.5 text-[var(--ink)]"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Edit
              </button>
            </>
          )}
          {editMode && (
            <>
              <button onClick={() => setEditMode(false)} className="text-sm px-4 py-2 border border-[var(--line)] rounded-lg hover:bg-[var(--line-soft)] transition-colors text-[var(--ink-soft)]">
                Cancel
              </button>
              <button
                onClick={saveEdits}
                disabled={saving}
                className="text-sm px-4 py-2 bg-[var(--rust)] text-[var(--surface)] rounded-lg hover:bg-[var(--rust-deep)] disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
          <button onClick={() => router.push(brandId ? `/dashboard?brandId=${brandId}` : "/dashboard")} className="text-sm px-4 py-2 bg-[var(--rust)] text-[var(--surface)] rounded-lg hover:bg-[var(--rust-deep)] transition-colors">
            Back to dashboard →
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-5 sm:px-8 py-14">
        {gapPrompt && (
          <div className="mb-8 bg-[var(--rust-wash)] border border-[var(--rust)]/25 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-[var(--rust-deep)] uppercase tracking-widest mb-1">Targeting this AI gap</p>
            <p className="text-sm text-[var(--ink)]/90 font-medium">"{gapPrompt}"</p>
            {topCompetitor && (
              <p className="text-xs text-[var(--ink-soft)] mt-1">
                Currently <span className="font-medium text-[var(--ink)]/80">{topCompetitor}</span> appears instead of <span className="font-medium text-[var(--ink)]/80">{brandName}</span>
              </p>
            )}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center py-32 gap-5">
            <span className="w-8 h-8 border-2 border-[var(--rust)] border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--ink)]/80">Writing your article…</p>
              <p className="text-xs text-[var(--ink-faint)] mt-1">Targeting: "{gapPrompt}"</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-5 py-4 text-sm text-red-700">{error}</div>
        )}

        {article && !loading && (
          <div>
            <div className="mb-8">
              {editMode ? (
                <input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="w-full text-4xl font-black text-[var(--ink)] tracking-tight leading-tight mb-4 border-b-2 border-[var(--rust)]/25 outline-none bg-transparent pb-2 focus:border-[var(--rust)]/60 transition-colors"
                />
              ) : (
                <h1 className="font-signal-serif text-4xl font-[350] text-[var(--ink)] tracking-tight leading-tight mb-4">{title}</h1>
              )}
              <div className="flex items-center gap-4 text-xs text-[var(--ink-faint)]">
                <span>~{wordCount.toLocaleString()} words</span>
                <span>·</span>
                <span className="text-[var(--olive)] font-medium">AI visibility optimized</span>
                <span>·</span>
                <span>Ready to publish</span>
                {articleId && <><span>·</span><span className="text-[var(--ink-faint)]/70">Saved</span></>}
              </div>
            </div>

            {/* Manual edit mode */}
            {editMode ? (
              <div className="rounded-2xl border-2 border-[var(--rust)]/25 overflow-hidden">
                <div className="bg-[var(--line-soft)] border-b border-[var(--line)] px-4 py-2.5 flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="var(--rust)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="text-xs font-medium text-[var(--ink-soft)]">Editing raw markdown</span>
                  <span className="ml-auto text-xs text-[var(--ink-faint)]">{editedContent.split(/\s+/).filter(Boolean).length} words</span>
                </div>
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full min-h-[600px] px-6 py-5 text-sm text-[var(--ink)]/80 font-mono leading-relaxed resize-y outline-none border-none bg-[var(--surface)]"
                  spellCheck={false}
                />
              </div>
            ) : (
              /* Read-only rendered article */
              <div className="bg-[var(--surface)] border border-[var(--line)] rounded-2xl px-10 py-10">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: () => null,
                    h2: ({ children }) => <h2 className="text-2xl font-bold text-[var(--ink)] mt-10 mb-4 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-[var(--ink)]/90 mt-7 mb-3">{children}</h3>,
                    p: ({ children }) => <p className="text-[var(--ink)]/80 leading-relaxed mb-5 text-base">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-6 mb-5 space-y-1.5 text-[var(--ink)]/80">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-6 mb-5 space-y-1.5 text-[var(--ink)]/80">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-[var(--ink)]">{children}</strong>,
                    a: ({ href, children }) => <a href={href} className="text-[var(--rust)] underline underline-offset-2 hover:text-[var(--rust-deep)]">{children}</a>,
                    blockquote: ({ children }) => <blockquote className="bg-[var(--line-soft)] rounded-lg px-5 py-3 italic text-[var(--ink-soft)] my-5 text-sm">{children}</blockquote>,
                    code: ({ className, children, ...props }) => {
                      const isBlock = className?.startsWith("language-");
                      const lang = className?.replace("language-", "") ?? "";
                      if (isBlock) {
                        return (
                          <div className="my-5 rounded-xl overflow-hidden border border-gray-800">
                            {lang && <div className="bg-white/[0.1] px-4 py-2 text-xs text-faint font-mono">{lang}</div>}
                            <pre className="bg-gray-950 text-gray-100 px-5 py-4 overflow-x-auto text-sm font-mono leading-6"><code>{children}</code></pre>
                          </div>
                        );
                      }
                      return <code className="bg-[var(--rust-wash)] text-[var(--rust-deep)] px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
                    },
                    pre: ({ children }) => <>{children}</>,
                    hr: () => <hr className="border-[var(--line)] my-8" />,
                  }}
                >
                  {articleBody}
                </ReactMarkdown>
              </div>
            )}

            {/* AI Refine panel — only in view mode */}
            {!editMode && (
              <div className="mt-6 bg-[var(--surface)] border border-[var(--line)] rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-[var(--line)] flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-[var(--rust)] flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v4M8 10v4M2 8h4M10 8h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </div>
                  <p className="text-sm font-semibold text-[var(--ink)]">Ask AI to edit</p>
                  <span className="text-xs text-[var(--ink-faint)] ml-1">— describe what to change</span>
                </div>

                <div className="px-6 py-5">
                  {/* Quick chips */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {QUICK_EDITS.map((q) => (
                      <button
                        key={q}
                        onClick={() => setAiInstruction(q)}
                        disabled={refining}
                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                          aiInstruction === q
                            ? "bg-[var(--rust)] text-[var(--surface)] border-[var(--rust)]"
                            : "text-[var(--ink-soft)] border-[var(--line)] hover:border-[var(--line)] hover:text-[var(--ink)]/90"
                        }`}
                      >
                        {q}
                      </button>
                    ))}
                  </div>

                  {/* Custom instruction */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={aiInstruction}
                      onChange={(e) => setAiInstruction(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); applyAiEdit(aiInstruction); }}}
                      placeholder="e.g. Add a section comparing us to competitors…"
                      disabled={refining}
                      className="flex-1 border border-[var(--line)] bg-[var(--cream)] rounded-xl px-4 py-2.5 text-sm outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] focus:ring-2 focus:ring-[var(--rust)]/40 focus:border-transparent transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={() => applyAiEdit(aiInstruction)}
                      disabled={!aiInstruction.trim() || refining}
                      className="px-5 py-2.5 bg-[var(--rust)] text-[var(--surface)] text-sm font-medium rounded-xl hover:bg-[var(--rust-deep)] disabled:opacity-40 transition-colors flex items-center gap-2 shrink-0"
                    >
                      {refining ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Editing…</>
                      ) : "Apply"}
                    </button>
                  </div>

                  {refineError && (
                    <p className="text-xs text-red-700 mt-2">{refineError}</p>
                  )}

                  {/* Pending refined result */}
                  {pendingContent && (
                    <div className="mt-4 bg-[var(--olive-wash)] border border-[var(--olive)]/25 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-[var(--olive)]">AI revision ready</p>
                        <span className="text-xs text-[var(--olive)]">{pendingContent.wordCount.toLocaleString()} words</span>
                      </div>
                      <p className="text-xs text-[var(--ink-soft)] leading-relaxed mb-3 line-clamp-3">
                        {pendingContent.article.replace(/^#+ .+\n+/m, "").replace(/[#*_`]/g, "").substring(0, 200)}…
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={acceptRefinement}
                          disabled={saving}
                          className="flex-1 text-xs font-semibold bg-[var(--rust)] text-[var(--surface)] py-2 rounded-lg hover:bg-[var(--rust-deep)] disabled:opacity-50 transition-colors"
                        >
                          {saving ? "Saving…" : "Accept & save"}
                        </button>
                        <button
                          onClick={() => setPendingContent(null)}
                          className="text-xs text-[var(--ink-soft)] px-3 py-2 rounded-lg border border-[var(--line)] hover:bg-[var(--line-soft)] transition-colors"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* What to do next */}
            {!editMode && (
              <div className="mt-4 p-5 bg-[var(--surface)] border border-[var(--line)] rounded-xl">
                <p className="text-xs font-semibold text-[var(--ink-faint)] uppercase tracking-widest mb-3">What to do next</p>
                <ol className="space-y-2 text-sm text-[var(--ink-soft)]">
                  <li className="flex items-start gap-3"><span className="text-[var(--ink-faint)]/70 font-mono shrink-0">1.</span>Copy the Markdown and paste it into your blog (WordPress, Notion, Webflow, etc.)</li>
                  <li className="flex items-start gap-3"><span className="text-[var(--ink-faint)]/70 font-mono shrink-0">2.</span>Publish it publicly so search engines and AI crawlers can index it</li>
                  <li className="flex items-start gap-3"><span className="text-[var(--ink-faint)]/70 font-mono shrink-0">3.</span>Come back in 30 days and re-scan — you should start appearing for this query</li>
                </ol>
              </div>
            )}

            {!editMode && (
              <div className="mt-4 flex items-center gap-3">
                <button onClick={copyToClipboard} className="px-5 py-2.5 bg-[var(--rust)] text-[var(--surface)] text-sm font-medium rounded-lg hover:bg-[var(--rust-deep)] transition-colors">
                  {copied ? "Copied!" : "Copy Markdown"}
                </button>
                <button onClick={enterEditMode} className="px-5 py-2.5 border border-[var(--line)] text-[var(--ink)]/80 text-sm font-medium rounded-lg hover:bg-[var(--line-soft)] transition-colors flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Edit manually
                </button>
                <button onClick={() => router.push(brandId ? `/dashboard?brandId=${brandId}` : "/dashboard")} className="px-5 py-2.5 border border-[var(--line)] text-[var(--ink)]/80 text-sm font-medium rounded-lg hover:bg-[var(--line-soft)] transition-colors">
                  Back to dashboard →
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function ArticlePage() {
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
      <Suspense><ArticleContent /></Suspense>
    </div>
  );
}
