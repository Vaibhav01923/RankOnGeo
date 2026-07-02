import { NextRequest } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

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

  const { data, error } = await db
    .from("engage_tasks")
    .insert({
      brand_id: brandId,
      user_id: user.id,
      url,
      prompt_text: promptText ?? null,
      engine: engine ?? null,
      reply_text: replyText ?? null,
      upvotes_ordered: upvotesOrdered ?? 0,
      delivery_speed: deliverySpeed ?? "normal",
      status: "in_progress",
    })
    .select()
    .single();

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  return new Response(JSON.stringify({ task: data }), { status: 201, headers: { "Content-Type": "application/json" } });
}
