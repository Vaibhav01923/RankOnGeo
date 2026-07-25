import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import { clientFromRequest, serverClient } from "@/lib/supabase";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

// Dodo's subscription.active webhook has repeatedly failed to arrive on the
// first real attempt (confirmed 3 times across different accounts), leaving
// a paying customer looking like free-tier right after checkout. Rather than
// waiting on a webhook retry or the 10-minute reconcile-dodo-subscriptions
// cron, the dashboard calls this immediately on the post-checkout redirect
// to self-heal synchronously by checking Dodo directly for this user's own
// subscription.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user || !user.email) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = serverClient();

  const { data: existing } = await admin
    .from("user_plans")
    .select("dodo_subscription_id")
    .eq("user_id", user.id)
    .single();

  if (existing?.dodo_subscription_id) {
    return NextResponse.json({ isFree: false });
  }

  const dodo = getDodo();

  // Checked in a separate pass from "active" below — a pending subscription
  // found in the same customer's list means their card/mandate is still
  // clearing on Dodo's end (common for INR e-mandate registration, which can
  // take well past what feels like a completed checkout), not a missed
  // webhook. The dashboard surfaces this distinctly so the user isn't left
  // guessing whether something's actually broken.
  let sawPending = false;

  for await (const customer of dodo.customers.list({ email: user.email })) {
    for await (const sub of dodo.subscriptions.list({ customer_id: customer.customer_id })) {
      if (sub.status === "pending") { sawPending = true; continue; }
      if (sub.status !== "active") continue;

      const plan = sub.metadata?.plan;
      if (!plan) continue;

      await admin.from("user_plans").upsert(
        {
          user_id: user.id,
          plan,
          dodo_customer_id: customer.customer_id,
          dodo_subscription_id: sub.subscription_id,
          current_period_end: sub.next_billing_date ?? null,
        },
        { onConflict: "user_id" }
      );
      console.error("[reconcile-me] self-healed missed webhook", { userId: user.id, subscriptionId: sub.subscription_id });
      return NextResponse.json({ isFree: false });
    }
  }

  return NextResponse.json({ isFree: true, pending: sawPending });
}
