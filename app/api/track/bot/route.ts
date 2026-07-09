import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";
import { detectBot } from "@/lib/bot-detection";
import { findPaidBrandBySiteKey } from "@/lib/analytics-access";

// Called server-to-server from the customer's own backend/middleware (see
// app/docs/llm-analytics) — not a browser request, so no CORS handling needed.
export async function POST(req: NextRequest) {
  const { siteKey, path, userAgent, referrer } = await req.json().catch(() => ({}));

  if (!siteKey || !path) {
    return NextResponse.json({ error: "siteKey and path required" }, { status: 400 });
  }

  const botName = detectBot(userAgent);
  // Only recognized AI bots get stored — this endpoint isn't for regular
  // traffic (that's what /api/track/pageview + track.js is for).
  if (!botName) return NextResponse.json({ ok: true, tracked: false });

  const db = serverClient();
  const brand = await findPaidBrandBySiteKey(db, siteKey);
  if (!brand) return NextResponse.json({ ok: true, tracked: false });

  await db.from("bot_visits").insert({
    brand_id: brand.id,
    bot_name: botName,
    user_agent: userAgent ? String(userAgent).slice(0, 500) : null,
    path: String(path).slice(0, 500),
    referrer: referrer ? String(referrer).slice(0, 500) : null,
  });

  return NextResponse.json({ ok: true, tracked: true, botName });
}
