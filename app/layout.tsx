import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { SelfAnalytics } from "./_components/SelfAnalytics";
import { ClaimPendingBrand } from "./_components/ClaimPendingBrand";
import { AuthErrorNotice } from "./_components/AuthErrorNotice";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Must be the canonical www host — the apex 308-redirects to www, so
  // resolving relative canonical/OG urls against the apex made every page's
  // rel=canonical point at a URL that immediately redirects away from itself.
  metadataBase: new URL("https://www.rankongeo.com"),
  title: {
    default: "RankOnGeo — Track Your Brand in AI Search",
    template: "%s — RankOnGeo",
  },
  description:
    "See how ChatGPT, Claude, Gemini, Perplexity and Google AI respond about your brand. Close the gap with research, articles, and publishing.",
  applicationName: "RankOnGeo",
  keywords: [
    "AI search visibility",
    "generative engine optimization",
    "GEO",
    "AI SEO",
    "brand tracking",
    "ChatGPT visibility",
    "AI Overviews",
    "LLM search ranking",
  ],
  openGraph: {
    type: "website",
    siteName: "RankOnGeo",
    url: "https://www.rankongeo.com",
    title: "RankOnGeo — Track Your Brand in AI Search",
    description:
      "See how ChatGPT, Claude, Gemini, Perplexity and Google AI respond about your brand. Close the gap with research, articles, and publishing.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RankOnGeo — Track Your Brand in AI Search",
    description:
      "See how ChatGPT, Claude, Gemini, Perplexity and Google AI respond about your brand.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Runs before first paint so the page never flashes the wrong theme —
// reads the user's explicit choice if they've made one, otherwise follows
// system preference. Kept inline (not a separate script file) so it blocks
// rendering instead of racing it.
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${instrumentSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
      <SelfAnalytics />
      <ClaimPendingBrand />
      <AuthErrorNotice />
    </html>
  );
}
