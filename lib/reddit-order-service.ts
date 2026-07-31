import { randomUUID } from "node:crypto";
import DodoPayments from "dodopayments";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyDiscordOfTask } from "@/lib/reddit-task-discord";
import type { RedditServiceType } from "@/lib/types";

// Kept at the same rate as when these were fulfilled via a paid provider
// (BuyUpvotes) — tasks are now routed to Discord for a human to fulfill
// instead, but the pricing was left unchanged.
const CREDIT_COST: Record<RedditServiceType, number> = {
  post_upvote: 0.5,
  post_downvote: 0.5,
  comment_upvote: 1,
  comment_downvote: 1,
  custom_comments: 5,
  create_post: 25,
};

// Reddit's own subreddit name rules: 3-21 chars, letters/digits/underscore.
const SUBREDDIT_RE = /^[A-Za-z0-9_]{3,21}$/;

const QUANTITY_LIMITS: Record<"post_upvote" | "post_downvote" | "comment_upvote" | "comment_downvote", { min: number; max: number }> = {
  post_upvote: { min: 5, max: 1000 },
  post_downvote: { min: 5, max: 1000 },
  comment_upvote: { min: 5, max: 1000 },
  comment_downvote: { min: 5, max: 1000 },
};

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
  // Whose Dodo credits pay for the order — the workspace owner when a team
  // member places it. Defaults to userId (solo case).
  billingUserId?: string;
  brandId: string;
  // Required for every serviceType except create_post, which doesn't have a
  // URL yet — the target subreddit is used to construct one instead.
  url?: string;
  serviceType: RedditServiceType;
  quantity?: number;
  commentText?: string;
  speed?: "slow" | "normal" | "fast";
  promptText?: string | null;
  engine?: string | null;
  // create_post only
  subreddit?: string;
  postTitle?: string;
  mediaUrl?: string;
};

export type PlaceRedditOrderResult =
  | { ok: true; task: Record<string, unknown>; queued: boolean }
  | { ok: false; status: number; error: string };

// Basic http(s) URL check — the actual media (image or video) is fetched
// and attached by whoever fulfills the task in Discord, not by us.
function isValidMediaUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function placeRedditOrder(params: PlaceRedditOrderParams): Promise<PlaceRedditOrderResult> {
  const { db, userId, brandId, serviceType, quantity, commentText, speed, promptText, engine, subreddit, postTitle, mediaUrl } = params;
  const billingUserId = params.billingUserId ?? userId;

  let url: string;
  let creditsNeeded: number;
  let effectiveQuantity: number;
  let trimmedComment = "";
  let trimmedTitle = "";
  let trimmedSubreddit = "";
  let trimmedMediaUrl = "";

  if (serviceType === "create_post") {
    trimmedSubreddit = (subreddit ?? "").trim().replace(/^r\//i, "");
    if (!SUBREDDIT_RE.test(trimmedSubreddit)) {
      return { ok: false, status: 400, error: "Enter a valid subreddit name (letters, numbers, underscores, 3-21 characters)" };
    }
    trimmedTitle = (postTitle ?? "").trim();
    if (!trimmedTitle) return { ok: false, status: 400, error: "Post title is required" };
    if (trimmedTitle.length > 300) return { ok: false, status: 400, error: "Title must be 300 characters or fewer" };
    trimmedComment = (commentText ?? "").trim();
    if (trimmedComment.length > 10000) return { ok: false, status: 400, error: "Body must be 10,000 characters or fewer" };
    trimmedMediaUrl = (mediaUrl ?? "").trim();
    if (trimmedMediaUrl && !isValidMediaUrl(trimmedMediaUrl)) {
      return { ok: false, status: 400, error: "Image/video URL must be a valid http(s) link" };
    }

    try {
      const moderation = await getOpenAI().moderations.create({ model: "omni-moderation-latest", input: `${trimmedTitle}\n\n${trimmedComment}` });
      if (moderation.results[0]?.flagged) {
        return { ok: false, status: 400, error: "Post violates content policy — no NSFW, explicit, or hateful content allowed" };
      }
    } catch (e) {
      console.error("[reddit-order] moderation check failed", { subreddit: trimmedSubreddit, error: e instanceof Error ? e.message : e });
      return { ok: false, status: 500, error: "Could not verify post content — try again" };
    }

    url = `https://www.reddit.com/r/${trimmedSubreddit}/`;
    effectiveQuantity = 1;
    creditsNeeded = CREDIT_COST.create_post;
  } else {
    url = params.url ?? "";
    if (!/^https?:\/\/(www\.)?reddit\.com\//i.test(url)) {
      return { ok: false, status: 400, error: "Must be a reddit.com link" };
    }

    if (serviceType === "custom_comments") {
      trimmedComment = (commentText ?? "").trim();
      if (!trimmedComment) return { ok: false, status: 400, error: "Comment text is required" };
      if (trimmedComment.length > 1000) return { ok: false, status: 400, error: "Comment must be 1000 characters or fewer" };

      try {
        const moderation = await getOpenAI().moderations.create({ model: "omni-moderation-latest", input: trimmedComment });
        if (moderation.results[0]?.flagged) {
          return { ok: false, status: 400, error: "Comment violates content policy — no NSFW, explicit, or hateful content allowed" };
        }
      } catch (e) {
        console.error("[reddit-order] moderation check failed", { url, error: e instanceof Error ? e.message : e });
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
  }

  let userPlan: { dodo_customer_id: string | null } | null = null;
  try {
    const { data } = await db
      .from("user_plans")
      .select("dodo_customer_id")
      .eq("user_id", billingUserId)
      .single();
    userPlan = data;
  } catch (e) {
    console.error("[reddit-order] user_plans lookup failed", { billingUserId, error: e instanceof Error ? e.message : e });
    return { ok: false, status: 500, error: "Failed to look up your plan — try again" };
  }

  const customerId: string | null = userPlan?.dodo_customer_id ?? null;
  if (!customerId) {
    return {
      ok: false,
      status: 402,
      error: billingUserId === userId
        ? "Subscribe to a plan to order Reddit engagement"
        : "This workspace has no active plan",
    };
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
  } catch (e) {
    console.error("[reddit-order] credit debit failed", { taskId, url, serviceType, creditsNeeded, error: e instanceof Error ? e.message : e });
    return { ok: false, status: 402, error: "Not enough credits" };
  }

  const refund = (reason: string) => refundRedditOrderCredits({ customerId, taskId, amount: creditsNeeded, url, serviceType, reason });
  const markDoneToken = randomUUID();

  const { data: task, error } = await db
    .from("engage_tasks")
    .insert({
      id: taskId,
      brand_id: brandId,
      user_id: userId,
      url,
      prompt_text: promptText ?? null,
      engine: engine ?? null,
      reply_text: serviceType === "custom_comments" || serviceType === "create_post" ? trimmedComment || null : null,
      post_title: serviceType === "create_post" ? trimmedTitle : null,
      media_url: serviceType === "create_post" ? trimmedMediaUrl || null : null,
      upvotes_ordered: serviceType === "custom_comments" || serviceType === "create_post" ? 0 : effectiveQuantity,
      delivery_speed: speed ?? "normal",
      service_type: serviceType,
      credits_charged: creditsNeeded,
      status: "pending",
      mark_done_token: markDoneToken,
    })
    .select()
    .single();

  if (error) {
    // Nothing will ever notify/deliver this order if the row didn't save — refund rather than silently eat the credits.
    await refund(`Refund: failed to save order record (${error.message})`);
    return { ok: false, status: 500, error: "Failed to save order" };
  }

  // Fulfilled by a human on the team via the Discord notification, not an
  // automated provider — if nobody ever sees it, refund rather than leave
  // the customer having paid for engagement that will never happen.
  const { data: brand } = await db.from("brands").select("name").eq("id", brandId).maybeSingle();
  const notified = await notifyDiscordOfTask({
    taskId,
    markDoneToken,
    brandName: (brand as { name?: string } | null)?.name ?? "Unknown brand",
    url,
    serviceType,
    quantity: effectiveQuantity,
    commentText: serviceType === "custom_comments" || serviceType === "create_post" ? trimmedComment || null : null,
    speed: serviceType === "custom_comments" || serviceType === "create_post" ? null : speed ?? "normal",
    promptText: promptText ?? null,
    engine: engine ?? null,
    subreddit: serviceType === "create_post" ? trimmedSubreddit : null,
    postTitle: serviceType === "create_post" ? trimmedTitle : null,
    mediaUrl: serviceType === "create_post" ? trimmedMediaUrl || null : null,
  });

  if (!notified) {
    await db.from("engage_tasks").update({ status: "failed" }).eq("id", taskId);
    await refund("Refund: failed to notify the team about this task");
    return { ok: false, status: 502, error: "Failed to notify the team — credits refunded" };
  }

  return { ok: true, task, queued: false };
}
