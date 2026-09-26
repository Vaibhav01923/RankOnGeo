import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";
import { requiresPaywall } from "@/lib/plan-limits";
import { checkRateLimit } from "@/lib/rate-limit";
import { inngest } from "@/inngest/client";

// "Run now": queues one Autopilot run immediately. Writing takes a minute or
// two, so it happens in the background job — the dashboard polls for the result.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await req.json().catch(() => ({}));
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });
  const access = await requireBrandAccess(db, user.id, brandId, "id, user_id");
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const admin = serverClient();
  if (await requiresPaywall(admin, access.ownerId)) {
    return NextResponse.json({ error: "Autopilot is part of the paid plan.", reason: "upgrade" }, { status: 402 });
  }
  const { data: settings } = await admin.from("autopilot_settings").select("brand_id").eq("brand_id", brandId).maybeSingle();
  if (!settings) return NextResponse.json({ error: "Set up Autopilot first." }, { status: 400 });

  // Each run is a paid LLM generation; a stuck button shouldn't be able to fan out dozens.
  if (!(await checkRateLimit("autopilot-run", brandId, 4, 3600))) {
    return NextResponse.json({ error: "You've run Autopilot a few times already this hour — try again shortly." }, { status: 429 });
  }

  try {
    await inngest.send({ name: "autopilot/brand.forced", data: { brandId } });
  } catch (e) {
    console.error("[autopilot] couldn't queue run", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Couldn't start the run. Please try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
