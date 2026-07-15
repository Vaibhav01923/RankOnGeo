import type { Metadata } from "next";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import AuditWidget from "./AuditWidget";
import { WebPageJsonLd } from "../_components/WebPageJsonLd";

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

const DESCRIPTION =
  "Free AI visibility audit — see what ChatGPT, Claude, Gemini, Perplexity, and Google AI say about your brand today, and which keyword opportunities they're missing.";

export const metadata: Metadata = {
  title: "Free AI Visibility Audit — See What ChatGPT Says About Your Brand",
  description: DESCRIPTION,
  alternates: { canonical: "/audit" },
};

const STEPS = [
  { n: "1", title: "Crawl", desc: "We fetch your homepage and a few linked pages to understand your brand, niche, and target audience." },
  { n: "2", title: "Extract", desc: "We identify your name, description, target audience, and real competitors directly from your site." },
  { n: "3", title: "Analyze", desc: "We surface keyword opportunities — the questions people ask AI about businesses like yours — scored by intent and difficulty." },
  { n: "4", title: "Draft", desc: "We outline a full article targeting your best opportunity, ready to generate and publish if you sign up." },
];

const FAQ = [
  {
    q: "Is this actually free?",
    a: "Yes. The audit runs once per domain with no account and no credit card. You'll see your opportunity score, competitor comparison, and a draft article outline immediately.",
  },
  {
    q: "Do I need to create an account first?",
    a: "No — enter a domain above and the audit runs immediately. You only need an account if you want to track your real AI visibility score over time and publish the generated articles.",
  },
  {
    q: "How long does it take?",
    a: "About 60 seconds from entering your domain to seeing your first results.",
  },
  {
    q: "What exactly do you check?",
    a: "We check what ChatGPT, Claude, Gemini, Perplexity, and Google AI say when asked questions relevant to your brand and niche, then identify the specific queries where competitors show up and you don't.",
  },
];

export default function AuditPage() {
  return (
    <div className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} min-h-screen bg-[var(--cream)] text-[var(--ink)]`} style={{ fontFamily: "var(--font-work-sans), sans-serif" }}>
      <WebPageJsonLd name="Free AI Visibility Audit" description={DESCRIPTION} path="/audit" />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 pt-16 pb-10 text-center">
        <h1 className="font-signal-serif text-4xl sm:text-5xl leading-tight mb-4 text-[var(--ink)]" style={{ letterSpacing: "-0.02em" }}>
          Free AI visibility audit
        </h1>
        <p className="text-[var(--ink-soft)] text-base max-w-xl mx-auto">
          {DESCRIPTION}
        </p>
      </div>

      <AuditWidget />

      <div className="max-w-3xl mx-auto px-5 sm:px-8 py-16 border-t border-[var(--line)]">
        <h2 className="font-signal-serif text-2xl text-[var(--ink)] tracking-tight mb-8 text-center">How the audit works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-16">
          {STEPS.map((s) => (
            <div key={s.n} className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--rust-wash)] text-[var(--rust-deep)] flex items-center justify-center text-sm font-bold shrink-0 font-signal-mono">
                {s.n}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--ink)] mb-1">{s.title}</h3>
                <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <h2 className="font-signal-serif text-2xl text-[var(--ink)] tracking-tight mb-6 text-center">Frequently asked questions</h2>
        <div className="space-y-6">
          {FAQ.map((item) => (
            <div key={item.q}>
              <h3 className="text-sm font-semibold text-[var(--ink)] mb-1.5">{item.q}</h3>
              <p className="text-sm text-[var(--ink-soft)] leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </div>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 text-xs text-[var(--ink-faint)] sm:flex-row">
          <span>© 2026 RankOnGeo. Grown under a night sky.</span>
          <div className="flex gap-5">
            <Link href="/" className="rounded transition-colors hover:text-[var(--rust)]">Home</Link>
            <Link href="/about" className="rounded transition-colors hover:text-[var(--rust)]">About</Link>
            <Link href="/terms" className="rounded transition-colors hover:text-[var(--rust)]">Terms</Link>
            <Link href="/privacy" className="rounded transition-colors hover:text-[var(--rust)]">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
