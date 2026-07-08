import { randomUUID } from "node:crypto";
import DodoPayments from "dodopayments";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOrder as createBuyUpvotesOrder, BuyUpvotesError } from "@/lib/buyupvotes";
import type { RedditServiceType } from "@/lib/types";

// Priced at a consistent 25 credits per $1 of actual BuyUpvotes cost
// (confirmed against their live /services rates: post votes $0.02/unit,
// comment votes $0.04/unit, custom comments $0.20/unit).
const CREDIT_COST: Record<RedditServiceType, number> = {
  post_upvote: 0.5,
  post_downvote: 0.5,
  comment_upvote: 1,
  comment_downvote: 1,
  custom_comments: 5,
};

const QUANTITY_LIMITS: Record<"post_upvote" | "post_downvote" | "comment_upvote" | "comment_downvote", { min: number; max: number }> = {
  post_upvote: { min: 5, max: 1000 },
  post_downvote: { min: 5, max: 1000 },
  comment_upvote: { min: 5, max: 1000 },
  comment_downvote: { min: 5, max: 1000 },
};

// BuyUpvotes' speed param is deliveries/hour (10-900); map our simple slow/normal/fast picker onto it.
const SPEED_MAP: Record<string, number> = { slow: 50, normal: 200, fast: 900 };

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

const getOpenAI = () => new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Shared by placeRedditOrder (order-failed-to-submit case) and the Inngest poller
// (provider-reports-failed / stuck-in-queue-too-long cases). Deterministic idempotency
// key means calling this twice for the same taskId is always safe — Dodo 409s the retry.
export async function refundRedditOrderCredits(params: {
  customerId: string;
  taskId: string;
  amount: number;
  url: string;
  serviceType: RedditServiceType;
  reason: string;
}) {
  const { customerId, taskId, amount, url, serviceType, reason } = params;
  try {
    await getDodo().creditEntitlements.balances.createLedgerEntry(customerId, {
      credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID!,
      amount: amount.toString(),
      entry_type: "credit",
      reason,
      idempotency_key: `refund:${taskId}`,
      metadata: { url, serviceType },
    });
    return true;
  } catch (e) {
    console.error("[reddit-order] refund failed", { taskId, url, serviceType, error: e instanceof Error ? e.message : e });
    return false;
  }
}

export type PlaceRedditOrderParams = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any, any, any>;
  userId: string;
  brandId: string;
  url: string;
  serviceType: RedditServiceType;
  quantity?: number;
  commentText?: string;
  speed?: "slow" | "normal" | "fast";
  promptText?: string | null;
  engine?: string | null;
};

export type PlaceRedditOrderResult =
  | { ok: true; task: Record<string, unknown>; queued: boolean }
  | { ok: false; status: number; error: string };

export async function placeRedditOrder(params: PlaceRedditOrderParams): Promise<PlaceRedditOrderResult> {
  const { db, userId, brandId, url, serviceType, quantity, commentText, speed, promptText, engine } = params;

  if (!/^https?:\/\/(www\.)?reddit\.com\//i.test(url)) {
    return { ok: false, status: 400, error: "Must be a reddit.com link" };
  }

  let creditsNeeded: number;
  let effectiveQuantity: number;
  let trimmedComment = "";

  if (serviceType === "custom_comments") {
    trimmedComment = (commentText ?? "").trim();
    if (!trimmedComment) return { ok: false, status: 400, error: "Comment text is required" };
    if (trimmedComment.length > 1000) return { ok: false, status: 400, error: "Comment must be 1000 characters or fewer" };

    try {
      const moderation = await getOpenAI().moderations.create({ model: "omni-moderation-latest", input: trimmedComment });
      if (moderation.results[0]?.flagged) {
        return { ok: false, status: 400, error: "Comment violates content policy — no NSFW, explicit, or hateful content allowed" };
      }
    } catch {
      return { ok: false, status: 500, error: "Could not verify comment content — try again" };
    }

    effectiveQuantity = 1;
    creditsNeeded = CREDIT_COST.custom_comments;
  } else {
    const limits = QUANTITY_LIMITS[serviceType];
    const qty = quantity ?? 0;
    if (!Number.isInteger(qty) || qty < limits.min || qty > limits.max) {
      return { ok: false, status: 400, error: `Quantity must be between ${limits.min} and ${limits.max}` };
    }
    effectiveQuantity = qty;
    creditsNeeded = qty * CREDIT_COST[serviceType];
  }

  const { data: userPlan } = await db
    .from("user_plans")
    .select("dodo_customer_id")
    .eq("user_id", userId)
    .single();

  const customerId: string | null = userPlan?.dodo_customer_id ?? null;
  if (!customerId) {
    return { ok: false, status: 402, error: "Subscribe to a plan to order Reddit engagement" };
  }

  const taskId = randomUUID();
  const dodo = getDodo();

  try {
    await dodo.creditEntitlements.balances.createLedgerEntry(customerId, {
      credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID!,
      amount: creditsNeeded.toString(),
      entry_type: "debit",
      reason: `Reddit ${serviceType} order (${effectiveQuantity})`,
      idempotency_key: `order:${taskId}`,
      metadata: { url, serviceType },
    });
  } catch {
    return { ok: false, status: 402, error: "Not enough credits" };
  }

  const refund = (reason: string) => refundRedditOrderCredits({ customerId, taskId, amount: creditsNeeded, url, serviceType, reason });

  let providerOrderId: string | null = null;
  let status: "pending" | "queued" = "pending";

  try {
    const order =
      serviceType === "custom_comments"
        ? await createBuyUpvotesOrder({ service: "custom_comments", link: url, comments: trimmedComment, delay1: 2, delay2: 5 })
        : await createBuyUpvotesOrder({ service: serviceType, link: url, quantity: effectiveQuantity, speed: SPEED_MAP[speed ?? "normal"] });
    providerOrderId = String(order.orderId);
  } catch (e) {
    if (e instanceof BuyUpvotesError && e.status === 429) {
      // Concurrency cap hit (max 3 pending/running per link+service) — don't refund, the poller retries submission.
      status = "queued";
    } else {
      await refund(`Refund: order failed to submit (${e instanceof Error ? e.message : "unknown error"})`);
      return { ok: false, status: 502, error: "Failed to submit order to provider — credits refunded" };
    }
  }

  const { data: task, error } = await db
    .from("engage_tasks")
    .insert({
      id: taskId,
      brand_id: brandId,
      user_id: userId,
      url,
      prompt_text: promptText ?? null,
      engine: engine ?? null,
      reply_text: serviceType === "custom_comments" ? trimmedComment : null,
      upvotes_ordered: serviceType === "custom_comments" ? 0 : effectiveQuantity,
      delivery_speed: speed ?? "normal",
      service_type: serviceType,
      provider_order_id: providerOrderId,
      credits_charged: creditsNeeded,
      status,
    })
    .select()
    .single();

  if (error) {
    // Nothing will ever track/deliver this order if the row didn't save — refund rather than silently eat the credits.
    await refund(`Refund: failed to save order record (${error.message})`);
    return { ok: false, status: 500, error: "Failed to save order" };
  }

  return { ok: true, task, queued: status === "queued" };
}
