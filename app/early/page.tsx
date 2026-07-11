import type { Metadata } from "next";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { DomainForm } from "../_components/DomainForm";
import { PricingCards } from "../_components/PricingCards";
import { SiteNav } from "../_components/SiteNav";

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
  title: "Early Access — 50% Off All Plans",
  description:
    "Join the RankOnGeo early list: every plan at a flat 50% off. Track how ChatGPT, Claude, Gemini, Perplexity and AI Overviews talk about your brand.",
  alternates: { canonical: "/early" },
  openGraph: {
    type: "website",
    url: "https://rankongeo.com/early",
    title: "RankOnGeo Early Access — 50% Off All Plans",
    description: "Back us early, get every plan at a flat 50% off, and shape the roadmap with us.",
  },
};

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

const PERKS = [
  {
    title: "Flat 50% off, applied at checkout",
    body: "Every plan — Pro, Business, Scale — at half price when you buy through this page. The discount shows up right on the payment screen.",
  },
  {
    title: "You're on the early list",
    body: "Early users get first access to new engines and features as they land, and a direct line to the founders — reply to any email and a human answers.",
  },
  {
    title: "Full product from day one",
    body: "This isn't a stripped-down beta. You get the complete measure → research → write → publish loop the moment you're in.",
  },
];

export default function EarlyAccessPage() {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} min-h-screen bg-[var(--cream)] text-[var(--ink)]`}
      style={{ ...signalVars, fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <SiteNav />

      <main className="px-6 pb-24 pt-36">
        <header className="mx-auto max-w-2xl text-center">
          <h1
            className="font-signal-serif text-4xl font-[350] leading-tight tracking-tight sm:text-6xl"
            style={{ textWrap: "balance" } as React.CSSProperties}
          >
            Back us early, pay <em className="italic text-[var(--rust)]">half</em> — every plan
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-[16px] leading-relaxed text-[var(--ink-soft)]">
            AI engines are already answering questions about your market. Join the early list and get the whole
            RankOnGeo loop — tracking, research, articles, publishing — at a flat 50% off.
          </p>
        </header>

        <section className="mx-auto mt-16 max-w-6xl" aria-label="Early access pricing">
          <PricingCards early />
        </section>

        <section className="mx-auto mt-20 max-w-4xl" aria-label="What you get">
          <h2 className="font-signal-serif mb-8 text-center text-3xl font-[350] tracking-tight">
            What backing early gets you
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {PERKS.map((perk) => (
              <div key={perk.title} className="rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
                <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">{perk.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--ink-soft)]">{perk.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-xl text-center" aria-label="Try before you buy">
          <h2 className="font-signal-serif mb-3 text-3xl font-[350] tracking-tight">Not sure yet?</h2>
          <p className="mb-6 text-sm text-[var(--ink-soft)]">
            Enter your website and see what AI engines currently say about your brand — free, no sign-up.
            Then come back for the discount.
          </p>
          <DomainForm variant="cta" />
          <p className="mt-5 text-sm text-[var(--ink-faint)]">
            Prefer to talk it through first?{" "}
            <a
              href="https://cal.com/deveshpaliwal/15min"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--rust)] underline underline-offset-2 transition-colors hover:text-[var(--rust-deep)]"
            >
              Book a 15-min demo →
            </a>
          </p>
        </section>
      </main>

      <footer className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 text-xs text-[var(--ink-faint)] sm:flex-row">
          <span>© 2026 RankOnGeo. Grown under a night sky.</span>
          <div className="flex gap-5">
            <Link href="/" className="rounded transition-colors hover:text-[var(--rust)]">Home</Link>
            <Link href="/blog" className="rounded transition-colors hover:text-[var(--rust)]">Blog</Link>
            <Link href="/audit" className="rounded transition-colors hover:text-[var(--rust)]">Free visibility audit</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
