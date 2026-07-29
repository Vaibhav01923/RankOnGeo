import { NextRequest, NextResponse } from "next/server";
import DodoPayments from "dodopayments";
import type { WebhookPayload } from "dodopayments/resources/webhook-events";
import { serverClient } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { earlyWaitlistEmailHtml, sendEmail } from "@/lib/email";

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
        // Any of active/plan_changed/updated means the subscription is in
        // good standing — clear a stale failed-payment grace-period clock.
        payment_failed_at: null,
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

// Purchases made through /early (metadata.early === "true") also join the
// early-access waitlist and get a one-time congrats email. Idempotent:
// subscription.active can fire more than once, so the row is keyed on email
// and the email only goes out while emailed_at is still null.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEarlyWaitlist(db: SupabaseClient<any, any, any>, sub: WebhookPayload.Subscription) {
  if (sub.metadata?.early !== "true") return;
  const email = sub.customer?.email;
  if (!email) return;

  const plan = PRODUCT_ID_TO_PLAN[sub.product_id] ?? sub.metadata?.plan ?? "starter";

  const { data: existing } = await db
    .from("early_waitlist")
    .select("id, emailed_at")
    .eq("email", email)
    .maybeSingle();

  let rowId = existing?.id;
  if (!existing) {
    const { data: inserted, error } = await db
      .from("early_waitlist")
      .insert({
        user_id: sub.metadata?.userId || null,
        email,
        plan,
        dodo_subscription_id: sub.subscription_id,
      })
      .select("id")
      .single();
    if (error) {
      console.error("[dodo webhook] early_waitlist insert failed", { email, error: error.message });
      return;
    }
    rowId = inserted.id;
  }

  if (!existing?.emailed_at && rowId) {
    const { sent } = await sendEmail({
      to: email,
      subject: "Congrats — you're on the RankOnGeo early list 🌱",
      html: earlyWaitlistEmailHtml(plan),
    });
    if (sent) {
      await db.from("early_waitlist").update({ emailed_at: new Date().toISOString() }).eq("id", rowId);
    }
  }
}

// Records a trial-lifecycle funnel event exactly once per subscription.
// subscription.active is already documented as able to fire more than once
// (see handleEarlyWaitlist above), and subscription.renewed fires on every
// renewal for the life of the subscription, not just the first one after a
// trial — the existence check is what turns "every renewal" into "only the
// first renewal after a trial", i.e. the actual trial->paid conversion
// moment, without a separate trial_ends_at column anywhere.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recordTrialEventOnce(db: SupabaseClient<any, any, any>, eventType: "trial_started" | "trial_converted", sub: WebhookPayload.Subscription) {
  if (sub.metadata?.trial !== "true") return;

  const { data: existing } = await db
    .from("funnel_events")
    .select("id")
    .eq("event_type", eventType)
    .eq("metadata->>subscriptionId", sub.subscription_id)
    .maybeSingle();
  if (existing) return;

  const plan = PRODUCT_ID_TO_PLAN[sub.product_id] ?? sub.metadata?.plan ?? "starter";
  await db.from("funnel_events").insert({
    event_type: eventType,
    email: sub.customer?.email ?? null,
    user_id: sub.metadata?.userId || null,
    plan,
    metadata: { subscriptionId: sub.subscription_id },
  });
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
    const sub = event.data as WebhookPayload.Subscription;
    await upsertPlanFromSubscription(db, sub, event.type);
    await handleEarlyWaitlist(db, sub);
    await recordTrialEventOnce(db, "trial_started", sub);
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
        // A successful renewal means any prior payment failure recovered —
        // clear the grace-period clock along with the new period end.
        .update({ current_period_end: sub.next_billing_date ?? null, payment_failed_at: null })
        .eq("user_id", userId);
    }
    await recordTrialEventOnce(db, "trial_converted", sub);
  }

  // Fires when a RENEWAL payment fails and the subscription enters Dodo's own
  // dunning/retry cycle (distinct from subscription.failed, which is only for
  // a failed FIRST payment on a subscription that never activated). The
  // subscription itself isn't cancelled yet — Dodo keeps retrying — so we
  // only start our own 3-day grace-period clock here rather than revoking
  // access immediately. isLapsedSubscriber() enforces the cutoff once it
  // expires; subscription.cancelled/expired below covers the case where
  // Dodo's own retries are exhausted.
  if (event.type === "subscription.on_hold") {
    const sub = event.data as WebhookPayload.Subscription;
    const userId = sub.metadata?.userId;
    if (userId) {
      await db
        .from("user_plans")
        .update({ payment_failed_at: new Date().toISOString() })
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

    // Events top-up (see app/api/dodo/events-checkout/route.ts) credits our
    // own internal balance, not a Dodo credit entitlement — do that here.
    // Insert-with-conflict on payment_id makes this idempotent against
    // webhook redelivery: a payment can only ever credit the balance once.
    if (payment.metadata?.type === "events_topup" && payment.metadata?.userId) {
      const userId = payment.metadata.userId;
      const amount = Number(payment.metadata.eventsAmount ?? 0);
      if (amount > 0) {
        const { error: insertErr } = await db
          .from("event_balance_credits")
          .insert({ payment_id: payment.payment_id, user_id: userId, amount });
        if (!insertErr) {
          const { data: plan } = await db.from("user_plans").select("purchased_event_balance").eq("user_id", userId).maybeSingle();
          await db
            .from("user_plans")
            .update({ purchased_event_balance: (plan?.purchased_event_balance ?? 0) + amount })
            .eq("user_id", userId);
        }
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
      // isLapsedSubscriber() now treats dodo_subscription_id=null as an
      // immediate full lockout, so also clear payment_failed_at — there's no
      // grace period left to track once Dodo itself has cancelled/expired it.
      await db.from("user_plans").update({
        dodo_subscription_id: null,
        payment_failed_at: null,
      }).eq("user_id", userId);
    }
  }

  return NextResponse.json({ received: true });
}
