import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import { isDodoSubscriptionId } from "@/lib/subscription-guard";
import DodoPayments from "dodopayments";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

// Safety net for missed subscription.active webhooks (confirmed to happen —
// Dodo's delivery or our processing occasionally drops one, leaving a real
// paying customer looking like free-tier with no error surfaced anywhere).
// Cross-checks Dodo's actual active subscriptions from the last 24h against
// user_plans and self-heals any mismatch, so a missed webhook fixes itself
// within one poll cycle instead of needing a manual replay.
export const reconcileDodoSubscriptions = inngest.createFunction(
  { id: "reconcile-dodo-subscriptions", retries: 0, triggers: [{ cron: "*/10 * * * *" }] },
  async ({ step }) => {
    const result = await step.run("reconcile-active-subscriptions", async () => {
      const db = serverClient();
      const dodo = getDodo();
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let checked = 0;
      let fixed = 0;

      for await (const sub of dodo.subscriptions.list({ status: "active", created_at_gte: since })) {
        checked++;
        const userId = sub.metadata?.userId;
        const plan = sub.metadata?.plan;
        if (!userId || !plan) continue; // not one of ours (e.g. a different brand on the same Dodo business)

        const { data: existing } = await db
          .from("user_plans")
          .select("dodo_subscription_id")
          .eq("user_id", userId)
          .single();

        if (existing?.dodo_subscription_id === sub.subscription_id) continue; // already in sync

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
        fixed++;
        console.error("[reconcile-subscriptions] fixed missed webhook", { userId, subscriptionId: sub.subscription_id });
      }

      return { checked, fixed };
    });

    return result;
  }
);

// The other direction: a subscription Dodo has cancelled or expired whose id we
// still store, because subscription.cancelled/expired never arrived. Nothing
// above can catch that (it only adds active subscriptions), so the account kept
// full access and its brands kept getting scheduled scans. Found 2026-10-04: a
// trial cancelled on 2026-09-30 and a plan that expired in August, both still
// scanned every 3 days. Does what the webhook's cancelled/expired branch does.
// Hourly is plenty, and each stored subscription is one free Dodo lookup.
export const reconcileEndedSubscriptions = inngest.createFunction(
  { id: "reconcile-ended-subscriptions", retries: 0, triggers: [{ cron: "25 * * * *" }] },
  async ({ step }) => {
    return step.run("clear-ended-subscriptions", async () => {
      const db = serverClient();
      const dodo = getDodo();

      const { data: rows, error } = await db
        .from("user_plans")
        .select("user_id, dodo_subscription_id")
        .not("dodo_subscription_id", "is", null);
      if (error) throw new Error(error.message);

      let checked = 0;
      const cleared: string[] = [];

      for (const row of rows ?? []) {
        // Complimentary access isn't a Dodo subscription, so nothing can end it.
        if (!isDodoSubscriptionId(row.dodo_subscription_id)) continue;
        checked++;

        let status: string;
        try {
          status = (await dodo.subscriptions.retrieve(row.dodo_subscription_id)).status;
        } catch (e) {
          // Can't tell (network, or an id from the other Dodo mode): leave it.
          console.error("[reconcile-subscriptions] lookup failed", { subscriptionId: row.dodo_subscription_id, error: e instanceof Error ? e.message : e });
          continue;
        }
        if (status !== "cancelled" && status !== "expired") continue;

        // Matching on the old id too, so a customer who resubscribed in the
        // meantime keeps their new subscription.
        await db
          .from("user_plans")
          .update({ dodo_subscription_id: null, payment_failed_at: null })
          .eq("user_id", row.user_id)
          .eq("dodo_subscription_id", row.dodo_subscription_id);
        cleared.push(row.dodo_subscription_id);
        console.error("[reconcile-subscriptions] cleared ended subscription", { userId: row.user_id, subscriptionId: row.dodo_subscription_id, status });
      }

      return { checked, cleared };
    });
  }
);
