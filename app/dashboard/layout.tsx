import type { Metadata } from "next";
import { Instrument_Serif, Work_Sans, IBM_Plex_Mono } from "next/font/google";

export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: false },
};

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

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div
      className={`${instrumentSerif.variable} ${workSans.variable} ${ibmPlexMono.variable} h-full`}
      style={{ fontFamily: "var(--font-work-sans), sans-serif" }}
    >
      {children}
    </div>
  );
}
