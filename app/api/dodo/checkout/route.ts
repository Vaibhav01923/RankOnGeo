import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest } from "@/lib/supabase";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

const PLAN_PRODUCTS: Record<string, string | undefined> = {
  starter: process.env.DODO_STARTER_PRODUCT_ID,
  growth: process.env.DODO_GROWTH_PRODUCT_ID,
  enterprise: process.env.DODO_ENTERPRISE_PRODUCT_ID,
};

// Discount code applied to purchases made through /early. Created in Dodo
// (percentage, 5000 basis points = 50%); override via env if renamed.
const EARLY_DISCOUNT_CODE = process.env.DODO_EARLY_DISCOUNT_CODE ?? "EARLY50";

export async function POST(req: NextRequest) {
  const { plan, cancelPath, early } = await req.json();

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const productId = PLAN_PRODUCTS[plan];
  if (!productId) return NextResponse.json({ error: "Invalid plan or product not configured" }, { status: 400 });

  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  // cancelPath lets the caller send the user back to wherever they started
  // checkout from (dashboard, landing pricing, /setup) instead of always
  // dumping them on /dashboard. Only accept a same-origin relative path.
  const safeCancelPath =
    typeof cancelPath === "string" && cancelPath.startsWith("/") && !cancelPath.startsWith("//") && !cancelPath.includes("://")
      ? cancelPath
      : "/dashboard";

  // Attributes this purchase back to the visit/channel that brought them in,
  // via DataFast's revenue-attribution integration (see Dodo webhook setup).
  const datafastVisitorId = req.cookies.get("datafast_visitor_id")?.value;

  const session = await getDodo().checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    return_url: `${origin}/dashboard?subscription=success${early ? "&early=1" : ""}`,
    cancel_url: `${origin}${safeCancelPath}`,
    ...(early ? { discount_codes: [EARLY_DISCOUNT_CODE] } : {}),
    metadata: {
      userId: user.id,
      plan,
      ...(early ? { early: "true" } : {}),
      ...(datafastVisitorId ? { datafast_visitor_id: datafastVisitorId } : {}),
    },
    customer: { email: user.email! },
  });

  return NextResponse.json({ url: session.checkout_url });
}
