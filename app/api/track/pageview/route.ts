import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { findPaidBrandBySiteKey } from "@/lib/analytics-access";
import { parseUserAgent } from "@/lib/ua-parser";
import { getCountryFromRequest } from "@/lib/geo";

// Called cross-origin from the browser on the customer's own site (public/track.js),
// so this needs real CORS handling — unlike server-to-server endpoints elsewhere in
// this app, a browser will block the response without these headers.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  const { siteKey, path, referrer, visitorId, sessionId, utmSource, utmMedium, utmCampaign } = await req.json().catch(() => ({}));

  if (!siteKey || !path || !visitorId || !sessionId) {
    return NextResponse.json({ error: "siteKey, path, visitorId, sessionId required" }, { status: 400, headers: CORS_HEADERS });
  }

  const db = serverClient();
  const brand = await findPaidBrandBySiteKey(db, siteKey);

  // Never leak "invalid site key" vs "not a paid plan" to a public endpoint — just no-op either way.
  if (!brand) return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });

  // Read server-side from the real request, not the client payload — the
  // browser always sends a real User-Agent header (unlike a client-supplied
  // value, which would be trivially spoofable), and geo comes from Vercel's
  // edge network at zero cost, no GeoIP service needed.
  const userAgent = req.headers.get("user-agent");
  const { deviceType, browser, os } = parseUserAgent(userAgent);
  const geoCountry = getCountryFromRequest(req);

  await db.from("web_visits").insert({
    brand_id: brand.id,
    visitor_id: String(visitorId).slice(0, 100),
    session_id: String(sessionId).slice(0, 100),
    path: String(path).slice(0, 500),
    referrer: referrer ? String(referrer).slice(0, 500) : null,
    geo_country: geoCountry,
    user_agent: userAgent ? userAgent.slice(0, 500) : null,
    device_type: deviceType,
    browser,
    os,
    utm_source: utmSource ? String(utmSource).slice(0, 200) : null,
    utm_medium: utmMedium ? String(utmMedium).slice(0, 200) : null,
    utm_campaign: utmCampaign ? String(utmCampaign).slice(0, 200) : null,
  });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
