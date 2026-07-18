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

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} flex min-h-screen flex-col bg-[var(--cream)] text-[var(--ink)]`}
      style={{ fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      <SiteNav />
      <main className="flex-1 px-6 pt-32 pb-24">{children}</main>
      <footer className="border-t border-[var(--line)] bg-[var(--surface)] px-6 py-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center justify-between gap-4 text-xs text-[var(--ink-faint)] sm:flex-row">
          <span>© 2026 RankOnGeo. Grown under a night sky.</span>
          <div className="flex gap-5">
            <Link href="/" className="rounded transition-colors hover:text-[var(--rust)]">Home</Link>
            <Link href="/about" className="rounded transition-colors hover:text-[var(--rust)]">About</Link>
            <Link href="/blog" className="rounded transition-colors hover:text-[var(--rust)]">Blog</Link>
            <Link href="/setup" className="rounded transition-colors hover:text-[var(--rust)]">Free visibility audit</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
