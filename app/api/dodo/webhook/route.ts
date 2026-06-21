import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import type { WebhookPayload } from "dodopayments/resources/webhook-events";
import { serverClient } from "@/lib/supabase";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    webhookKey: process.env.DODO_WEBHOOK_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

const PLAN_CREDITS: Record<string, number> = {
  starter: 50,
  growth: 200,
  enterprise: 300,
};

export async function POST(req: NextRequest) {
  const body = await req.text();

  let event: WebhookPayload;
  try {
    event = getDodo().webhooks.unwrap(body, {
      headers: {
        "webhook-id": req.headers.get("webhook-id") ?? "",
        "webhook-signature": req.headers.get("webhook-signature") ?? "",
        "webhook-timestamp": req.headers.get("webhook-timestamp") ?? "",
      },
    }) as WebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const db = serverClient();

  if (event.type === "subscription.active") {
    const sub = event.data as WebhookPayload.Subscription;
    const userId = sub.metadata?.userId;
    const plan = sub.metadata?.plan ?? "starter";
    const credits = PLAN_CREDITS[plan] ?? 50;

    if (userId) {
      await db.from("user_plans").upsert(
        {
          user_id: userId,
          plan,
          credits_balance: credits,
          credits_monthly: credits,
          stripe_customer_id: sub.customer?.customer_id ?? null,
          stripe_subscription_id: sub.subscription_id,
          current_period_end: sub.next_billing_date ?? null,
        },
        { onConflict: "user_id" }
      );
    }
  }

  if (event.type === "subscription.renewed") {
    const sub = event.data as WebhookPayload.Subscription;
    const userId = sub.metadata?.userId;
    if (userId) {
      const { data: plan } = await db
        .from("user_plans")
        .select("credits_monthly")
        .eq("user_id", userId)
        .single();
      if (plan) {
        await db
          .from("user_plans")
          .update({ credits_balance: plan.credits_monthly, current_period_end: sub.next_billing_date ?? null })
          .eq("user_id", userId);
      }
    }
  }

  if (event.type === "subscription.cancelled" || event.type === "subscription.expired") {
    const sub = event.data as WebhookPayload.Subscription;
    const userId = sub.metadata?.userId;
    if (userId) {
      await db.from("user_plans").update({
        plan: "starter",
        credits_balance: 50,
        credits_monthly: 50,
        stripe_subscription_id: null,
      }).eq("user_id", userId);
    }
  }

  return NextResponse.json({ received: true });
}
