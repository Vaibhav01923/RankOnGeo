import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest, serverClient } from "@/lib/supabase";
import { sendEmail, setPasswordEmailHtml } from "@/lib/email";

// Sends a "set your password" link for accounts created without one (the
// trial signup in app/setup/page.tsx signs the user up with a throwaway
// generated password so they never have to type one up front). Uses
// Supabase's own recovery-link primitive rather than the app's custom
// email-verify token, because a recovery link establishes a session on
// whatever device opens it — a prerequisite for calling auth.updateUser
// there, which a hand-rolled token can't do.
export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const origin = req.headers.get("origin") ?? "https://www.rankongeo.com";
  const admin = serverClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
    options: { redirectTo: `${origin}/auth/set-password` },
  });
  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? "failed to generate link" }, { status: 500 });
  }

  const { sent } = await sendEmail({
    to: user.email,
    subject: "Set your RankOnGeo password",
    html: setPasswordEmailHtml(data.properties.action_link),
  });

  return NextResponse.json({ sent });
}
