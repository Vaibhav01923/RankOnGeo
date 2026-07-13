import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";

// Resolve user ids → emails via the service-role admin API (same pattern as
// app/api/admin/tasks). Falls back to the raw id if the lookup fails.
async function emailMapFor(userIds: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (userIds.length === 0) return map;
  try {
    const { data } = await serverClient().auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (userIds.includes(u.id)) map[u.id] = u.email ?? u.id;
    }
  } catch {
    for (const id of userIds) map[id] = id;
  }
  return map;
}

export async function GET(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = serverClient();

  const [{ data: planRow }, { data: members }, { data: invites }, { data: memberships }] = await Promise.all([
    db.from("user_plans").select("dodo_subscription_id").eq("user_id", user.id).maybeSingle(),
    admin.from("team_members").select("id, member_user_id, created_at").eq("owner_user_id", user.id).order("created_at"),
    admin.from("team_invites").select("id, email, status, created_at, expires_at").eq("owner_user_id", user.id)
      .in("status", ["pending"]).order("created_at"),
    admin.from("team_members").select("id, owner_user_id").eq("member_user_id", user.id),
  ]);

  // Lazily surface expiry on pending invites (display only — accept re-checks).
  const now = Date.now();
  const expiredIds = (invites ?? []).filter((i) => new Date(i.expires_at).getTime() < now).map((i) => i.id);
  if (expiredIds.length > 0) {
    await admin.from("team_invites").update({ status: "expired" }).in("id", expiredIds);
  }

  const emails = await emailMapFor([
    ...(members ?? []).map((m) => m.member_user_id as string),
    ...(memberships ?? []).map((m) => m.owner_user_id as string),
  ]);

  return NextResponse.json({
    isPaid: !!planRow?.dodo_subscription_id,
    members: (members ?? []).map((m) => ({
      id: m.id,
      email: emails[m.member_user_id as string] ?? m.member_user_id,
      createdAt: m.created_at,
    })),
    invites: (invites ?? []).map((i) => ({
      id: i.id,
      email: i.email,
      status: expiredIds.includes(i.id) ? "expired" : i.status,
      createdAt: i.created_at,
      expiresAt: i.expires_at,
    })),
    memberships: (memberships ?? []).map((m) => ({
      id: m.id,
      ownerEmail: emails[m.owner_user_id as string] ?? m.owner_user_id,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const memberId = req.nextUrl.searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const admin = serverClient();
  const { data: row } = await admin
    .from("team_members")
    .select("id, owner_user_id, member_user_id")
    .eq("id", memberId)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Owner removes a member from their workspace, or a member leaves.
  const allowed = row.owner_user_id === user.id || row.member_user_id === user.id;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await admin.from("team_members").delete().eq("id", memberId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
