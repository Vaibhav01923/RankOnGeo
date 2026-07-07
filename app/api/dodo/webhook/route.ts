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
    const plan = sub.metadata?.plan ?? "starter";
    let userId: string | undefined = sub.metadata?.userId;

    // metadata.userId has been observed missing/empty on real webhook
    // deliveries even though the checkout session was created with it —
    // this silently no-op'd the upsert while still returning 200, which is
    // indistinguishable from success in Dodo's dashboard. Fall back to
    // matching the subscription's customer email against our own users.
    if (!userId && sub.customer?.email) {
      const { data: usersData } = await db.auth.admin.listUsers({ perPage: 1000 });
      userId = usersData?.users.find((u) => u.email === sub.customer.email)?.id;
      console.error("[dodo webhook] subscription.active missing metadata.userId, fell back to email match", {
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
      console.error("[dodo webhook] subscription.active could not resolve a user — no metadata.userId and no email match", {
        subscriptionId: sub.subscription_id,
        customerEmail: sub.customer?.email,
      });
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
