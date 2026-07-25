import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

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
  const { plan, cancelPath, early, trialDays } = await req.json();

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

  let validTrialDays = typeof trialDays === "number" && trialDays > 0 && trialDays <= 30 ? trialDays : undefined;

  // One free trial per account, ever — trialDays is client-supplied, so
  // trusting it blindly would let anyone re-request a trial on a second
  // checkout after theirs lapsed or converted. trial_started (not
  // trial_checkout_started) is the signal: it only exists once Dodo's
  // webhook confirms the mandate actually activated, so a prior *failed*
  // checkout attempt doesn't unfairly block a retry.
  if (validTrialDays) {
    const { data: priorTrial } = await serverClient()
      .from("funnel_events")
      .select("id")
      .eq("event_type", "trial_started")
      .eq("user_id", user.id)
      .maybeSingle();
    if (priorTrial) validTrialDays = undefined;
  }

  // Defense in depth against the "spin up N throwaway emails to keep
  // re-claiming trials" pattern, which the per-account check above can't
  // catch on its own since each one is a genuinely new account.
  if (validTrialDays) {
    const ipOk = await checkRateLimit("trial-checkout", clientIp(req), 3, 86400);
    if (!ipOk) {
      return NextResponse.json({ error: "Too many trial signups from this network — try again later." }, { status: 429 });
    }
  }

  const session = await getDodo().checkoutSessions.create({
    product_cart: [{ product_id: productId, quantity: 1 }],
    return_url: `${origin}/dashboard?subscription=success${early ? "&early=1" : ""}${validTrialDays ? "&trial=1" : ""}`,
    cancel_url: `${origin}${safeCancelPath}`,
    ...(early ? { discount_codes: [EARLY_DISCOUNT_CODE] } : {}),
    ...(validTrialDays ? { subscription_data: { trial_period_days: validTrialDays } } : {}),
    metadata: {
      userId: user.id,
      plan,
      ...(early ? { early: "true" } : {}),
      ...(validTrialDays ? { trial: "true" } : {}),
      ...(datafastVisitorId ? { datafast_visitor_id: datafastVisitorId } : {}),
    },
    customer: { email: user.email! },
  });

  // Fire-and-forget — "attempted" a trial checkout, not confirmed. The gap
  // between this and the webhook-confirmed trial_started event is real
  // card/mandate failures (e.g. the INR e-mandate registration issue seen
  // earlier), which this alone can't distinguish from someone just abandoning
  // the Dodo page.
  if (validTrialDays) {
    serverClient()
      .from("funnel_events")
      .insert({
        event_type: "trial_checkout_started",
        email: user.email,
        user_id: user.id,
        plan,
        metadata: { subscriptionSessionId: session.session_id },
      })
      .then(() => {});
  }

  return NextResponse.json({ url: session.checkout_url });
}
