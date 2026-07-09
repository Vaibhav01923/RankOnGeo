import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import type { WebhookPayload } from "dodopayments/resources/webhook-events";
import { serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

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

// Reverse-lookup of product_id -> our internal plan key. Authoritative source
// for "which plan is this" — metadata.plan is only set at checkout time and
// goes stale the moment a subscription's plan changes (upgrade/downgrade,
// including ones made directly in the Dodo dashboard), so always prefer this
// over metadata when a product_id is available.
const PRODUCT_ID_TO_PLAN: Record<string, string> = {
  [process.env.DODO_STARTER_PRODUCT_ID ?? ""]: "starter",
  [process.env.DODO_GROWTH_PRODUCT_ID ?? ""]: "growth",
  [process.env.DODO_ENTERPRISE_PRODUCT_ID ?? ""]: "enterprise",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function upsertPlanFromSubscription(db: SupabaseClient<any, any, any>, sub: WebhookPayload.Subscription, eventType: string) {
  const plan = PRODUCT_ID_TO_PLAN[sub.product_id] ?? sub.metadata?.plan ?? "starter";
  let userId: string | undefined = sub.metadata?.userId;

  // metadata.userId has been observed missing/empty on real webhook
  // deliveries even though the checkout session was created with it —
  // this silently no-op'd the upsert while still returning 200, which is
  // indistinguishable from success in Dodo's dashboard. Fall back to
  // matching the subscription's customer email against our own users.
  if (!userId && sub.customer?.email) {
    const { data: usersData } = await db.auth.admin.listUsers({ perPage: 1000 });
    userId = usersData?.users.find((u: { email?: string }) => u.email === sub.customer.email)?.id;
    console.error(`[dodo webhook] ${eventType} missing metadata.userId, fell back to email match`, {
      subscriptionId: sub.subscription_id,
      customerEmail: sub.customer.email,
      resolvedUserId: userId ?? null,
    });
  }

  if (userId) {
    await db.from("user_plans").upsert(
      {
        user_id: userId,
        plan,
        dodo_customer_id: sub.customer?.customer_id ?? null,
        dodo_subscription_id: sub.subscription_id,
        current_period_end: sub.next_billing_date ?? null,
      },
      { onConflict: "user_id" }
    );
  } else {
    console.error(`[dodo webhook] ${eventType} could not resolve a user — no metadata.userId and no email match`, {
      subscriptionId: sub.subscription_id,
      customerEmail: sub.customer?.email,
    });
  }
}

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
    await upsertPlanFromSubscription(db, event.data as WebhookPayload.Subscription, event.type);
  }

  // Fires when an existing subscription's plan/product changes — including
  // upgrades/downgrades made directly in the Dodo dashboard rather than
  // through our own checkout, which was silently ignored before this (the
  // subscription stayed "active" so no other event ever corrected `plan`).
  if (event.type === "subscription.plan_changed" || event.type === "subscription.updated") {
    await upsertPlanFromSubscription(db, event.data as WebhookPayload.Subscription, event.type);
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

  if (event.type === "subscription.failed") {
    const sub = event.data as WebhookPayload.Subscription;
    // Dodo doesn't include a gateway decline reason on this event (or on the
    // payment object itself, which just shows error_code: "UNKNOWN_ERROR") —
    // this is purely so a failed first payment shows up in our own logs
    // instead of only being visible in Dodo's dashboard. No user_plans write:
    // a failed subscription never granted a plan, so there's nothing to undo.
    console.error("[dodo webhook] subscription.failed", {
      subscriptionId: sub.subscription_id,
      userId: sub.metadata?.userId,
      plan: sub.metadata?.plan,
      customerEmail: sub.customer?.email,
    });
  }

  if (event.type === "payment.succeeded") {
    // Forward revenue directly to DataFast ourselves instead of relying on
    // Dodo's pre-built native connector — that connector broke whenever
    // metadata.datafast_visitor_id was absent (e.g. checkout without a
    // prior page load), returning a misleading "Amount is required" error
    // from DataFast even though the payment clearly had an amount.
    const payment = event.data as WebhookPayload.Payment;
    const apiKey = process.env.DATAFAST_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch("https://datafa.st/api/v1/payments", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            amount: payment.total_amount / 100,
            currency: payment.currency,
            transaction_id: payment.payment_id,
            ...(payment.metadata?.datafast_visitor_id ? { datafast_visitor_id: payment.metadata.datafast_visitor_id } : {}),
            email: payment.customer?.email,
            customer_id: payment.customer?.customer_id,
          }),
        });
        if (!res.ok) {
          console.error("[dodo webhook] DataFast revenue forwarding failed", {
            status: res.status,
            body: await res.text(),
            paymentId: payment.payment_id,
          });
        }
      } catch (err) {
        console.error("[dodo webhook] DataFast revenue forwarding threw", err);
      }
    }
  }

  if (event.type === "subscription.cancelled" || event.type === "subscription.expired") {
    const sub = event.data as WebhookPayload.Subscription;
    const userId = sub.metadata?.userId;
    if (userId) {
      // Only clear dodo_subscription_id — that's the "active paid plan?" signal
      // everywhere else in the app (see app/api/setup/route.ts, app/setup/page.tsx).
      // Leaving `plan` untouched keeps a record of what they were last on without
      // making a cancelled user look like an active "starter" ($49) subscriber.
      await db.from("user_plans").update({
        dodo_subscription_id: null,
      }).eq("user_id", userId);
    }
  }

  return NextResponse.json({ received: true });
}
