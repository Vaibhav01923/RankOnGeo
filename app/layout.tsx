import type { Metadata } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import Script from "next/script";
import "./globals.css";

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
  metadataBase: new URL("https://rankongeo.com"),
  title: {
    default: "RankOnGeo — Track Your Brand in AI Search",
    template: "%s — RankOnGeo",
  },
  description:
    "See how ChatGPT, Claude, Gemini, Perplexity, Grok and AI Overviews respond about your brand. Close the gap with research, articles, and publishing.",
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
    url: "https://rankongeo.com",
    title: "RankOnGeo — Track Your Brand in AI Search",
    description:
      "See how ChatGPT, Claude, Gemini, Perplexity, Grok and AI Overviews respond about your brand. Close the gap with research, articles, and publishing.",
  },
  twitter: {
    card: "summary_large_image",
    title: "RankOnGeo — Track Your Brand in AI Search",
    description:
      "See how ChatGPT, Claude, Gemini, Perplexity, Grok and AI Overviews respond about your brand.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
      <Script
        id="datafast-analytics"
        src="https://datafa.st/js/script.js"
        data-website-id="dfid_Z3fMzaUeXnTRGu9mAy2tT"
        data-domain="rankongeo.com"
        strategy="afterInteractive"
      />
      <Script
        id="rankongeo-web-analytics"
        src="https://www.rankongeo.com/track.js"
        data-site="6469ac374959"
        strategy="afterInteractive"
      />
    </html>
  );
}
