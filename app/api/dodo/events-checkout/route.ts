import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest } from "@/lib/supabase";
import { MIN_EVENT_UNITS, MAX_EVENT_UNITS, EVENTS_PER_UNIT } from "@/lib/analytics-billing";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

// One-time analytics event-capacity top-up, $0.75 per 1,000-event unit —
// separate from the recurring plan subscription checkout. Requires an active
// subscription (top-ups add to an existing plan's balance, they don't stand
// alone). The purchased balance never expires and rolls over across billing
// periods (see purchased_event_balance on user_plans, drawn down by
// inngest/functions/analytics-billing.ts).
export async function POST(req: NextRequest) {
  const { units, cancelPath } = await req.json();
  if (!Number.isInteger(units) || units < MIN_EVENT_UNITS || units > MAX_EVENT_UNITS) {
    return NextResponse.json({ error: `Units must be between ${MIN_EVENT_UNITS} and ${MAX_EVENT_UNITS}` }, { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: userPlan } = await db.from("user_plans").select("dodo_subscription_id").eq("user_id", user.id).maybeSingle();
  if (!userPlan?.dodo_subscription_id) {
    return NextResponse.json({ error: "Subscribe to a plan before buying extra events" }, { status: 402 });
  }

  const productId = process.env.DODO_EVENTS_PRODUCT_ID;
  if (!productId) return NextResponse.json({ error: "Events top-up not configured" }, { status: 500 });

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const safeCancelPath =
    typeof cancelPath === "string" && cancelPath.startsWith("/") && !cancelPath.startsWith("//") && !cancelPath.includes("://")
      ? cancelPath
      : "/dashboard";

  const eventsAmount = units * EVENTS_PER_UNIT;

  const session = await getDodo().checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: units }],
    return_url: `${origin}/dashboard?events=success`,
    cancel_url: `${origin}${safeCancelPath}`,
    metadata: { userId: user.id, type: "events_topup", eventsAmount: String(eventsAmount) },
    customer: { email: user.email! },
  });

  return NextResponse.json({ url: session.checkout_url });
}
