import { inngest } from "@/inngest/client";
import { serverClient } from "@/lib/supabase";
import { checkStatuses, createOrder as createBuyUpvotesOrder, getBalance, BuyUpvotesError } from "@/lib/buyupvotes";
import { refundRedditOrderCredits } from "@/lib/reddit-order-service";
import type { RedditServiceType } from "@/lib/types";

const LOW_BALANCE_THRESHOLD_USD = 20;
const QUEUED_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours
const SPEED_MAP: Record<string, number> = { slow: 50, normal: 200, fast: 900 };

type OrderRow = {
  id: string;
  user_id: string;
  url: string;
  service_type: RedditServiceType;
  provider_order_id: string | null;
  credits_charged: number;
  delivery_speed: string;
  reply_text: string | null;
  upvotes_ordered: number;
  created_at: string;
};

// Syncs BuyUpvotes order statuses and retries queued (429'd) submissions. BuyUpvotes has
// no webhooks, so this is the only way task rows ever move past "pending" on their own.
export const pollRedditOrders = inngest.createFunction(
  { id: "poll-reddit-orders", retries: 0, triggers: [{ cron: "*/5 * * * *" }] },
  async ({ step }) => {
    const db = serverClient();

    const syncResult = await step.run("sync-submitted-orders", async () => {
      const { data: rows } = await db
        .from("engage_tasks")
        .select("id, user_id, url, service_type, provider_order_id, credits_charged")
        .in("status", ["pending", "running"])
        .not("provider_order_id", "is", null)
        .limit(200);

      const pending = (rows ?? []) as OrderRow[];
      if (!pending.length) return { checked: 0, completed: 0, failed: 0, running: 0 };

      const { data: userPlans } = await db
        .from("user_plans")
        .select("user_id, dodo_customer_id")
        .in("user_id", pending.map((r) => r.user_id));
      const customerByUser = new Map((userPlans ?? []).map((p) => [p.user_id, p.dodo_customer_id as string | null]));

      const statuses = await checkStatuses(pending.map((r) => r.provider_order_id!));
      const statusByOrderId = new Map(statuses.map((s) => [String(s.orderId), s.status]));

      let completed = 0, failed = 0, running = 0;
      for (const row of pending) {
        const providerStatus = statusByOrderId.get(row.provider_order_id!);
        if (!providerStatus) continue;

        if (providerStatus === "completed") {
          await db.from("engage_tasks").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", row.id);
          completed++;
        } else if (providerStatus === "failed") {
          const customerId = customerByUser.get(row.user_id);
          if (customerId) {
            await refundRedditOrderCredits({
              customerId,
              taskId: row.id,
              amount: row.credits_charged,
              url: row.url,
              serviceType: row.service_type,
              reason: "Refund: provider reported order failed",
            });
          }
          await db.from("engage_tasks").update({ status: "failed" }).eq("id", row.id);
          failed++;
        } else if (providerStatus === "running") {
          await db.from("engage_tasks").update({ status: "running" }).eq("id", row.id);
          running++;
        }
      }
      return { checked: pending.length, completed, failed, running };
    });

    const queueResult = await step.run("retry-queued-orders", async () => {
      const { data: rows } = await db
        .from("engage_tasks")
        .select("id, user_id, url, service_type, credits_charged, delivery_speed, reply_text, upvotes_ordered, created_at")
        .eq("status", "queued")
        .limit(100);

      const queued = (rows ?? []) as OrderRow[];
      if (!queued.length) return { checked: 0, submitted: 0, expired: 0 };

      const { data: userPlans } = await db
        .from("user_plans")
        .select("user_id, dodo_customer_id")
        .in("user_id", queued.map((r) => r.user_id));
      const customerByUser = new Map((userPlans ?? []).map((p) => [p.user_id, p.dodo_customer_id as string | null]));

      let submitted = 0, expired = 0;
      for (const row of queued) {
        const ageMs = Date.now() - new Date(row.created_at).getTime();
        if (ageMs > QUEUED_MAX_AGE_MS) {
          const customerId = customerByUser.get(row.user_id);
          if (customerId) {
            await refundRedditOrderCredits({
              customerId,
              taskId: row.id,
              amount: row.credits_charged,
              url: row.url,
              serviceType: row.service_type,
              reason: "Refund: still queued after 6h (provider stayed at capacity for this link)",
            });
          }
          await db.from("engage_tasks").update({ status: "failed" }).eq("id", row.id);
          expired++;
          continue;
        }

        try {
          const order =
            row.service_type === "custom_comments"
              ? await createBuyUpvotesOrder({ service: "custom_comments", link: row.url, comments: row.reply_text ?? "", delay1: 2, delay2: 5 })
              : await createBuyUpvotesOrder({
                  service: row.service_type as "post_upvote" | "post_downvote" | "comment_upvote" | "comment_downvote",
                  link: row.url,
                  quantity: row.upvotes_ordered,
                  speed: SPEED_MAP[row.delivery_speed] ?? SPEED_MAP.normal,
                });
          await db.from("engage_tasks").update({ status: "pending", provider_order_id: String(order.orderId) }).eq("id", row.id);
          submitted++;
        } catch (e) {
          if (!(e instanceof BuyUpvotesError && e.status === 429)) {
            console.error("[reddit-orders poller] retry failed with non-429 error, leaving queued for next tick", { taskId: row.id, error: e instanceof Error ? e.message : e });
          }
          // still at capacity (or a transient error) — leave queued, try again next tick
        }
      }
      return { checked: queued.length, submitted, expired };
    });

    // Balance doesn't need per-tick freshness — only check once/hour (first tick of
    // the hour) to avoid burning request quota on a low-value check every 5 minutes.
    if (new Date().getMinutes() < 5) {
      await step.run("check-balance", async () => {
        try {
          const { balance } = await getBalance();
          if (balance < LOW_BALANCE_THRESHOLD_USD) {
            console.error(`[reddit-orders poller] BuyUpvotes balance low: $${balance} (threshold $${LOW_BALANCE_THRESHOLD_USD})`);
          }
          return { balance };
        } catch (e) {
          console.error("[reddit-orders poller] balance check failed", e instanceof Error ? e.message : e);
          return { balance: null };
        }
      });
    }

    return { sync: syncResult, queue: queueResult };
  }
);
