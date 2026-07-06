import { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import DodoPayments from "dodopayments";
import { clientFromRequest } from "@/lib/supabase";

const CREDITS_PER_UPVOTE = 0.5;

const getDodo = () =>
  new DodoPayments({
    bearerToken: process.env.DODO_API_KEY!,
    environment: (process.env.DODO_ENVIRONMENT ?? "test_mode") as "test_mode" | "live_mode",
  });

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return new Response(JSON.stringify({ error: "brandId required" }), { status: 400 });

  const { data, error } = await db
    .from("engage_tasks")
    .select("*")
    .eq("brand_id", brandId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ tasks: data ?? [] }), { headers: { "Content-Type": "application/json" } });
}

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const body = await req.json();
  const { brandId, url, promptText, engine, replyText, upvotesOrdered, deliverySpeed } = body;
  if (!brandId || !url) return new Response(JSON.stringify({ error: "brandId and url required" }), { status: 400 });

  const upvotes = upvotesOrdered ?? 0;

  if (upvotes > 0) {
    const { data: userPlan } = await db
      .from("user_plans")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .single();

    if (!userPlan?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "Subscribe to a plan to order upvotes" }), { status: 402 });
    }

    try {
      await getDodo().creditEntitlements.balances.createLedgerEntry(userPlan.stripe_customer_id, {
        credit_entitlement_id: process.env.DODO_CREDIT_ENTITLEMENT_ID!,
        amount: (upvotes * CREDITS_PER_UPVOTE).toString(),
        entry_type: "debit",
        reason: `Reddit upvote order (${upvotes} upvotes)`,
        idempotency_key: randomUUID(),
        metadata: { url },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Not enough credits" }), { status: 402 });
    }
  }

  const { data, error } = await db
    .from("engage_tasks")
    .insert({
      brand_id: brandId,
      user_id: user.id,
      url,
      prompt_text: promptText ?? null,
      engine: engine ?? null,
      reply_text: replyText ?? null,
      upvotes_ordered: upvotes,
      delivery_speed: deliverySpeed ?? "normal",
      status: "pending",
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ task: data }), { status: 201, headers: { "Content-Type": "application/json" } });
}
