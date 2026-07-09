import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest } from "@/lib/supabase";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

const MIN_CREDITS = 10;
const MAX_CREDITS = 5000;

// One-time credit top-up, flat $1/credit — separate from the recurring plan
// subscription checkout in app/api/dodo/checkout/route.ts. Requires an active
// subscription (top-ups add to an existing plan's credit balance, they don't
// stand alone).
export async function POST(req: NextRequest) {
  const { quantity, cancelPath } = await req.json();
  if (!Number.isInteger(quantity) || quantity < MIN_CREDITS || quantity > MAX_CREDITS) {
    return NextResponse.json({ error: `Quantity must be between ${MIN_CREDITS} and ${MAX_CREDITS}` }, { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: userPlan } = await db.from("user_plans").select("dodo_subscription_id").eq("user_id", user.id).maybeSingle();
  if (!userPlan?.dodo_subscription_id) {
    return NextResponse.json({ error: "Subscribe to a plan before buying extra credits" }, { status: 402 });
  }

  const productId = process.env.DODO_CREDITS_PRODUCT_ID;
  if (!productId) return NextResponse.json({ error: "Credit top-up not configured" }, { status: 500 });

  const origin = req.headers.get("origin") ?? "http://localhost:3000";
  const safeCancelPath =
    typeof cancelPath === "string" && cancelPath.startsWith("/") && !cancelPath.startsWith("//") && !cancelPath.includes("://")
      ? cancelPath
      : "/dashboard";

  const session = await getDodo().checkoutSessions.create({
    product_cart: [
      {
        product_id: productId,
        quantity,
        credit_entitlements: [
          {
            credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID!,
            credits_amount: quantity.toString(),
          },
        ],
      },
    ],
    return_url: `${origin}/dashboard?credits=success`,
    cancel_url: `${origin}${safeCancelPath}`,
    metadata: { userId: user.id, type: "credit_topup", quantity: String(quantity) },
    customer: { email: user.email! },
  });

  return NextResponse.json({ url: session.checkout_url });
}
