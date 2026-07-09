import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import DodoPayments from "dodopayments";
import { analyticsEventQuotaForPlan } from "@/lib/plan-limits";
import { currentBillingPeriod, billingPeriodStart, owedOverageCredits } from "@/lib/analytics-billing";

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

// Meters Web+LLM Analytics usage against each paid brand's monthly quota and
// debits Dodo credits for overage — the only thing that ever charges for
// analytics volume; ingestion itself never blocks synchronously per-event.
export const meterAnalyticsUsage = inngest.createFunction(
  { id: "meter-analytics-usage", retries: 0, triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const db = serverClient();
    const period = currentBillingPeriod();
    const periodStart = billingPeriodStart(period);

    const result = await step.run("meter-brands", async () => {
      const { data: brands } = await db.from("brands").select("id, user_id");
      if (!brands?.length) return { checked: 0, charged: 0, paused: 0, resumed: 0 };

      const userIds = [...new Set(brands.map((b) => b.user_id))];
      const { data: plans } = await db
        .from("user_plans")
        .select("user_id, plan, dodo_customer_id, dodo_subscription_id")
        .in("user_id", userIds);
      const planByUser = new Map((plans ?? []).map((p) => [p.user_id, p]));

      const { data: cycles } = await db
        .from("analytics_usage_cycles")
        .select("brand_id, period, credits_charged, ingestion_paused")
        .in("brand_id", brands.map((b) => b.id));
      const cycleByBrand = new Map((cycles ?? []).map((c) => [c.brand_id, c]));

      const dodo = getDodo();
      let charged = 0, paused = 0, resumed = 0, checked = 0;

      for (const brand of brands) {
        const userPlan = planByUser.get(brand.user_id);
        // Free-tier/unsubscribed brands never get analytics ingestion at all
        // (see lib/analytics-access.ts) — nothing to meter.
        if (!userPlan?.dodo_subscription_id || !userPlan.dodo_customer_id) continue;
        checked++;

        const quota = analyticsEventQuotaForPlan(userPlan.plan);

        const { count: webCount } = await db
          .from("web_visits").select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id).gte("created_at", periodStart);
        const { count: botCount } = await db
          .from("bot_visits").select("id", { count: "exact", head: true })
          .eq("brand_id", brand.id).gte("created_at", periodStart);
        const totalEvents = (webCount ?? 0) + (botCount ?? 0);
        const owed = owedOverageCredits(totalEvents, quota);

        const cycle = cycleByBrand.get(brand.id);
        // A cycle row from a prior month is stale — the new period starts at 0 charged/unpaused.
        let creditsCharged = cycle?.period === period ? cycle.credits_charged : 0;
        let ingestionPaused = cycle?.period === period ? cycle.ingestion_paused : false;

        if (owed > creditsCharged) {
          const diff = owed - creditsCharged;
          try {
            await dodo.creditEntitlements.balances.createLedgerEntry(userPlan.dodo_customer_id, {
              credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID!,
              amount: diff.toString(),
              entry_type: "debit",
              reason: `Web/LLM Analytics overage (${totalEvents} events, ${quota}/mo included)`,
              idempotency_key: `analytics-overage:${brand.id}:${period}:${owed}`,
              metadata: { brandId: brand.id, period, totalEvents: String(totalEvents), quota: String(quota) },
            });
            creditsCharged = owed;
            if (ingestionPaused) resumed++;
            ingestionPaused = false;
            charged++;
          } catch {
            // Insufficient credits — pause ingestion for this brand until a
            // top-up or the next billing period; leave creditsCharged as-is
            // so the same diff is retried (and only retried once) next tick.
            ingestionPaused = true;
            paused++;
          }
        }

        await db.from("analytics_usage_cycles").upsert(
          { brand_id: brand.id, period, credits_charged: creditsCharged, ingestion_paused: ingestionPaused, updated_at: new Date().toISOString() },
          { onConflict: "brand_id" }
        );
      }

      return { checked, charged, paused, resumed };
    });

    return result;
  }
);
