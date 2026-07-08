import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

// Pause / resume a prompt. Paused prompts are excluded from all scans and
// don't count against the plan's tracked-prompt limit.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { status } = await req.json();
  if (!id || !["active", "paused"].includes(status)) {
    return NextResponse.json({ error: "id and status ('active'|'paused') required" }, { status: 400 });
  }

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: prompt } = await db
    .from("tracked_prompts")
    .select("id, brands!inner(user_id)")
    .eq("id", id)
    .single();

  if (!prompt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((prompt as any).brands?.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Resuming starts fresh: back to daily cadence with a clean streak
  const updates = status === "active"
    ? { status, cadence: "daily", won_streak: 0 }
    : { status };
  const { data: updated, error } = await db
    .from("tracked_prompts")
    .update(updates)
    .eq("id", id)
    .select("id, status, cadence")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ prompt: updated });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Verify the prompt belongs to a brand owned by this user before deleting
  const { data: prompt } = await db
    .from("tracked_prompts")
    .select("id, brands!inner(user_id)")
    .eq("id", id)
    .single();

  if (!prompt) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((prompt as any).brands?.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await db.from("tracked_prompts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
