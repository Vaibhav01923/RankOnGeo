import { NextRequest, NextResponse } from "next/server";
import { clientFromRequest } from "@/lib/supabase";
import { publishToChannel } from "@/lib/publish-article";

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

  const result = await publishToChannel(channel, article);
  const success = result.success;
  const errorMessage = result.error;

  if (logEntry) {
    await db.from("publishing_log").update({
      status: success ? "published" : "failed",
      error_message: errorMessage,
    }).eq("id", logEntry.id);
  }

  if (success) {
    await Promise.all([
      db.from("publishing_channels").update({ last_published_at: new Date().toISOString() }).eq("id", channelId),
      db.from("articles").update({
        status: "published",
        published_at: new Date().toISOString(),
        // Remember where it went so it can be reviewed and updated in place later.
        ...(result.publishedUrl ? { published_url: result.publishedUrl } : {}),
        ...(result.remoteId ? { remote_id: result.remoteId, channel_id: channelId } : {}),
      }).eq("id", articleId),
    ]);
  }

  return NextResponse.json({ success, error: errorMessage });
}
