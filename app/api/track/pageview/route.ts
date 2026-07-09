import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { findPaidBrandBySiteKey } from "@/lib/analytics-access";

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
  const { siteKey, path, referrer, visitorId, sessionId } = await req.json().catch(() => ({}));

  if (!siteKey || !path || !visitorId || !sessionId) {
    return NextResponse.json({ error: "siteKey, path, visitorId, sessionId required" }, { status: 400, headers: CORS_HEADERS });
  }

  const db = serverClient();
  const brand = await findPaidBrandBySiteKey(db, siteKey);

  // Never leak "invalid site key" vs "not a paid plan" to a public endpoint — just no-op either way.
  if (!brand) return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });

  await db.from("web_visits").insert({
    brand_id: brand.id,
    visitor_id: String(visitorId).slice(0, 100),
    session_id: String(sessionId).slice(0, 100),
    path: String(path).slice(0, 500),
    referrer: referrer ? String(referrer).slice(0, 500) : null,
  });

  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
