import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest } from "@/lib/supabase";
import { isLapsedSubscriber, gracePeriodDaysLeft } from "@/lib/plan-limits";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

// Settings page data: DB plan/customer columns plus, when a subscription is
// on file, live status straight from Dodo — current_period_end in our DB is
// only refreshed on the "renewed" webhook, so it can lag; next_billing_date
// and cancel_at_next_billing_date come from Dodo directly instead of relying
// on that cached column.
export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: userPlan } = await db
    .from("user_plans")
    .select("plan, dodo_customer_id, dodo_subscription_id, payment_failed_at, purchased_event_balance")
    .eq("user_id", user.id)
    .maybeSingle();

  const isFree = !userPlan?.dodo_subscription_id;
  const base = {
    plan: userPlan?.plan ?? null,
    isFree,
    isLapsed: isLapsedSubscriber(userPlan),
    graceDaysLeft: gracePeriodDaysLeft(userPlan),
    hasBillingAccount: !!userPlan?.dodo_customer_id,
    purchasedEventBalance: userPlan?.purchased_event_balance ?? 0,
    status: null as string | null,
    nextBillingDate: null as string | null,
    cancelAtNextBillingDate: false,
  };

  if (!userPlan?.dodo_subscription_id) return NextResponse.json(base);

  try {
    const sub = await getDodo().subscriptions.retrieve(userPlan.dodo_subscription_id);
    return NextResponse.json({
      ...base,
      status: sub.status,
      nextBillingDate: sub.next_billing_date,
      cancelAtNextBillingDate: sub.cancel_at_next_billing_date,
    });
  } catch {
    // Dodo lookup failed (e.g. stale subscription id) — still show what we
    // have in our own DB rather than erroring the whole settings page.
    return NextResponse.json(base);
  }
}
