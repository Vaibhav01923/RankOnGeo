import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { sendEmail, teamInviteEmailHtml } from "@/lib/email";
import { TEAM_SEAT_LIMIT } from "@/lib/team";

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: planRow } = await db
    .from("user_plans")
    .select("dodo_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!planRow?.dodo_subscription_id) {
    return NextResponse.json({ error: "Subscribe to a plan to invite teammates" }, { status: 402 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (email === user.email.toLowerCase()) {
    return NextResponse.json({ error: "That's your own email" }, { status: 400 });
  }

  const admin = serverClient();

  // Already a member? Resolve the email to a user id first.
  try {
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const existing = usersData?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      const { data: member } = await admin
        .from("team_members")
        .select("id")
        .eq("owner_user_id", user.id)
        .eq("member_user_id", existing.id)
        .maybeSingle();
      if (member) return NextResponse.json({ error: "Already a member of your workspace" }, { status: 409 });
    }
  } catch {
    // listUsers needs the service-role key; without it we skip this check and
    // rely on the accept path's unique constraint.
  }

  // Seat check: members + pending invites, owner excluded from the count.
  // Read-then-write race is acceptable — accept re-checks the cap.
  const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
    admin.from("team_members").select("id", { count: "exact", head: true }).eq("owner_user_id", user.id),
    admin.from("team_invites").select("id", { count: "exact", head: true })
      .eq("owner_user_id", user.id).eq("status", "pending"),
  ]);
  if ((memberCount ?? 0) + (pendingCount ?? 0) >= TEAM_SEAT_LIMIT) {
    return NextResponse.json({ error: `Workspaces are limited to ${TEAM_SEAT_LIMIT} teammates` }, { status: 400 });
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  // Re-inviting the same email refreshes the pending row (doubles as resend).
  const { data: existingInvite } = await admin
    .from("team_invites")
    .select("id")
    .eq("owner_user_id", user.id)
    .eq("status", "pending")
    .ilike("email", email)
    .maybeSingle();

  let invite;
  if (existingInvite) {
    const { data, error } = await admin
      .from("team_invites")
      .update({ token, expires_at: expiresAt, created_at: new Date().toISOString() })
      .eq("id", existingInvite.id)
      .select("id, email, status, created_at, expires_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invite = data;
  } else {
    const { data, error } = await admin
      .from("team_invites")
      .insert({ owner_user_id: user.id, email, token, expires_at: expiresAt })
      .select("id, email, status, created_at, expires_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    invite = data;
  }

  const origin = req.headers.get("origin") ?? "https://www.rankongeo.com";
  const acceptUrl = `${origin}/invite?token=${token}`;
  // Email failure is non-fatal — the owner still gets the link to share.
  const { sent } = await sendEmail({
    to: email,
    subject: `${user.email} invited you to their RankOnGeo workspace`,
    html: teamInviteEmailHtml(user.email, acceptUrl),
  });

  return NextResponse.json({ invite, acceptUrl, emailSent: sent });
}

export async function DELETE(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { error, count } = await serverClient()
    .from("team_invites")
    .update({ status: "revoked" }, { count: "exact" })
    .eq("id", id)
    .eq("owner_user_id", user.id)
    .eq("status", "pending");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!count) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
