"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";

// Root layout renders on every route, including our own authenticated app
// surfaces (/dashboard, /admin, /setup, /auth, /article — all already marked
// robots: noindex). Those aren't marketing traffic, so founders/admins using
// their own product shouldn't inflate rankongeo.com's own Web Analytics.
const EXCLUDED_PREFIXES = ["/dashboard", "/admin", "/setup", "/auth", "/article"];

export function SelfAnalytics() {
  const pathname = usePathname();
  if (EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  return (
    <>
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
        data-site="7476cc1891a6"
        strategy="afterInteractive"
      />
    </>
  );
}
