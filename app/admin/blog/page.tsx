"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { MarkdownArticle } from "../../_components/MarkdownArticle";
import type { BlogPost } from "@/lib/blog";

type EditorState = {
  id: string | null;
  title: string;
  slug: string;
  description: string;
  tags: string;
  coverImageUrl: string;
  content: string;
  status: "draft" | "published";
};

const EMPTY_EDITOR: EditorState = {
  id: null,
  title: "",
  slug: "",
  description: "",
  tags: "",
  coverImageUrl: "",
  content: "",
  status: "draft",
};

function slugifyClient(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function toEditor(post: BlogPost): EditorState {
  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    description: post.description,
    tags: post.tags.join(", "),
    coverImageUrl: post.cover_image_url ?? "",
    content: post.content,
    status: post.status,
  };
}

export default function AdminBlogPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [genTopic, setGenTopic] = useState("");
  const [genKeywords, setGenKeywords] = useState("");
  const [genNotes, setGenNotes] = useState("");

  const loadPosts = useCallback(async () => {
    const res = await fetch("/api/admin/blog");
    if (!res.ok) return;
    const { posts } = await res.json();
    setPosts(posts);
  }, []);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/check");
      const { isAdmin } = await res.json();
      setIsAdmin(isAdmin);
      if (isAdmin) loadPosts();
    })();
  }, [loadPosts]);

  const flash = (msg: string) => {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 3500);
  };

  const fail = async (res: Response) => {
    const body = await res.json().catch(() => ({}));
    setError(body.error ?? `Request failed (${res.status})`);
    setNotice(null);
  };

  const openEditor = (post?: BlogPost) => {
    setEditor(post ? toEditor(post) : { ...EMPTY_EDITOR });
    setSlugTouched(!!post);
    setPreview(false);
    setError(null);
  };

  const setField = <K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setEditor((e) => {
      if (!e) return e;
      const next = { ...e, [key]: value };
      if (key === "title" && !slugTouched) next.slug = slugifyClient(value as string);
      return next;
    });
  };

  const editorPayload = (e: EditorState) => ({
    title: e.title,
    slug: e.slug,
    description: e.description,
    content: e.content,
    tags: e.tags.split(",").map((t) => t.trim()).filter(Boolean),
    cover_image_url: e.coverImageUrl,
  });

  const save = async (status?: "draft" | "published") => {
    if (!editor) return;
    setBusy("save");
    setError(null);
    try {
      const payload = { ...editorPayload(editor), status: status ?? editor.status };
      const res = editor.id
        ? await fetch(`/api/admin/blog/${editor.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/blog", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) return fail(res);
      const { post } = await res.json();
      setEditor(toEditor(post));
      setSlugTouched(true);
      await loadPosts();
      flash(
        payload.status === "published"
          ? `Published — live at /blog/${post.slug}`
          : "Draft saved"
      );
    } finally {
      setBusy(null);
    }
  };

  const unpublish = async () => {
    if (!editor?.id) return;
    setBusy("save");
    try {
      const res = await fetch(`/api/admin/blog/${editor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!res.ok) return fail(res);
      const { post } = await res.json();
      setEditor(toEditor(post));
      await loadPosts();
      flash("Unpublished — back to draft");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (post: BlogPost) => {
    if (!window.confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setBusy(`delete-${post.id}`);
    try {
      const res = await fetch(`/api/admin/blog/${post.id}`, { method: "DELETE" });
      if (!res.ok) return fail(res);
      if (editor?.id === post.id) setEditor(null);
      await loadPosts();
      flash("Post deleted");
    } finally {
      setBusy(null);
    }
  };

  const autofill = async () => {
    if (!editor?.content.trim()) return;
    setBusy("autofill");
    setError(null);
    try {
      const res = await fetch("/api/admin/blog/autofill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editor.title, content: editor.content }),
      });
      if (!res.ok) return fail(res);
      const { description, tags } = await res.json();
      setEditor((e) => (e ? { ...e, description, tags: (tags as string[]).join(", ") } : e));
      flash("Meta description & tags filled from the article");
    } finally {
      setBusy(null);
    }
  };

  const generate = async () => {
    if (!genTopic.trim()) return;
    setBusy("generate");
    setError(null);
    try {
      const res = await fetch("/api/admin/blog/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: genTopic, keywords: genKeywords, notes: genNotes }),
      });
      if (!res.ok) return fail(res);
      const draft = await res.json();
      setEditor({
        id: null,
        title: draft.title,
        slug: draft.slug,
        description: draft.description,
        tags: (draft.tags as string[]).join(", "),
        coverImageUrl: "",
        content: draft.content,
        status: "draft",
      });
      setSlugTouched(true);
      setPreview(true);
      flash(`Generated ~${draft.wordCount} words — review, edit, then publish`);
    } finally {
      setBusy(null);
    }
  };

  if (isAdmin === null) {
    return <div className="px-6 py-24 text-center text-sm text-[var(--ink-faint)]">Checking access…</div>;
  }

  if (!isAdmin) {
    return (
      <div className="px-6 py-24 text-center">
        <p className="font-signal-serif text-2xl text-[var(--ink)]">Not authorized</p>
        <p className="mt-2 text-sm text-[var(--ink-soft)]">
          This area is for RankOnGeo admins. <Link href="/" className="text-[var(--rust)] underline">Back home</Link>
        </p>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3.5 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--rust)]/50 focus:ring-2 focus:ring-[var(--rust)]/20";
  const labelCls = "mb-1.5 block text-xs font-semibold text-[var(--ink-soft)]";
  const btnPrimary =
    "rounded-full bg-[var(--rust)] px-5 py-2 text-sm font-semibold text-[var(--surface)] transition-colors hover:bg-[var(--rust-deep)] disabled:opacity-50";
  const btnGhost =
    "rounded-full border border-[var(--line)] px-5 py-2 text-sm font-medium text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)] hover:border-[var(--ink-faint)] disabled:opacity-50";

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--rust)]">Admin</p>
          <h1 className="font-signal-serif text-3xl font-[350] tracking-tight text-[var(--ink)]">Blog studio</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/blog" className={btnGhost}>View public blog →</Link>
          <button onClick={() => openEditor()} className={btnPrimary}>New post</button>
        </div>
      </header>

      {(notice || error) && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            error
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-[var(--olive)]/30 bg-[var(--olive-wash)] text-[var(--olive)]"
          }`}
        >
          {error ?? notice}
        </div>
      )}

      {/* Generate panel */}
      <section className="mb-10 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
        <h2 className="mb-1 text-sm font-semibold text-[var(--ink)]">Generate a draft with AI</h2>
        <p className="mb-4 text-xs text-[var(--ink-faint)]">
          gpt-4o-mini drafts it, you review and publish. Nothing goes live without you.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls} htmlFor="gen-topic">Topic *</label>
            <input
              id="gen-topic"
              className={inputCls}
              placeholder="e.g. How to get your SaaS recommended by ChatGPT"
              value={genTopic}
              onChange={(e) => setGenTopic(e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="gen-keywords">Target keywords (optional)</label>
            <input
              id="gen-keywords"
              className={inputCls}
              placeholder="e.g. AI SEO, GEO, ChatGPT recommendations"
              value={genKeywords}
              onChange={(e) => setGenKeywords(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls} htmlFor="gen-notes">Editorial notes (optional)</label>
            <input
              id="gen-notes"
              className={inputCls}
              placeholder="Angle, examples to include, tone…"
              value={genNotes}
              onChange={(e) => setGenNotes(e.target.value)}
            />
          </div>
        </div>
        <button onClick={generate} disabled={busy === "generate" || !genTopic.trim()} className={`${btnPrimary} mt-4`}>
          {busy === "generate" ? "Generating… (~30s)" : "Generate draft"}
        </button>
      </section>

      {/* Editor */}
      {editor && (
        <section className="mb-10 rounded-2xl border-2 border-[var(--rust)]/25 bg-[var(--surface)] p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-[var(--ink)]">
              {editor.id ? "Edit post" : "New post"}
              <span
                className={`ml-3 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                  editor.status === "published"
                    ? "bg-[var(--olive-wash)] text-[var(--olive)]"
                    : "bg-[var(--rust-wash)] text-[var(--rust-deep)]"
                }`}
              >
                {editor.status}
              </span>
            </h2>
            <button onClick={() => setEditor(null)} className="text-xs text-[var(--ink-faint)] hover:text-[var(--ink)]">
              Close ✕
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="post-title">Title</label>
              <input id="post-title" className={inputCls} value={editor.title} onChange={(e) => setField("title", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="post-slug">Slug — /blog/…</label>
              <input
                id="post-slug"
                className={`${inputCls} font-signal-mono`}
                value={editor.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setField("slug", e.target.value);
                }}
              />
            </div>
            <div className="md:col-span-2">
              <div className="flex items-center justify-between">
                <label className={labelCls} htmlFor="post-desc">
                  Meta description{" "}
                  <span className={editor.description.length > 160 ? "text-red-600" : "text-[var(--ink-faint)]"}>
                    ({editor.description.length}/155)
                  </span>
                </label>
                <button
                  onClick={autofill}
                  disabled={busy === "autofill" || !editor.content.trim()}
                  className="mb-1.5 text-xs font-medium text-[var(--rust)] hover:text-[var(--rust-deep)] disabled:opacity-50"
                >
                  {busy === "autofill" ? "Autofilling…" : "✨ Autofill description & tags"}
                </button>
              </div>
              <input id="post-desc" className={inputCls} value={editor.description} onChange={(e) => setField("description", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="post-tags">Tags (comma-separated)</label>
              <input id="post-tags" className={inputCls} value={editor.tags} onChange={(e) => setField("tags", e.target.value)} />
            </div>
            <div>
              <label className={labelCls} htmlFor="post-cover">Cover image URL (optional)</label>
              <input
                id="post-cover"
                className={inputCls}
                placeholder="Blank = generated night-sky cover art"
                value={editor.coverImageUrl}
                onChange={(e) => setField("coverImageUrl", e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <label className={labelCls} htmlFor="post-content">Content (markdown)</label>
              <button
                onClick={() => setPreview(!preview)}
                className="text-xs font-medium text-[var(--rust)] hover:text-[var(--rust-deep)]"
              >
                {preview ? "✎ Edit markdown" : "◉ Preview"}
              </button>
            </div>
            {preview ? (
              <div className="max-h-[560px] overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--cream)] px-6 py-5">
                <h1 className="font-signal-serif mb-5 text-3xl font-[350] text-[var(--ink)]">{editor.title}</h1>
                <MarkdownArticle content={editor.content} />
              </div>
            ) : (
              <textarea
                id="post-content"
                className={`${inputCls} min-h-[420px] resize-y font-signal-mono leading-relaxed`}
                value={editor.content}
                onChange={(e) => setField("content", e.target.value)}
                spellCheck={false}
              />
            )}
            <p className="mt-1.5 text-xs text-[var(--ink-faint)]">
              {editor.content.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={() => save()} disabled={busy === "save" || !editor.title.trim()} className={btnGhost}>
              {busy === "save" ? "Saving…" : "Save"}
            </button>
            {editor.status === "draft" ? (
              <button onClick={() => save("published")} disabled={busy === "save" || !editor.title.trim()} className={btnPrimary}>
                Publish
              </button>
            ) : (
              <>
                <button onClick={unpublish} disabled={busy === "save"} className={btnGhost}>
                  Unpublish
                </button>
                <a
                  href={`/blog/${editor.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="self-center text-sm text-[var(--rust)] underline underline-offset-2"
                >
                  View live ↗
                </a>
              </>
            )}
          </div>
        </section>
      )}

      {/* Post list */}
      <section>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">
          All posts ({posts.length})
        </h2>
        {posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line)] px-6 py-10 text-center text-sm text-[var(--ink-faint)]">
            No posts yet — generate one above or start from scratch.
          </p>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <div
                key={post.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-5 py-3.5"
              >
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    post.status === "published"
                      ? "bg-[var(--olive-wash)] text-[var(--olive)]"
                      : "bg-[var(--rust-wash)] text-[var(--rust-deep)]"
                  }`}
                >
                  {post.status}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{post.title}</p>
                  <p className="truncate text-xs text-[var(--ink-faint)]">/blog/{post.slug}</p>
                </div>
                <button onClick={() => openEditor(post)} className="text-xs font-medium text-[var(--rust)] hover:text-[var(--rust-deep)]">
                  Edit
                </button>
                <button
                  onClick={() => remove(post)}
                  disabled={busy === `delete-${post.id}`}
                  className="text-xs font-medium text-[var(--ink-faint)] hover:text-red-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
