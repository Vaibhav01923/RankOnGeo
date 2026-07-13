import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

// Public by design: powers the /invite landing page before login. The
// unguessable 256-bit token is the only gate, and the response exposes
// nothing sensitive (owner email is what the invite email already shows).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const admin = serverClient();
  const { data: invite } = await admin
    .from("team_invites")
    .select("owner_user_id, email, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  let ownerEmail = "A RankOnGeo user";
  try {
    const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
    const owner = data?.users?.find((u) => u.id === invite.owner_user_id);
    if (owner?.email) ownerEmail = owner.email;
  } catch {
    // service-role key missing — keep the generic label
  }

  const expired =
    invite.status === "pending" && new Date(invite.expires_at).getTime() < Date.now();

  return NextResponse.json({
    ownerEmail,
    status: expired ? "expired" : invite.status,
    expired,
    invitedEmail: maskEmail(invite.email),
  });
}
