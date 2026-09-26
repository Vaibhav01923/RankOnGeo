import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { gscConfigured } from "@/lib/gsc";

// Is the tracking install actually receiving real traffic? Drives the
// "Waiting for first pageview… → Connected" state in the Analytics setup hub
// and the onboarding checklist. The "Test" buttons insert synthetic rows so
// the charts can be previewed before installing anything — those are
// excluded here on purpose, otherwise clicking Test would falsely read as a
// working install.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // Also drives the dashboard's onboarding checklist, so it reports the other
  // two setup steps too. Both tables are service-role only.
  const admin = serverClient();
  const [web, bot, gsc, autopilot] = await Promise.all([
    db
      .from("web_visits")
      .select("created_at")
      .eq("brand_id", brandId)
      .not("visitor_id", "like", "test-%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("bot_visits")
      .select("created_at")
      .eq("brand_id", brandId)
      .not("user_agent", "like", "%(test event)")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin.from("gsc_connections").select("site_url").eq("brand_id", brandId).maybeSingle(),
    admin.from("autopilot_settings").select("enabled").eq("brand_id", brandId).maybeSingle(),
  ]);

  return NextResponse.json({
    web: { connected: !!web.data, lastSeenAt: web.data?.created_at ?? null },
    bot: { connected: !!bot.data, lastSeenAt: bot.data?.created_at ?? null },
    gsc: { configured: gscConfigured(), connected: !!gsc.data?.site_url },
    autopilot: { enabled: !!autopilot.data?.enabled },
  });
}
