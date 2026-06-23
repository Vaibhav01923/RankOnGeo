import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

const UA = "web:rankongeo:v1.0 (by /u/rankongeo_app)";

export async function POST(req: NextRequest) {
  const { threadId, reply, brandId } = await req.json();
  if (!threadId || !reply) return NextResponse.json({ error: "threadId and reply required" }, { status: 400 });

  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: conn } = await db
    .from("reddit_connections")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", user.id)
    .single();

  if (!conn) return NextResponse.json({ error: "Reddit not connected" }, { status: 403 });

  const { data: thread } = await db
    .from("reddit_threads")
    .select("reddit_id")
    .eq("id", threadId)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  // Refresh token if close to expiry
  let token = conn.access_token;
  if (new Date(conn.expires_at) <= new Date(Date.now() + 60_000)) {
    const res = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.REDDIT_CLIENT_ID}:${process.env.REDDIT_CLIENT_SECRET}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": UA,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: conn.refresh_token }),
    });
    const data = await res.json();
    token = data.access_token;
    await db.from("reddit_connections").update({
      access_token: token,
      expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);
  }

  const postRes = await fetch("https://oauth.reddit.com/api/comment", {
    method: "POST",
    headers: {
      Authorization: `bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": UA,
    },
    body: new URLSearchParams({
      api_type: "json",
      thing_id: `t3_${thread.reddit_id}`,
      text: reply,
    }),
  });

  const result = await postRes.json();
  const redditErrors = result?.json?.errors;
  if (redditErrors?.length) {
    return NextResponse.json({ error: redditErrors[0][1] ?? "Reddit rejected the post" }, { status: 400 });
  }

  // Mark thread as replied
  await db.from("reddit_threads").update({ status: "replied" }).eq("id", threadId);

  return NextResponse.json({ success: true });
}
