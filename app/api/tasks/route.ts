import { NextRequest } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { placeRedditOrder } from "@/lib/reddit-order-service";
import { requireBrandAccess } from "@/lib/team";

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return new Response(JSON.stringify({ error: "brandId required" }), { status: 400 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return new Response(JSON.stringify({ error: "Brand not found" }), { status: 404 });

  // Whole-workspace view: teammates see each other's orders for this brand.
  const { data, error } = await db
    .from("engage_tasks")
    .select("*")
    .eq("brand_id", brandId)
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

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return new Response(JSON.stringify({ error: "Brand not found" }), { status: 404 });

  const upvotes = upvotesOrdered ?? 0;

  if (upvotes > 0) {
    const result = await placeRedditOrder({
      db,
      userId: user.id,
      billingUserId: access.ownerId,
      brandId,
      url,
      serviceType: "post_upvote",
      quantity: upvotes,
      speed: deliverySpeed ?? "normal",
      promptText,
      engine,
    });

    if (!result.ok) return new Response(JSON.stringify({ error: result.error }), { status: result.status });
    return new Response(JSON.stringify({ task: result.task, queued: result.queued }), { status: 201, headers: { "Content-Type": "application/json" } });
  }

  // Free "track without upvotes" path — no credits, no provider order, just a log of the reply.
  const { data, error } = await db
    .from("engage_tasks")
    .insert({
      brand_id: brandId,
      user_id: user.id,
      url,
      prompt_text: promptText ?? null,
      engine: engine ?? null,
      reply_text: replyText ?? null,
      upvotes_ordered: 0,
      delivery_speed: deliverySpeed ?? "normal",
      service_type: "post_upvote",
      credits_charged: 0,
      status: "pending",
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ task: data }), { status: 201, headers: { "Content-Type": "application/json" } });
}
