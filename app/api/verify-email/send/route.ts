import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { sendEmail, verificationEmailHtml } from "@/lib/email";

// Sends (or resends — calling this again just issues a fresh token) a
// verification link decoupled from Supabase's own "Confirm email" gate,
// which — once disabled to remove signup friction — auto-confirms everyone
// with no real email round-trip at all. This is what actually verifies the
// address is real, without blocking any product access on it.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const admin = serverClient();
  const { error } = await admin
    .from("user_plans")
    .update({ email_verify_token: token, email_verify_token_expires_at: expiresAt })
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const origin = req.headers.get("origin") ?? "https://www.rankongeo.com";
  const verifyUrl = `${origin}/api/verify-email/confirm?token=${token}`;
  const { sent } = await sendEmail({
    to: user.email,
    subject: "Confirm your RankOnGeo email",
    html: verificationEmailHtml(verifyUrl),
  });

  return NextResponse.json({ sent });
}
