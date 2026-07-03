import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

// GET /api/agent/chats/[id] — load full messages for a chat
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await db
    .from("agent_chats")
    .select("id, title, messages, created_at")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ chat: data });
}

// PATCH /api/agent/chats/[id] — update messages (auto-save)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { messages, title } = await req.json();

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const update: Record<string, unknown> = { messages, updated_at: new Date().toISOString() };
  if (title) update.title = title;

  const { error } = await db
    .from("agent_chats")
    .update(update)
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/agent/chats/[id]
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await db
    .from("agent_chats")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
