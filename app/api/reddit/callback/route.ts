import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientFromRequest } from "@/lib/supabase";

const UA = "web:rankongeo:v1.0 (by /u/rankongeo_app)";
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.rankongeo.com";

async function refreshIfNeeded(connection: { access_token: string; refresh_token: string; expires_at: string }) {
  if (new Date(connection.expires_at) > new Date(Date.now() + 60_000)) return connection.access_token;
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: connection.refresh_token }),
  });
  const data = await res.json();
  return data.access_token as string;
}
export { refreshIfNeeded };

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get("reddit_oauth_state")?.value;
  const brandId = cookieStore.get("reddit_oauth_brand")?.value ?? "";
  cookieStore.delete("reddit_oauth_state");
  cookieStore.delete("reddit_oauth_brand");

  const dashboardUrl = `${BASE}/dashboard?brandId=${brandId}&tab=social`;

  if (error || !code || state !== savedState) {
    return NextResponse.redirect(`${dashboardUrl}&reddit=denied`);
  }

  const tokenRes = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.REDDIT_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) return NextResponse.redirect(`${dashboardUrl}&reddit=error`);

  const { access_token, refresh_token, expires_in } = await tokenRes.json();

  const meRes = await fetch("https://oauth.reddit.com/api/v1/me", {
    headers: { Authorization: `bearer ${access_token}`, "User-Agent": UA },
  });
  const { name: reddit_username } = await meRes.json();

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.redirect(`${BASE}/auth`);

  await db.from("reddit_connections").upsert({
    user_id: user.id,
    reddit_username,
    access_token,
    refresh_token,
    expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return NextResponse.redirect(`${dashboardUrl}&reddit=connected`);
}
