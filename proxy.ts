import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Our own site's Web/LLM Analytics site key (brands.site_key for the
// RankOnGeo brand, rankongeo.com) — see app/docs/llm-analytics.
const SITE_KEY = "6469ac374959";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  // /setup is deliberately NOT gated here: it now doubles as the anonymous
  // preview flow the landing page's domain input sends visitors into (crawl
  // + brand review + prompts run without an account; the wizard itself
  // gates account creation at its final step). app/setup/page.tsx and
  // app/api/setup/route.ts both already handle the anonymous case.
  const protectedPaths = ["/dashboard", "/article", "/admin"];

  if (protectedPaths.some((p) => pathname.startsWith(p)) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/auth";
    url.searchParams.set("redirect", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }

  // An already-signed-in visitor hitting /auth (e.g. clicking "Login" out of
  // habit, or one of the several ?redirect=-carrying links elsewhere in the
  // app — /settings, /invite, /article, PricingCards) should land wherever
  // they were headed, not get bounced into onboarding. Mirrors the redirect
  // app/auth/page.tsx's own client-side effect already computes — that code
  // never got to run because this unconditional /setup redirect fired first.
  if (pathname === "/auth" && user) {
    const redirectParam = request.nextUrl.searchParams.get("redirect");
    // Must be a same-origin relative path — a bare "/" prefix only, not
    // "//evil.com" (protocol-relative) or an absolute URL, either of which
    // NextResponse.redirect would happily follow off-site since the param
    // comes straight from the query string.
    const target = redirectParam && redirectParam.startsWith("/") && !redirectParam.startsWith("//") ? redirectParam : "/dashboard";
    return NextResponse.redirect(new URL(target, request.url));
  }

  // Track AI crawler/bot traffic against our own site — GPTBot, ClaudeBot,
  // PerplexityBot etc. crawl the public marketing/blog/docs pages, not
  // /dashboard, which is why the matcher below covers the whole site rather
  // than just the auth-gated paths above. Fire-and-forget via waitUntil so
  // it never adds latency to the real response; the endpoint silently
  // no-ops for non-bot user agents, so this is safe to call unconditionally.
  const userAgent = request.headers.get("user-agent");
  if (userAgent) {
    event.waitUntil(
      fetch(`${request.nextUrl.origin}/api/track/bot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          siteKey: SITE_KEY,
          path: pathname,
          userAgent,
          referrer: request.headers.get("referer") ?? "",
        }),
      }).catch(() => {})
    );
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Everything except static assets, images, and API routes (those handle
    // their own auth internally, and don't need bot-tracking on themselves).
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|txt|xml|json|woff|woff2)$).*)",
  ],
};
