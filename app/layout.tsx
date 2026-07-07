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
  title: "RankOnGeo — Track Your Brand in AI Search",
  description:
    "See how ChatGPT, Claude, Gemini, Perplexity, Grok and AI Overviews respond about your brand. Close the gap with research, articles, and publishing.",
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
    </html>
  );
}
