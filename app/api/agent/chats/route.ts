import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { requireBrandAccess } from "@/lib/team";

// Chats stay personal per user (user_id scoping below) — the brand check
// only confirms the requester may use this brand's workspace at all.

// GET /api/agent/chats?brandId=xxx — list chats for a brand
export async function GET(req: NextRequest) {
  const brandId = req.nextUrl.searchParams.get("brandId");
  if (!brandId) return NextResponse.json({ error: "brandId required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("agent_chats")
    .select("id, title, created_at, updated_at")
    .eq("brand_id", brandId)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ chats: data ?? [] });
}

// POST /api/agent/chats — create a new chat
export async function POST(req: NextRequest) {
  const { brandId, title, messages } = await req.json();
  if (!brandId || !messages) return NextResponse.json({ error: "brandId and messages required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const access = await requireBrandAccess(db, user.id, brandId);
  if (!access) return NextResponse.json({ error: "Brand not found" }, { status: 404 });

  const { data, error } = await db
    .from("agent_chats")
    .insert({ brand_id: brandId, user_id: user.id, title: title ?? "New chat", messages })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id });
}
