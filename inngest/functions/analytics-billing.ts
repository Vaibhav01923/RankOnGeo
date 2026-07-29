import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import { analyticsEventQuotaForPlan } from "@/lib/plan-limits";
import { currentBillingPeriod, billingPeriodStart } from "@/lib/analytics-billing";

// Meters Web+LLM Analytics usage against each paid brand's monthly quota and
// draws down the account's purchased event balance for any overage — ingestion
// itself never blocks synchronously per-event, this is the only thing that
// gates/pauses it. See lib/analytics-billing.ts for the balance model.
export const meterAnalyticsUsage = inngest.createFunction(
  { id: "meter-analytics-usage", retries: 0, triggers: [{ cron: "*/15 * * * *" }] },
  async ({ step }) => {
    const db = serverClient();
    const period = currentBillingPeriod();
    const periodStart = billingPeriodStart(period);

    const result = await step.run("meter-brands", async () => {
      const { data: brands } = await db.from("brands").select("id, user_id");
      if (!brands?.length) return { checked: 0, paused: 0, resumed: 0 };

      const userIds = [...new Set(brands.map((b) => b.user_id))];
      const { data: plans } = await db
        .from("user_plans")
        .select("user_id, plan, dodo_customer_id, dodo_subscription_id, purchased_event_balance")
        .in("user_id", userIds);
      const planByUser = new Map((plans ?? []).map((p) => [p.user_id, p]));

      const { data: cycles } = await db
        .from("analytics_usage_cycles")
        .select("brand_id, period, events_covered_by_balance, ingestion_paused")
        .in("brand_id", brands.map((b) => b.id));
      const cycleByBrand = new Map((cycles ?? []).map((c) => [c.brand_id, c]));

      let checked = 0, paused = 0, resumed = 0;

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
        const overageEvents = Math.max(0, totalEvents - quota);

        const cycle = cycleByBrand.get(brand.id);
        // A cycle row from a prior month is stale — the new period starts at 0
        // covered/unpaused. The purchased balance itself is NOT period-scoped —
        // it rolls over indefinitely, tracked separately on user_plans.
        let eventsCovered = cycle?.period === period ? cycle.events_covered_by_balance : 0;
        let ingestionPaused = cycle?.period === period ? cycle.ingestion_paused : false;

        const newOverage = overageEvents - eventsCovered;
        if (newOverage > 0) {
          const available = userPlan.purchased_event_balance ?? 0;
          const covered = Math.min(newOverage, available);
          if (covered > 0) {
            await db
              .from("user_plans")
              .update({ purchased_event_balance: available - covered })
              .eq("user_id", brand.user_id);
            userPlan.purchased_event_balance = available - covered;
          }
          eventsCovered += covered;
          const stillPaused = covered < newOverage;
          if (ingestionPaused && !stillPaused) resumed++;
          if (!ingestionPaused && stillPaused) paused++;
          ingestionPaused = stillPaused;
        } else if (ingestionPaused) {
          // Quota/usage no longer implies overage this tick (e.g. new period).
          ingestionPaused = false;
          resumed++;
        }

        await db.from("analytics_usage_cycles").upsert(
          { brand_id: brand.id, period, events_covered_by_balance: eventsCovered, ingestion_paused: ingestionPaused, updated_at: new Date().toISOString() },
          { onConflict: "brand_id" }
        );
      }

      return { checked, paused, resumed };
    });

    return result;
  }
);
