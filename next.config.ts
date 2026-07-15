import type { NextConfig } from "next";

// Content-Security-Policy is shipped in Report-Only mode deliberately: the
// site has inline scripts (JSON-LD blocks, the dark-mode init script in
// app/layout.tsx) and pulls images from several external origins (Supabase
// storage, Google/Clearbit favicons, self-hosted analytics). Report-Only lets
// us see what a stricter policy would actually break (via browser devtools)
// without risking breaking the live site on a guess — promote to enforced
// once verified clean.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://datafa.st",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://*.supabase.co https://www.google.com https://logo.clearbit.com",
  "font-src 'self' data:",
  "connect-src 'self' https://datafa.st https://*.supabase.co",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  images: {
    // Blog covers are hot-linked straight from Supabase Storage today (raw
    // JPEGs, bypassing optimization entirely — see BlogCover.tsx). Allowing
    // the host here lets next/image proxy, resize, and convert them.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" }],
    // Blog images are immutable once uploaded (filenames carry a unique
    // suffix), so cache the optimized variants for a year rather than the
    // 60s default.
    minimumCacheTTL: 31536000,
  },
  async redirects() {
    return [
      { source: "/blogs", destination: "/blog", permanent: true },
      { source: "/blogs/:slug", destination: "/blog/:slug", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};

export default nextConfig;
