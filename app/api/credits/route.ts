import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest } from "@/lib/supabase";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: userPlan } = await db
    .from("user_plans")
    .select("plan, stripe_customer_id, stripe_subscription_id")
    .eq("user_id", user.id)
    .single();

  // isFree is the one true "actively paying?" signal used for feature gating —
  // a row can exist (and stripe_customer_id can be set) for a cancelled
  // subscriber, but stripe_subscription_id is cleared on cancel/expiry.
  const isFree = !userPlan?.stripe_subscription_id;

  if (!userPlan?.stripe_customer_id) {
    return NextResponse.json({ plan: null, balance: 0, isFree });
  }

  try {
    const balance = await getDodo().creditEntitlements.balances.retrieve(userPlan.stripe_customer_id, {
      credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID!,
    });
    return NextResponse.json({ plan: userPlan.plan, balance: Number(balance.balance), isFree });
  } catch {
    // No balance record yet (e.g. customer hasn't received a grant)
    return NextResponse.json({ plan: userPlan.plan, balance: 0, isFree });
  }
}
