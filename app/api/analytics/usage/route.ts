import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { analyticsEventQuotaForPlan } from "@/lib/plan-limits";
import { currentBillingPeriod, billingPeriodStart } from "@/lib/analytics-billing";
import { requireBrandAccess } from "@/lib/team";

// Combined Web+LLM Analytics usage for the current billing period, for the
// usage widget shown on both analytics tabs. Read-only — actual metering and
// credit debits happen in inngest/functions/analytics-billing.ts.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  // Quota reflects the workspace owner's plan, not the acting member's.
  const { data: userPlan } = await db.from("user_plans").select("plan, dodo_subscription_id").eq("user_id", access.ownerId).maybeSingle();
  const quota = analyticsEventQuotaForPlan(userPlan?.dodo_subscription_id ? userPlan.plan : null);

  const period = currentBillingPeriod();
  const periodStart = billingPeriodStart(period);

  const { count: webCount } = await db.from("web_visits").select("id", { count: "exact", head: true }).eq("brand_id", brandId).gte("created_at", periodStart);
  const { count: botCount } = await db.from("bot_visits").select("id", { count: "exact", head: true }).eq("brand_id", brandId).gte("created_at", periodStart);
  const totalEvents = (webCount ?? 0) + (botCount ?? 0);

  const { data: cycle } = await db.from("analytics_usage_cycles").select("period, credits_charged, ingestion_paused").eq("brand_id", brandId).maybeSingle();
  const creditsCharged = cycle?.period === period ? cycle.credits_charged : 0;
  const ingestionPaused = cycle?.period === period ? cycle.ingestion_paused : false;

  return NextResponse.json({
    quota,
    totalEvents,
    overageEvents: Math.max(0, totalEvents - quota),
    creditsCharged,
    ingestionPaused,
  });
}
