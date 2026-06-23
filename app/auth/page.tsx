"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    // If already logged in, redirect
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) router.replace(redirect);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else {
        setMessage("Check your email to confirm your account, then sign in.");
        setMode("signin");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
      } else {
        router.replace(redirect);
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#f5ede3] flex flex-col">
      <nav className="px-8 py-4 border-b border-stone-200">
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
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-black text-gray-900 mb-1 tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-gray-500 mb-8">
            {mode === "signup"
              ? "Start tracking your brand's AI visibility for free."
              : "Sign in to access your dashboard."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5 uppercase tracking-wide">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
                className="w-full bg-white border border-stone-200 rounded-lg px-4 py-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-red-400 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
            )}
            {message && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold py-3 rounded-lg text-sm transition-colors"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  {mode === "signup" ? "Creating account..." : "Signing in..."}
                </span>
              ) : mode === "signup" ? "Create free account →" : "Sign in →"}
            </button>
          </form>

          <p className="text-sm text-gray-500 text-center mt-6">
            {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setMessage(""); }}
              className="text-red-600 font-medium hover:underline"
            >
              {mode === "signup" ? "Sign in" : "Sign up free"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense>
      <AuthContent />
    </Suspense>
  );
}
