import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { TEAM_SEAT_LIMIT } from "@/lib/team";

type InviteRow = {
  id: string;
  owner_user_id: string;
  email: string;
  status: string;
  expires_at: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function acceptInvite(admin: any, invite: InviteRow, userId: string): Promise<string | null> {
  // Seat cap re-check at accept time (invite POST also checks; races are rare
  // and this is the authoritative gate).
  const { count } = await admin
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", invite.owner_user_id);
  if ((count ?? 0) >= TEAM_SEAT_LIMIT) return "This workspace has no seats left";

  const { error } = await admin
    .from("team_members")
    .insert({ owner_user_id: invite.owner_user_id, member_user_id: userId });
  // 23505 = already a member (replayed link) — treat as success.
  if (error && error.code !== "23505") return error.message;

  await admin
    .from("team_invites")
    .update({ status: "accepted", accepted_by: userId })
    .eq("id", invite.id);
  return null;
}

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token : null;
  const admin = serverClient();
  const userEmail = user.email.toLowerCase();

  if (token) {
    const { data: invite } = await admin
      .from("team_invites")
      .select("id, owner_user_id, email, status, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (!invite || invite.status !== "pending") {
      return NextResponse.json({ error: "Invite not found or no longer valid" }, { status: 404 });
    }
    if (new Date(invite.expires_at).getTime() < Date.now()) {
      await admin.from("team_invites").update({ status: "expired" }).eq("id", invite.id);
      return NextResponse.json({ error: "This invite has expired — ask for a new one" }, { status: 410 });
    }
    // The link is not transferable: the signed-in email must match the
    // invited one. Supabase requires email confirmation, so it's verified.
    if (invite.email.toLowerCase() !== userEmail) {
      return NextResponse.json(
        { error: `This invite was sent to ${invite.email}. Sign in with that email to accept it.` },
        { status: 403 }
      );
    }
    if (invite.owner_user_id === user.id) {
      return NextResponse.json({ error: "You can't join your own workspace" }, { status: 400 });
    }

    const err = await acceptInvite(admin, invite as InviteRow, user.id);
    if (err) return NextResponse.json({ error: err }, { status: 400 });
    return NextResponse.json({ accepted: 1 });
  }

  // Tokenless auto-accept: claim every pending, unexpired invite addressed to
  // this (verified) email. Runs on dashboard mount so invitees who lost the
  // link in the signup/email-confirmation detour still get connected.
  const { data: invites } = await admin
    .from("team_invites")
    .select("id, owner_user_id, email, status, expires_at")
    .eq("status", "pending")
    .ilike("email", userEmail)
    .gt("expires_at", new Date().toISOString());

  let accepted = 0;
  for (const invite of (invites ?? []) as InviteRow[]) {
    if (invite.owner_user_id === user.id) continue;
    const err = await acceptInvite(admin, invite, user.id);
    if (!err) accepted++;
  }
  return NextResponse.json({ accepted });
}
