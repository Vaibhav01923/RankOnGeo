"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function ArticleContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [article, setArticle] = useState("");
  const [title, setTitle] = useState("");
  const [wordCount, setWordCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const gapPrompt = searchParams.get("gapPrompt") ?? "";
  const brandName = searchParams.get("brand") ?? "";
  const niche = searchParams.get("niche") ?? "";
  const topCompetitor = searchParams.get("competitor") ?? "";
  const missingEnginesRaw = searchParams.get("engines") ?? "[]";

  useEffect(() => {
    if (!gapPrompt || !brandName) { setLoading(false); return; }

    const cacheKey = `article:${gapPrompt}:${brandName}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      const { article: a, title: t, wordCount: w } = JSON.parse(cached);
      setArticle(a); setTitle(t); setWordCount(w);
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
        sessionStorage.setItem(cacheKey, JSON.stringify({ article: data.article, title: data.title, wordCount: data.wordCount }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  function copyToClipboard() {
    navigator.clipboard.writeText(article);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Strip the H1 from body since we render title separately
  const articleBody = article.replace(/^# .+\n?/m, "").trim();

  return (
    <div className="min-h-screen bg-[#f5ede3]">
      <nav className="px-8 py-4 border-b border-stone-200 flex items-center justify-between bg-white">
        <a href="/" className="flex items-center gap-2">
          <svg width="24" height="24" viewBox="0 0 28 28" fill="none">
            <rect width="28" height="28" rx="6" fill="#c8372d" />
            <rect x="6" y="6" width="4" height="16" rx="1" fill="white" />
            <rect x="12" y="10" width="4" height="12" rx="1" fill="white" />
            <rect x="18" y="8" width="4" height="14" rx="1" fill="white" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-gray-900">
            RankOn<span className="text-red-600">Geo</span>
          </span>
        </a>
        <div className="flex items-center gap-3">
          {article && (
            <button onClick={copyToClipboard} className="text-sm px-4 py-2 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">
              {copied ? "Copied!" : "Copy Markdown"}
            </button>
          )}
          <button onClick={() => router.push("/dashboard")} className="text-sm px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors">
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
              <h1 className="text-4xl font-black text-gray-900 tracking-tight leading-tight mb-4">{title}</h1>
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <span>~{wordCount.toLocaleString()} words</span>
                <span>·</span>
                <span className="text-emerald-600 font-medium">AI visibility optimized</span>
                <span>·</span>
                <span>Ready to publish</span>
              </div>
            </div>

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
                  blockquote: ({ children }) => <blockquote className="border-l-4 border-stone-200 pl-5 italic text-gray-500 my-5">{children}</blockquote>,
                  code: ({ className, children, ...props }) => {
                    const isBlock = className?.startsWith("language-");
                    const lang = className?.replace("language-", "") ?? "";
                    if (isBlock) {
                      return (
                        <div className="my-5 rounded-xl overflow-hidden border border-gray-800">
                          {lang && (
                            <div className="bg-gray-800 px-4 py-2 text-xs text-gray-400 font-mono">{lang}</div>
                          )}
                          <pre className="bg-gray-950 text-gray-100 px-5 py-4 overflow-x-auto text-sm font-mono leading-6">
                            <code>{children}</code>
                          </pre>
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

            <div className="mt-6 p-5 bg-white rounded-xl border border-stone-200">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">What to do next</p>
              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex items-start gap-3"><span className="text-gray-300 font-mono shrink-0">1.</span>Copy the Markdown and paste it into your blog (WordPress, Notion, Webflow, etc.)</li>
                <li className="flex items-start gap-3"><span className="text-gray-300 font-mono shrink-0">2.</span>Publish it publicly so search engines and AI crawlers can index it</li>
                <li className="flex items-start gap-3"><span className="text-gray-300 font-mono shrink-0">3.</span>Come back in 30 days and re-scan — you should start appearing for this query</li>
              </ol>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <button onClick={copyToClipboard} className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
                {copied ? "Copied!" : "Copy Markdown"}
              </button>
              <button onClick={() => router.push("/dashboard")} className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                Back to dashboard →
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function ArticlePage() {
  return <Suspense><ArticleContent /></Suspense>;
}
