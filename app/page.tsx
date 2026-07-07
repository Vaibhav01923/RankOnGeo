import type { Metadata } from "next";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import { DomainForm } from "./_components/DomainForm";
import { PricingSection } from "./_components/PricingSection";
import { FAQSection } from "./_components/FAQSection";
import { SiteNav } from "./_components/SiteNav";
import { ScrollReveal } from "./_components/ScrollReveal";
import { InteractiveDemoMockup } from "./_components/InteractiveDemoMockup";
import { NightSky } from "./_components/NightSky";
import { GlobeViz } from "./_components/Scenery";

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

export const metadata: Metadata = {
  title: "RankOnGeo — Track Your Brand in AI Search",
  description:
    "See how ChatGPT, Claude, Gemini, Perplexity, Grok and AI Overviews respond about your brand. Close the gap with research, articles, and publishing.",
};

function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="14" stroke="var(--line)" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6" stroke="var(--rust)" strokeWidth="2" />
      <circle cx="16" cy="16" r="12.5" stroke="var(--rust)" strokeWidth="1.4" strokeDasharray="4 5" transform="rotate(-20 16 16)" />
      <circle cx="26.5" cy="9" r="2.2" fill="var(--olive)" />
    </svg>
  );
}

const ENGINE_NAMES = ["ChatGPT", "Claude", "Gemini", "Perplexity", "Grok", "Google AI Mode", "AI Overviews"];

function EngineMarquee() {
  const set = (hidden: boolean) => (
    <div className="flex items-center" aria-hidden={hidden || undefined}>
      {ENGINE_NAMES.map((n) => (
        <span key={n} className="whitespace-nowrap px-9 font-signal-serif text-[22px] font-[350] italic text-[var(--ink-soft)]">
          {n} <span className="not-italic text-[var(--rust)]/60 text-[13px]">&nbsp;&nbsp;✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <section className="border-y border-[var(--line)] bg-gradient-to-b from-[var(--line-soft)] to-transparent py-8">
      <p className="mb-6 text-center text-[11.5px] font-medium uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        Tracking every answer engine your customers use
      </p>
      <div className="marq-mask">
        <div className="marq-track">
          {set(false)}
          {set(true)}
        </div>
      </div>
    </section>
  );
}

const LOOP_STEPS = [
  { n: "1", title: "Measure", desc: "Composite visibility score across 7 engines, ~60 seconds after you enter your domain." },
  { n: "2", title: "Research", desc: "Generative query mining surfaces every question where AI answers without you." },
  { n: "3", title: "Write", desc: "Source-grounded articles engineered for citation — schema, FAQs and internal links included." },
  { n: "4", title: "Publish", desc: "One click to WordPress, Shopify or Framer. Webhooks and REST API for everything else." },
  { n: "5", title: "Re-measure", desc: "Daily refresh proves the lift — watch citations appear engine by engine." },
];

function LoopSection() {
  return (
    <section id="loop" className="px-6 py-28">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="mx-auto mb-12 max-w-2xl text-center">
            <h2
              className="font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)] sm:text-5xl"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              One loop, running <em className="italic text-[var(--rust)]">while you sleep</em>
            </h2>
            <p className="mt-4 text-[var(--ink-soft)]">
              Measure → Research → Write → Publish → Re-measure. Every stage feeds the next, fully automatic.
            </p>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={80}>
          <div className="mb-14 flex justify-center">
            <span className="inline-flex items-center gap-2.5 rounded-full bg-[var(--rust-wash)] px-5 py-2 text-[13px] text-[var(--rust-deep)]">
              <svg className="spin-slow h-[15px] w-[15px]" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              The loop re-runs daily — no babysitting required
            </span>
          </div>
        </ScrollReveal>
        <div className="relative grid grid-cols-1 gap-9 md:grid-cols-5 md:gap-3">
          <div
            className="absolute left-[33px] top-[5%] bottom-[5%] w-px md:inset-x-[9%] md:top-[33px] md:bottom-auto md:h-px md:w-auto"
            style={{
              background: "repeating-linear-gradient(90deg, oklch(0.19 0.014 55 / 20%) 0 6px, transparent 6px 14px)",
            }}
            aria-hidden="true"
          />
          {LOOP_STEPS.map((s, i) => (
            <ScrollReveal key={s.n} delay={i * 90}>
              <div className="group relative grid grid-cols-[66px_1fr] items-start gap-5 text-left md:block md:px-2.5 md:text-center">
                <div className="relative z-[1] flex h-[66px] w-[66px] items-center justify-center rounded-full bg-[var(--rust-wash)] font-signal-serif text-2xl italic text-[var(--rust-deep)] transition-all duration-500 group-hover:-translate-y-1 group-hover:bg-[var(--rust)] group-hover:text-[var(--surface)] md:mx-auto md:mb-5">
                  {s.n}
                </div>
                <div>
                  <h3 className="mb-2 text-[16.5px] font-semibold text-[var(--ink)]">{s.title}</h3>
                  <p className="text-[13.5px] leading-relaxed text-[var(--ink-soft)]">{s.desc}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureBento() {
  const ranks = [
    { rank: 1, domain: "acmecorp.com", you: true, pct: 74, delta: "+4.2" },
    { rank: 2, domain: "evernote.com", pct: 52, delta: "-1.1" },
    { rank: 3, domain: "obsidian.md", pct: 48, delta: "+0.3" },
    { rank: 4, domain: "roamresearch.com", pct: 31, delta: "-2.4" },
  ] as { rank: number; domain: string; you?: boolean; pct: number; delta: string }[];

  const gaps = [
    { q: "best note app for ADHD", score: 84 },
    { q: "notion vs obsidian for engineers", score: 91 },
    { q: "how to write second brain", score: 76 },
    { q: "is notion losing to obsidian", score: 88 },
  ];

  const outline = ["TL;DR", "The five engines", "Why GEO ≠ SEO", "Citation hierarchy"];

  const destinations = [
    { dest: "WordPress", detail: "/blog/why-geo-is-not-seo", status: "published" },
    { dest: "Shopify", detail: "/blogs/news/why-geo", status: "published" },
    { dest: "Framer", detail: "Scheduled · 15:00 UTC", status: "scheduled" },
    { dest: "Webhook", detail: "REST · custom endpoint", status: "published" },
  ];

  const panel =
    "rounded-3xl bg-[var(--surface)] border border-[var(--line)] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-[var(--rust)]/30";

  return (
    <section id="platform" className="px-6 pb-28">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl pb-14 pt-20 text-center">
            <h2
              className="mb-4 font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)] sm:text-5xl"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              Everything between <em className="italic text-[var(--rust)]">invisible</em> and{" "}
              <em className="italic text-[var(--rust)]">cited</em>
            </h2>
            <p className="mx-auto max-w-lg text-[var(--ink-soft)]">
              Monitoring tools tell you you&apos;re losing. RankOnGeo does something about it.
            </p>
          </div>
        </ScrollReveal>

        <div className="space-y-5">
          <ScrollReveal>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
              <div className={`${panel} md:col-span-2`}>
                <h3 className="mb-5 font-signal-serif text-2xl font-[400] leading-tight text-[var(--ink)]">
                  See exactly where AI ranks your brand.
                </h3>
                <div className="space-y-2">
                  {ranks.map((r) => (
                    <div
                      key={r.domain}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                        r.you ? "bg-[var(--rust-wash)]" : "bg-[var(--line-soft)]"
                      }`}
                    >
                      <span className="w-3 shrink-0 text-[10px] text-[var(--ink-faint)]">{r.rank}</span>
                      <span className={`min-w-0 flex-1 truncate text-xs ${r.you ? "font-semibold text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}>
                        {r.domain}
                        {r.you && (
                          <span className="ml-2 rounded bg-[var(--rust)] px-1.5 py-0.5 text-[8px] font-bold text-[var(--surface)]">YOU</span>
                        )}
                      </span>
                      <div className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-[var(--line)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${r.pct}%`,
                            background: r.you ? "var(--rust)" : "var(--ink-faint)",
                          }}
                        />
                      </div>
                      <span className="w-8 shrink-0 text-right text-[11px] font-medium text-[var(--ink-soft)]">{r.pct}%</span>
                      <span className={`w-8 shrink-0 text-right text-[10px] ${r.delta.startsWith("+") ? "text-[var(--olive)]" : "text-red-600"}`}>
                        {r.delta}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {["ChatGPT", "Claude", "Gemini", "Perplexity", "Grok", "AI Overviews"].map((e) => (
                    <span key={e} className="rounded-full bg-[var(--line-soft)] px-2 py-0.5 text-[9px] text-[var(--ink-faint)]">
                      {e}
                    </span>
                  ))}
                </div>
              </div>

              <div className={`${panel} flex flex-col`}>
                <div className="font-signal-mono text-6xl font-semibold leading-none text-[var(--ink)]">7</div>
                <div className="mb-6 mt-1 text-sm text-[var(--ink-soft)]">AI engines tracked</div>
                <div className="mt-auto flex flex-wrap gap-x-4 gap-y-2.5">
                  {ENGINE_NAMES.map((e) => (
                    <span key={e} className="text-[12px] font-medium text-[var(--ink-faint)]">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={100}>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
              <div className="flex min-h-[220px] flex-col justify-between rounded-3xl bg-gradient-to-b from-[var(--rust-wash)] to-[var(--surface)] border border-[var(--rust)]/20 p-6">
                <span className="text-[13px] text-[var(--rust-deep)]">Time to first data</span>
                <div>
                  <div className="mt-3 font-signal-mono text-6xl font-semibold leading-none text-[var(--rust)]">~60s</div>
                  <div className="mt-2 text-sm leading-snug text-[var(--ink-soft)]">domain entry to first visibility score</div>
                </div>
                <div className="mt-2 text-[11px] text-[var(--ink-faint)]">Free · no card required</div>
              </div>

              <div className={panel}>
                <h3 className="mb-4 font-signal-serif text-xl font-[400] leading-tight text-[var(--ink)]">Mine the gaps AI is about to fill.</h3>
                <div className="space-y-2">
                  {gaps.map((r) => (
                    <div key={r.q} className="flex items-center gap-2 border-b border-[var(--line)] py-1 last:border-0">
                      <span className="flex-1 truncate text-[11px] text-[var(--ink-soft)]">{r.q}</span>
                      <span className="shrink-0 text-[11px] font-semibold text-[var(--rust-deep)]">{r.score}%</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 text-[10px] text-[var(--ink-faint)]">AI overlap score · 247 gaps found</div>
              </div>

              <div className={panel}>
                <h3 className="mb-4 font-signal-serif text-xl font-[400] leading-tight text-[var(--ink)]">Write what citation engines quote.</h3>
                <div className="rounded-xl bg-[var(--line-soft)] p-3.5 text-[10px]">
                  <div className="mb-2 text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">Outline · 1,840 / 2,400 words</div>
                  {outline.map((s, i) => (
                    <div key={s} className="flex gap-2 py-0.5">
                      <span className="text-[var(--ink-faint)]/60">{i + 1}.</span>
                      <span className="text-[var(--ink-soft)]">{s}</span>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center gap-1.5 border-t border-[var(--line)] pt-2">
                    <span className="animate-pulse text-[var(--rust)] motion-reduce:animate-none" aria-hidden="true">▋</span>
                    <span className="text-[var(--ink-faint)]">Writing claim-dense passage…</span>
                  </div>
                </div>
              </div>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className={panel}>
              <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
                <div className="shrink-0 sm:w-56">
                  <h3 className="font-signal-serif text-2xl font-[400] leading-snug text-[var(--ink)]">
                    Publish once.
                    <br />
                    Structured for citation.
                  </h3>
                </div>
                <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
                  {destinations.map((r) => (
                    <div key={r.dest} className="rounded-xl bg-[var(--line-soft)] p-3">
                      <div className="mb-0.5 text-xs font-semibold text-[var(--ink)]/90">{r.dest}</div>
                      <div className="mb-2 truncate text-[9px] text-[var(--ink-faint)]">{r.detail}</div>
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                          r.status === "published" ? "bg-[var(--olive-wash)] text-[var(--olive)]" : "bg-blue-500/10 text-blue-700"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}

function GlobeSection() {
  return (
    <section
      className="overflow-hidden px-6 py-28"
      style={{
        background: "linear-gradient(180deg, var(--cream) 0%, var(--surface) 50%, var(--cream) 100%)",
      }}
    >
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 lg:grid-cols-2">
        <ScrollReveal>
          <div>
            <h2
              className="font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)] sm:text-5xl"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              Cited everywhere your customers <em className="italic text-[var(--rust)]">ask</em>
            </h2>
            <p className="mb-9 mt-5 max-w-md text-[16px] text-[var(--ink-soft)]">
              AI engines answer millions of buying questions every hour, in every market. RankOnGeo watches those
              answers around the clock — and makes sure your brand is the one they reach for.
            </p>
            <div className="grid grid-cols-2 gap-3.5">
              {[
                { b: "7", s: "AI engines tracked, from ChatGPT to AI Overviews" },
                { b: "~60s", s: "to your first visibility score. No credit card." },
                { b: "Daily", s: "refresh cycles on Business & Scale plans" },
                { b: "25", s: "competitor brands tracked side-by-side" },
              ].map((st) => (
                <div
                  key={st.b}
                  className="rounded-2xl bg-[var(--surface)] border border-[var(--line)] px-5 py-5 transition-all duration-400 hover:-translate-y-0.5 hover:border-[var(--rust)]/30"
                >
                  <span className="block font-signal-mono text-3xl font-semibold leading-tight text-[var(--ink)]">{st.b}</span>
                  <span className="mt-1.5 block text-[13px] text-[var(--ink-soft)]">{st.s}</span>
                </div>
              ))}
            </div>
          </div>
        </ScrollReveal>
        <ScrollReveal delay={140}>
          <div className="mx-auto w-full max-w-[480px]">
            <GlobeViz />
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

export default function LandingPage() {
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
      id="top"
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} min-h-screen bg-[var(--cream)] text-[var(--ink)]`}
      style={{ ...signalVars, fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-[var(--rust)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--surface)]"
      >
        Skip to content
      </a>

      <SiteNav />

      <main id="main-content">
        {/* HERO */}
        <section
          className="relative overflow-hidden pb-10"
          style={{
            background:
              "radial-gradient(90% 60% at 70% -5%, oklch(0.56 0.15 38 / 7%), transparent 60%), radial-gradient(70% 50% at 15% 10%, oklch(0.52 0.1 130 / 6%), transparent 65%), var(--cream)",
          }}
        >
          <NightSky />

          <div className="relative z-[5] mx-auto max-w-4xl px-6 pt-40 text-center max-md:pt-32">
            <h1
              className="rise mx-auto mb-6 mt-8 font-signal-serif font-[340] leading-[1.08] tracking-[-0.015em] text-[var(--ink)]"
              style={{ fontSize: "clamp(2.6rem, 6vw, 4.6rem)", textWrap: "balance", "--d": ".18s" } as React.CSSProperties}
            >
              The internet asks AI first.
              <br />
              Make sure it answers <em className="italic text-[var(--rust)]">with you.</em>
            </h1>
            <p
              className="rise mx-auto mb-10 max-w-xl text-[var(--ink-soft)]"
              style={{ fontSize: "clamp(1.02rem, 1.6vw, 1.15rem)", "--d": ".32s" } as React.CSSProperties}
            >
              See exactly what <strong className="font-medium text-[var(--ink)]">ChatGPT, Claude, Gemini, Perplexity and Grok</strong>{" "}
              say about your brand — then close the gaps with research, articles, and one-click publishing.
            </p>
            <div className="rise mx-auto mb-5 max-w-xl" style={{ "--d": ".46s" } as React.CSSProperties}>
              <DomainForm variant="hero" />
            </div>
            <p className="rise flex items-center justify-center gap-2 text-[13.5px] text-[var(--ink-faint)]" style={{ "--d": ".58s" } as React.CSSProperties}>
              <svg className="h-3.5 w-3.5 opacity-80" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 1.5l1.9 3.9 4.3.6-3.1 3 .7 4.2L8 11.2l-3.8 2 .7-4.2-3.1-3 4.3-.6L8 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" />
              </svg>
              Free visibility score in ~60 seconds &nbsp;·&nbsp; No credit card
            </p>
          </div>

          {/* INTERACTIVE DEMO — the real dashboard, click around */}
          <div className="rise relative z-[6] mx-auto mt-16 max-w-5xl overflow-x-auto px-6 pb-28" style={{ "--d": ".7s" } as React.CSSProperties}>
            <InteractiveDemoMockup />
          </div>
        </section>

        <EngineMarquee />

        <LoopSection />

        <FeatureBento />

        <GlobeSection />

        <PricingSection />

        <FAQSection />

        {/* BOTTOM CTA */}
        <section
          className="relative overflow-hidden px-6 py-32 text-center"
          style={{
            background: "linear-gradient(180deg, var(--surface) 0%, var(--cream) 60%, var(--surface) 100%)",
          }}
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            {[
              [8, 22, 0.9], [16, 68, 0.5], [24, 14, 0.7], [33, 80, 0.4], [42, 30, 0.8], [51, 60, 0.5],
              [58, 12, 0.6], [67, 74, 0.9], [76, 26, 0.5], [84, 64, 0.7], [91, 18, 0.6], [95, 48, 0.4],
            ].map(([x, y, o], i) => (
              <span
                key={i}
                className="tw absolute h-0.5 w-0.5 rounded-full bg-[var(--rust)]"
                style={{ left: `${x}%`, top: `${y}%`, opacity: (o as number) * 0.4, animationDelay: `-${(i * 0.4) % 3}s` }}
              />
            ))}
          </div>
          <ScrollReveal>
            <h2
              className="mx-auto mb-5 max-w-2xl font-signal-serif text-4xl font-[350] tracking-tight text-[var(--ink)] sm:text-5xl"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              Your customers already asked.
              <br />
              <em className="italic text-[var(--rust)]">See what the AI told them.</em>
            </h2>
            <p className="mx-auto mb-10 max-w-md text-[var(--ink-soft)]">
              Free visibility score in ~60 seconds. No credit card, no sales call.
            </p>
            <div className="mx-auto mb-5 max-w-md">
              <DomainForm variant="cta" />
            </div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--ink-faint)]">
              Free analysis · Paid plans track up to 7 engines · Results in ~60s
            </p>
          </ScrollReveal>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-16 text-[var(--ink)]">
        <div className="mx-auto mb-12 grid max-w-6xl grid-cols-2 gap-8 md:grid-cols-5">
          <div className="col-span-2">
            <div className="mb-3 flex items-center gap-2.5">
              <LogoMark />
              <span className="text-lg font-semibold tracking-tight">RankOnGeo</span>
            </div>
            <p className="mb-5 max-w-[240px] text-sm text-[var(--ink-faint)]">
              Track where AI ranks your brand — and close the gaps automatically.
            </p>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--olive-wash)] px-3.5 py-1.5 text-xs text-[var(--olive)]">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-[var(--olive)]" aria-hidden="true" />
              All systems operational
            </span>
          </div>
          <div>
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">Product</div>
            <div className="space-y-2.5">
              {["Visibility", "Research", "Generation", "Publishing", "Pricing", "Blog"].map((l) => (
                <a key={l} href={l === "Pricing" ? "#pricing" : "#platform"} className="block rounded text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--rust)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">
                  {l}
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">Integrations</div>
            <div className="space-y-2.5">
              {["WordPress", "Shopify", "Framer", "Webhooks", "REST API"].map((l) => (
                <a key={l} href="#" className="block rounded text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--rust)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">
                  {l}
                </a>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-4 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-faint)]">Resources</div>
            <div className="space-y-2.5">
              {(
                [["Free visibility audit", true], ["Methodology", false], ["GEO playbook", false]] as [string, boolean][]
              ).map(([l, free]) => (
                <a key={l} href={free ? "/audit" : "#"} className="flex items-center gap-1.5 rounded text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--rust)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">
                  {l}
                  {free && <span className="rounded bg-[var(--rust)] px-1 text-[9px] font-bold text-[var(--surface)]">free</span>}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 border-t border-[var(--line)] pt-6 text-xs text-[var(--ink-faint)] sm:flex-row">
          <span>© 2026 RankOnGeo. Grown under a night sky.</span>
          <div className="flex gap-4">
            {["Privacy", "Terms", "DPA", "Security"].map((l) => (
              <a key={l} href="#" className="rounded transition-colors hover:text-[var(--rust)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">
                {l}
              </a>
            ))}
          </div>
          <div className="flex gap-4">
            {["Twitter", "LinkedIn", "GitHub"].map((s) => (
              <a key={s} href="#" className="rounded transition-colors hover:text-[var(--rust)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--rust)]">
                {s}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}
