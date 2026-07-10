import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
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

// Same scoped Signal theme vars as the landing page, so SiteNav and the
// shared markdown renderer pick up the right palette.
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

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} flex min-h-screen flex-col bg-[var(--cream)] text-[var(--ink)]`}
      style={{ ...signalVars, fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <SiteNav />
      <main className="flex-1 px-6 pt-32 pb-24">{children}</main>
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
