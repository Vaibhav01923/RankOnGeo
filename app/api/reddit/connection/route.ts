import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ connected: false });

  const { data } = await db
    .from("reddit_connections")
    .select("reddit_username")
    .eq("user_id", user.id)
    .single();

  return NextResponse.json({ connected: !!data, username: data?.reddit_username ?? null });
}

export async function DELETE(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  await db.from("reddit_connections").delete().eq("user_id", user.id);
  return NextResponse.json({ success: true });
}
