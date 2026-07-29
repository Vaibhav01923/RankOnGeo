import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

// Inserts one synthetic row so the dashboard can show non-zero data before a
// user has actually installed the script/middleware — clearly a test event,
// not real traffic. Uses the service-role client because web_visits/bot_visits
// intentionally have no INSERT policy for authenticated users (only the
// public ingestion routes, using service role, are allowed to write).
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, type } = await req.json();
  if (!brandId || (type !== "web" && type !== "bot")) {
    return NextResponse.json({ error: "brandId and type ('web'|'bot') required" }, { status: 400 });
  }

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data: userPlan } = await db.from("user_plans").select("dodo_subscription_id").eq("user_id", access.ownerId).maybeSingle();
  if (!userPlan?.dodo_subscription_id) {
    return NextResponse.json({ error: "Subscribe to a plan to use Web/LLM Analytics" }, { status: 402 });
  }

  const admin = serverClient();

  if (type === "web") {
    await admin.from("web_visits").insert({
      brand_id: brandId,
      visitor_id: `test-${randomUUID()}`,
      session_id: `test-${randomUUID()}`,
      path: "/test-page",
      referrer: "https://example.com/test-referrer",
      geo_country: "US",
      user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      device_type: "desktop",
      browser: "Chrome",
      os: "macOS",
      utm_source: "test-source",
      utm_medium: "test-medium",
      utm_campaign: "test-campaign",
    });
  } else {
    await admin.from("bot_visits").insert({
      brand_id: brandId,
      bot_name: "chatgpt",
      user_agent: "GPTBot/1.0 (test event)",
      path: "/test-page",
      referrer: null,
    });
  }

  return NextResponse.json({ ok: true });
}
