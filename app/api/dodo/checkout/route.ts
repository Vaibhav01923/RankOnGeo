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

export async function POST(req: NextRequest) {
  const { plan } = await req.json();

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const productId = PLAN_PRODUCTS[plan];
  if (!productId) return NextResponse.json({ error: "Invalid plan or product not configured" }, { status: 400 });

  const origin = req.headers.get("origin") ?? "http://localhost:3000";

  const session = await getDodo().checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    return_url: `${origin}/dashboard?subscription=success`,
    cancel_url: `${origin}/audit`,
    metadata: { userId: user.id, plan },
    customer: { email: user.email! },
  });

  return NextResponse.json({ url: session.checkout_url });
}
