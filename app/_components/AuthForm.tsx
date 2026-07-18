"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

type Mode = "signin" | "signup";

export function AuthForm({
  mode,
  onModeChange,
  onSignedIn,
}: {
  mode: Mode;
  // Omit to hide the "switch mode" link (e.g. an inline signup-only gate).
  onModeChange?: (mode: Mode) => void;
  // Fires only when signUp/signInWithPassword returns a live session —
  // signup normally does NOT (Supabase requires email confirmation first),
  // in which case this component shows its own "check your email" message
  // and never calls back.
  onSignedIn: (user: User) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const supabase = createSupabaseBrowserClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError("An account with this email already exists.");
        onModeChange?.("signin");
      } else if (data.session && data.user) {
        onSignedIn(data.user);
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else if (data.user) {
        onSignedIn(data.user);
      }
    }

    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1.5 uppercase tracking-wide">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          required
          className="w-full border border-[var(--line)] bg-[var(--cream)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] transition-shadow focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[var(--ink-soft)] mb-1.5 uppercase tracking-wide">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Min. 6 characters"
          required
          minLength={6}
          className="w-full border border-[var(--line)] bg-[var(--cream)] rounded-lg px-4 py-3 text-sm outline-none text-[var(--ink)] placeholder:text-[var(--ink-faint)] transition-shadow focus:ring-2 focus:ring-[var(--rust)] focus:border-transparent"
        />
      </div>

      {error && (
        <p className="text-xs text-red-700 bg-red-500/10 border border-red-500/25 rounded-lg px-3 py-2">{error}</p>
      )}
      {message && (
        <p className="text-xs text-[var(--rust-deep)] bg-[var(--rust-wash)] border border-[var(--rust)]/25 rounded-lg px-3 py-2">{message}</p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-[var(--rust)] hover:bg-[var(--rust-deep)] disabled:opacity-50 text-[var(--surface)] font-semibold py-3 rounded-full text-sm transition-colors"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-[var(--surface)] border-t-transparent rounded-full animate-spin" />
            {mode === "signup" ? "Creating account..." : "Signing in..."}
          </span>
        ) : mode === "signup" ? "Create free account →" : "Sign in →"}
      </button>

      {onModeChange && (
        <p className="text-sm text-[var(--ink-soft)] text-center">
          {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
          <button
            type="button"
            onClick={() => { onModeChange(mode === "signup" ? "signin" : "signup"); setError(""); setMessage(""); }}
            className="text-[var(--rust)] font-medium hover:underline"
          >
            {mode === "signup" ? "Sign in" : "Sign up free"}
          </button>
        </p>
      )}
    </form>
  );
}
