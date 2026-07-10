import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Shared long-form markdown renderer for the public blog and the admin blog
// studio preview. Expects the Signal theme vars (--ink, --rust, --line, …)
// to be scoped on an ancestor, same as app/article/page.tsx.
export function MarkdownArticle({ content }: { content: string }) {
  return (
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
        table: ({ children }) => <div className="overflow-x-auto my-5"><table className="w-full text-sm border-collapse">{children}</table></div>,
        th: ({ children }) => <th className="border border-[var(--line)] bg-[var(--line-soft)] px-3 py-2 text-left font-semibold text-[var(--ink)]">{children}</th>,
        td: ({ children }) => <td className="border border-[var(--line)] px-3 py-2 text-[var(--ink)]/80">{children}</td>,
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
      {content}
    </ReactMarkdown>
  );
}
