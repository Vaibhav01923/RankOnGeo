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

// Credits are granted/reissued by Dodo's own credit-entitlement ledger
// (attached per-product in the Dodo dashboard/API) — this webhook only
// tracks which plan a user is on and their Dodo customer/subscription ids,
// which app/api/credits and app/api/tasks need to query/debit that ledger.

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

    if (userId) {
      await db.from("user_plans").upsert(
        {
          user_id: userId,
          plan,
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
      await db
        .from("user_plans")
        .update({ current_period_end: sub.next_billing_date ?? null })
        .eq("user_id", userId);
    }
  }

  if (event.type === "subscription.cancelled" || event.type === "subscription.expired") {
    const sub = event.data as WebhookPayload.Subscription;
    const userId = sub.metadata?.userId;
    if (userId) {
      await db.from("user_plans").update({
        plan: "starter",
        stripe_subscription_id: null,
      }).eq("user_id", userId);
    }
  }

  return NextResponse.json({ received: true });
}
