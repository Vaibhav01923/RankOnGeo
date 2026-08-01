import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";

// Called once a user lands on /auth/set-password with a live Supabase
// recovery session (the trial-signup "set your password" flow, which never
// goes through /api/verify-email/send — see app/setup/page.tsx). Opening
// that mailed recovery link is itself proof the address is real, the same
// trust level as clicking the dedicated verify-email link, so this marks
// the account verified instead of leaving the dashboard banner stuck
// forever for anyone who came in through this path.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = serverClient();
  await admin
    .from("user_plans")
    .update({ email_verified_at: new Date().toISOString(), email_verify_token: null, email_verify_token_expires_at: null })
    .eq("user_id", user.id)
    .is("email_verified_at", null);

  return NextResponse.json({ ok: true });
}
