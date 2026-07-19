import { NextRequest, NextResponse } from "next/server";
import { serverClient } from "@/lib/supabase";

// Public by design — the unguessable token is the sole trust boundary, same
// shape as the team_invites accept flow. Works with no session so it
// doesn't matter which browser/device the link ends up opened in.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const origin = req.nextUrl.origin;
  if (!token) return NextResponse.redirect(`${origin}/dashboard`);

  const admin = serverClient();
  const { data: row } = await admin
    .from("user_plans")
    .select("user_id, email_verify_token_expires_at")
    .eq("email_verify_token", token)
    .maybeSingle();

  if (!row) return NextResponse.redirect(`${origin}/dashboard`);
  if (row.email_verify_token_expires_at && new Date(row.email_verify_token_expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${origin}/dashboard?verify_expired=1`);
  }

  await admin
    .from("user_plans")
    .update({ email_verified_at: new Date().toISOString(), email_verify_token: null, email_verify_token_expires_at: null })
    .eq("user_id", row.user_id);

  return NextResponse.redirect(`${origin}/dashboard?verified=1`);
}
