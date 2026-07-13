import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  // With ?brandId= the response describes the WORKSPACE that brand belongs to
  // (the owner's plan and balance) — that's what funds paid actions there.
  // Members can see the balance but only the owner can buy credits.
  let planUserId = user.id;
  let canPurchase = true;
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (brandId) {
    const access = await requireBrandAccess(db, user.id, brandId);
    if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    planUserId = access.ownerId;
    canPurchase = access.role === "owner";
  }

  const { data: userPlan } = await db
    .from("user_plans")
    .select("plan, dodo_customer_id, dodo_subscription_id")
    .eq("user_id", planUserId)
    .single();

  // isFree is the one true "actively paying?" signal used for feature gating —
  // a row can exist (and dodo_customer_id can be set) for a cancelled
  // subscriber, but dodo_subscription_id is cleared on cancel/expiry.
  const isFree = !userPlan?.dodo_subscription_id;

  if (!userPlan?.dodo_customer_id) {
    return NextResponse.json({ plan: null, balance: 0, isFree, canPurchase });
  }

  try {
    const balance = await getDodo().creditEntitlements.balances.retrieve(userPlan.dodo_customer_id, {
      credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID!,
    });
    return NextResponse.json({ plan: userPlan.plan, balance: Number(balance.balance), isFree, canPurchase });
  } catch {
    // No balance record yet (e.g. customer hasn't received a grant)
    return NextResponse.json({ plan: userPlan.plan, balance: 0, isFree, canPurchase });
  }
}
