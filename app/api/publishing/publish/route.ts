import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const db = clientFromRequest(req);
  const { data: { user } } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { channelId, articleId } = await req.json();
  if (!channelId || !articleId) {
    return NextResponse.json({ error: "channelId and articleId required" }, { status: 400 });
  }

  const [{ data: channel, error: chErr }, { data: article, error: artErr }] = await Promise.all([
    db.from("publishing_channels").select("*").eq("id", channelId).single(),
    db.from("articles").select("*").eq("id", articleId).single(),
  ]);

  if (chErr || !channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  if (artErr || !article) return NextResponse.json({ error: "Article not found" }, { status: 404 });

  const { data: logEntry } = await db
    .from("publishing_log")
    .insert({
      channel_id: channelId,
      brand_id: channel.brand_id,
      article_id: articleId,
      article_title: article.title,
      status: "running",
    })
    .select()
    .single();

  let success = false;
  let errorMessage: string | null = null;

  try {
    if (channel.type === "webhook") {
      const res = await fetch(channel.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: article.title,
          content: article.content,
          keyword: article.keyword,
          status: "publish",
          source: "rankongeo",
        }),
      });
      if (!res.ok) throw new Error(`Webhook returned ${res.status} ${res.statusText}`);
      success = true;
    } else if (channel.type === "discord") {
      const preview = (article.content as string)?.substring(0, 2000) ?? "";
      const res = await fetch(channel.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          embeds: [{
            title: article.title,
            description: preview,
            color: 0xc8372d,
            footer: { text: `Published via RankOnGeo · Keyword: ${article.keyword}` },
            timestamp: new Date().toISOString(),
          }],
        }),
      });
      if (!res.ok) throw new Error(`Discord returned ${res.status} ${res.statusText}`);
      success = true;
    } else if (channel.type === "wordpress") {
      const auth = Buffer.from(`admin:${channel.api_key ?? ""}`).toString("base64");
      const wpUrl = (channel.url as string).replace(/\/$/, "") + "/wp-json/wp/v2/posts";
      const res = await fetch(wpUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`,
        },
        body: JSON.stringify({
          title: article.title,
          content: article.content,
          status: "publish",
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`WordPress ${res.status}: ${body.substring(0, 200)}`);
      }
      success = true;
    } else {
      throw new Error(`${channel.type} requires manual publish — copy the article content and paste it into your CMS`);
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : "Unknown error";
  }

  if (logEntry) {
    await db.from("publishing_log").update({
      status: success ? "published" : "failed",
      error_message: errorMessage,
    }).eq("id", logEntry.id);
  }

  if (success) {
    await Promise.all([
      db.from("publishing_channels").update({ last_published_at: new Date().toISOString() }).eq("id", channelId),
      db.from("articles").update({ status: "published", published_at: new Date().toISOString() }).eq("id", articleId),
    ]);
  }

  return NextResponse.json({ success, error: errorMessage });
}
