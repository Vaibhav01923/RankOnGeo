"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase";

function AuthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  const [mode, setMode] = useState<"signin" | "signup">(searchParams.get("mode") === "signin" ? "signin" : "signup");
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
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setError(error.message);
      } else if (data.user && data.user.identities && data.user.identities.length === 0) {
        setError("An account with this email already exists.");
        setMode("signin");
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
    <div
      className="min-h-screen flex flex-col bg-background"
      style={{
        background:
          "radial-gradient(70% 50% at 50% -10%, rgba(20,80,72,.3), transparent 60%), linear-gradient(180deg,#02080a 0%,#040d0a 60%,#041209 100%)",
      }}
    >
      <nav className="px-8 py-4 border-b border-line">
        <a href="/" className="flex items-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="6" stroke="#8cf5c3" strokeWidth="2.5" />
            <circle cx="16" cy="16" r="12.5" stroke="#8cf5c3" strokeWidth="1.8" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
            <circle cx="26.5" cy="9" r="2.5" fill="#ffb469" />
          </svg>
          <span className="text-lg font-bold tracking-tight text-ink">
            RankOn<span className="text-mint">Geo</span>
          </span>
        </a>
      </nav>

      <div className="flex-1 flex items-center justify-center px-4 py-16 relative">
        {/* faint starfield */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          {[
            [6, 18, 0.7], [14, 62, 0.4], [22, 30, 0.6], [31, 78, 0.35], [39, 12, 0.55],
            [48, 45, 0.3], [57, 70, 0.5], [66, 22, 0.65], [74, 55, 0.4], [82, 15, 0.6],
            [89, 68, 0.45], [94, 35, 0.55],
          ].map(([x, y, o], i) => (
            <span
              key={i}
              className="tw absolute h-0.5 w-0.5 rounded-full bg-[#dfeee6]"
              style={{ left: `${x}%`, top: `${y}%`, opacity: o, animationDelay: `-${(i * 0.45) % 3}s` }}
            />
          ))}
        </div>

        <div className="w-full max-w-sm relative">
          <div className="rounded-3xl bg-gradient-to-b from-white/[0.05] to-white/[0.015] p-8 shadow-[inset_0_1px_0_rgba(234,246,238,0.1),inset_0_0_0_1px_rgba(234,246,238,0.07),0_40px_90px_-30px_rgba(0,0,0,0.8),0_0_100px_-40px_rgba(60,200,150,0.3)] backdrop-blur-xl">
          <h1 className="font-serif text-3xl font-[350] text-ink mb-2 tracking-tight">
            {mode === "signup" ? "Create your account" : "Welcome back"}
          </h1>
          <p className="text-sm text-muted mb-8">
            {mode === "signup"
              ? "Start tracking your brand's AI visibility for free."
              : "Sign in to access your dashboard."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="w-full bg-white/[0.04] rounded-lg px-4 py-3 text-sm text-ink outline-none shadow-[inset_0_0_0_1px_rgba(234,246,238,0.12)] placeholder:text-faint transition-shadow focus:shadow-[inset_0_0_0_1px_rgba(140,245,195,0.45)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1.5 uppercase tracking-wide">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 6 characters"
                required
                minLength={6}
                className="w-full bg-white/[0.04] rounded-lg px-4 py-3 text-sm text-ink outline-none shadow-[inset_0_0_0_1px_rgba(234,246,238,0.12)] placeholder:text-faint transition-shadow focus:shadow-[inset_0_0_0_1px_rgba(140,245,195,0.45)]"
              />
            </div>

            {error && (
              <p className="text-xs text-rose bg-rose/10 border border-rose/25 rounded-lg px-3 py-2">{error}</p>
            )}
            {message && (
              <p className="text-xs text-mint bg-mint/10 border border-mint/25 rounded-lg px-3 py-2">{message}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-b from-[#a5f8d1] to-[#6fe9b2] disabled:opacity-50 text-[#04241a] font-semibold py-3 rounded-full text-sm shadow-[0_0_0_1px_rgba(140,245,195,0.25),0_8px_30px_-6px_rgba(80,230,170,0.35)] transition-all hover:shadow-[0_0_0_1px_rgba(140,245,195,0.4),0_14px_40px_-6px_rgba(80,230,170,0.5)]"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#04241a] border-t-transparent rounded-full animate-spin" />
                  {mode === "signup" ? "Creating account..." : "Signing in..."}
                </span>
              ) : mode === "signup" ? "Create free account →" : "Sign in →"}
            </button>
          </form>

          <p className="text-sm text-muted text-center mt-6">
            {mode === "signup" ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setMessage(""); }}
              className="text-mint font-medium hover:underline"
            >
              {mode === "signup" ? "Sign in" : "Sign up free"}
            </button>
          </p>
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-faint">
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.2l-3.8 2 .7-4.2-3.1-3 4.3-.6L8 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
            </svg>
            Free visibility score in ~60 seconds · No credit card
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
