"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
    <div className="min-h-screen bg-white">
      <nav className="px-8 py-4 border-b border-stone-200 flex items-center justify-between bg-white sticky top-0 z-20">
        <a href="/" className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="7" fill="#c8372d" />
            <path d="M14 5C10.96 5 8.5 7.46 8.5 10.5c0 4.63 5.5 12.5 5.5 12.5s5.5-7.87 5.5-12.5C19.5 7.46 17.04 5 14 5z" fill="white" />
            <circle cx="14" cy="10.5" r="2.2" fill="#c8372d" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            RankOn<span className="text-red-600">Geo</span>
          </span>
        </a>
        <div className="flex items-center gap-2">
          {savedFlash && (
            <span className="text-xs text-emerald-600 font-medium bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-100">Saved</span>
          )}
          {article && !editMode && (
            <>
              <button onClick={copyToClipboard} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
                {copied ? "Copied!" : "Copy Markdown"}
              </button>
              <button
                onClick={enterEditMode}
                className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Edit
              </button>
            </>
          )}
          {editMode && (
            <>
              <button onClick={() => setEditMode(false)} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors text-gray-500">
                Cancel
              </button>
              <button
                onClick={saveEdits}
                disabled={saving}
                className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
          <button onClick={() => router.push(brandId ? `/dashboard?brandId=${brandId}` : "/dashboard")} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
            Back to dashboard →
          </button>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-8 py-14">
        {gapPrompt && (
          <div className="mb-8 bg-red-50 border border-red-100 rounded-xl px-5 py-4">
            <p className="text-xs font-semibold text-red-500 uppercase tracking-widest mb-1">Targeting this AI gap</p>
            <p className="text-sm text-gray-800 font-medium">"{gapPrompt}"</p>
            {topCompetitor && (
              <p className="text-xs text-gray-500 mt-1">
                Currently <span className="font-medium text-gray-700">{topCompetitor}</span> appears instead of <span className="font-medium text-gray-700">{brandName}</span>
              </p>
            )}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center py-32 gap-5">
            <span className="w-8 h-8 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-700">Writing your article…</p>
              <p className="text-xs text-gray-400 mt-1">Targeting: "{gapPrompt}"</p>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-xl px-5 py-4 text-sm text-red-600">{error}</div>
        )}

        {article && !loading && (
          <div>
            <div className="mb-8">
              {editMode ? (
                <input
                  value={editedTitle}
                  onChange={(e) => setEditedTitle(e.target.value)}
                  className="w-full text-4xl font-black text-gray-900 tracking-tight leading-tight mb-4 border-b-2 border-red-200 outline-none bg-transparent pb-2 focus:border-red-400 transition-colors"
                />
              ) : (
                <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight mb-4">{title}</h1>
              )}
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>~{wordCount.toLocaleString()} words</span>
                <span>·</span>
                <span className="text-emerald-600 font-medium">AI visibility optimized</span>
                <span>·</span>
                <span>Ready to publish</span>
                {articleId && <><span>·</span><span className="text-gray-300">Saved</span></>}
              </div>
            </div>

            {/* Manual edit mode */}
            {editMode ? (
              <div className="rounded-2xl border-2 border-red-100 overflow-hidden">
                <div className="bg-stone-50 border-b border-stone-100 px-4 py-2.5 flex items-center gap-2">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="#c8372d" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <span className="text-xs font-medium text-gray-500">Editing raw markdown</span>
                  <span className="ml-auto text-xs text-gray-400">{editedContent.split(/\s+/).filter(Boolean).length} words</span>
                </div>
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full min-h-[600px] px-6 py-5 text-sm text-gray-700 font-mono leading-relaxed resize-y outline-none border-none"
                  spellCheck={false}
                />
              </div>
            ) : (
              /* Read-only rendered article */
              <div className="bg-white rounded-2xl border border-stone-200 px-10 py-10">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: () => null,
                    h2: ({ children }) => <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-gray-800 mt-7 mb-3">{children}</h3>,
                    p: ({ children }) => <p className="text-gray-700 leading-relaxed mb-5 text-base">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-6 mb-5 space-y-1.5 text-gray-700">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-6 mb-5 space-y-1.5 text-gray-700">{children}</ol>,
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
                    a: ({ href, children }) => <a href={href} className="text-red-600 underline underline-offset-2 hover:text-red-700">{children}</a>,
                    blockquote: ({ children }) => <blockquote className="bg-stone-50 rounded-lg px-5 py-3 italic text-gray-500 my-5 text-sm">{children}</blockquote>,
                    code: ({ className, children, ...props }) => {
                      const isBlock = className?.startsWith("language-");
                      const lang = className?.replace("language-", "") ?? "";
                      if (isBlock) {
                        return (
                          <div className="my-5 rounded-xl overflow-hidden border border-gray-800">
                            {lang && <div className="bg-gray-800 px-4 py-2 text-xs text-gray-400 font-mono">{lang}</div>}
                            <pre className="bg-gray-950 text-gray-100 px-5 py-4 overflow-x-auto text-sm font-mono leading-6"><code>{children}</code></pre>
                          </div>
                        );
                      }
                      return <code className="bg-stone-100 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
                    },
                    pre: ({ children }) => <>{children}</>,
                    hr: () => <hr className="border-stone-100 my-8" />,
                  }}
                >
                  {articleBody}
                </ReactMarkdown>
              </div>
            )}

            {/* AI Refine panel — only in view mode */}
            {!editMode && (
              <div className="mt-6 bg-white rounded-2xl border border-stone-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-stone-100 flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-md bg-[#c8372d] flex items-center justify-center shrink-0">
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2v4M8 10v4M2 8h4M10 8h4" stroke="white" strokeWidth="1.8" strokeLinecap="round" /></svg>
                  </div>
                  <p className="text-sm font-semibold text-gray-900">Ask AI to edit</p>
                  <span className="text-xs text-gray-400 ml-1">— describe what to change</span>
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
                            ? "bg-gray-900 text-white border-gray-900"
                            : "text-gray-600 border-stone-200 hover:border-gray-400 hover:text-gray-800"
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
                      className="flex-1 border border-stone-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-300 focus:border-red-300 transition-colors disabled:opacity-50"
                    />
                    <button
                      onClick={() => applyAiEdit(aiInstruction)}
                      disabled={!aiInstruction.trim() || refining}
                      className="px-5 py-2.5 bg-[#c8372d] text-white text-sm font-medium rounded-xl hover:bg-[#b02e26] disabled:opacity-40 transition-colors flex items-center gap-2 shrink-0"
                    >
                      {refining ? (
                        <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />Editing…</>
                      ) : "Apply"}
                    </button>
                  </div>

                  {refineError && (
                    <p className="text-xs text-red-500 mt-2">{refineError}</p>
                  )}

                  {/* Pending refined result */}
                  {pendingContent && (
                    <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-xs font-semibold text-emerald-700">AI revision ready</p>
                        <span className="text-xs text-emerald-600">{pendingContent.wordCount.toLocaleString()} words</span>
                      </div>
                      <p className="text-xs text-gray-600 leading-relaxed mb-3 line-clamp-3">
                        {pendingContent.article.replace(/^#+ .+\n+/m, "").replace(/[#*_`]/g, "").substring(0, 200)}…
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={acceptRefinement}
                          disabled={saving}
                          className="flex-1 text-xs font-semibold bg-emerald-600 text-white py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                        >
                          {saving ? "Saving…" : "Accept & save"}
                        </button>
                        <button
                          onClick={() => setPendingContent(null)}
                          className="text-xs text-gray-500 px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
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
              <div className="mt-4 p-5 bg-white rounded-xl border border-stone-200">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">What to do next</p>
                <ol className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-start gap-3"><span className="text-gray-300 font-mono shrink-0">1.</span>Copy the Markdown and paste it into your blog (WordPress, Notion, Webflow, etc.)</li>
                  <li className="flex items-start gap-3"><span className="text-gray-300 font-mono shrink-0">2.</span>Publish it publicly so search engines and AI crawlers can index it</li>
                  <li className="flex items-start gap-3"><span className="text-gray-300 font-mono shrink-0">3.</span>Come back in 30 days and re-scan — you should start appearing for this query</li>
                </ol>
              </div>
            )}

            {!editMode && (
              <div className="mt-4 flex items-center gap-3">
                <button onClick={copyToClipboard} className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
                  {copied ? "Copied!" : "Copy Markdown"}
                </button>
                <button onClick={enterEditMode} className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L5 13H3v-2L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Edit manually
                </button>
                <button onClick={() => router.push(brandId ? `/dashboard?brandId=${brandId}` : "/dashboard")} className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
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
  return <Suspense><ArticleContent /></Suspense>;
}
