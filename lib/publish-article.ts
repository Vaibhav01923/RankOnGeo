// One place that knows how to deliver an article to each kind of publishing
// channel. Used by the dashboard's Publish button and by the blog autopilot,
// so a post goes out the same way whoever triggered it.

export type PublishChannel = {
  type: string;
  url: string;
  api_key: string | null;
  username: string | null;
};

export type PublishableArticle = {
  title: string;
  content: string | null;
  keyword: string | null;
  description: string | null;
  tags: string[] | null;
  image_url: string | null;
};

export type PublishResult = {
  success: boolean;
  error: string | null;
  // Set when the destination told us where the post lives and how to find it
  // again. Both are needed to update it in place later.
  remoteId: string | null;
  publishedUrl: string | null;
};

// `update` re-sends an already-published post. Only destinations that can
// address a post by id are supported: WordPress, and webhook receivers that
// returned an id the first time (which is how they signal they can update).
export type PublishOptions = { update?: { remoteId: string } };

export function canUpdateInPlace(channelType: string, remoteId: string | null | undefined): boolean {
  return !!remoteId && (channelType === "wordpress" || channelType === "webhook");
}

// Articles are stored with their "# Title" line on top: the writer reads the
// title from it and its quality check requires it. Every destination shows the
// title on its own (the webhook's "title" field, the WordPress post title, the
// Discord embed title), so sending that line too printed the title twice.
export function bodyWithoutTitle(content: string | null): string {
  return (content ?? "").replace(/^\s*#[ \t]+[^\n]*(?:\n+|$)/, "");
}

function pick(json: unknown, keys: string[]): string | null {
  if (!json || typeof json !== "object") return null;
  for (const k of keys) {
    const v = (json as Record<string, unknown>)[k];
    if (typeof v === "string" && v) return v;
    if (typeof v === "number") return String(v);
  }
  return null;
}

export async function publishToChannel(channel: PublishChannel, article: PublishableArticle, opts: PublishOptions = {}): Promise<PublishResult> {
  const fail = (error: string): PublishResult => ({ success: false, error, remoteId: null, publishedUrl: null });
  const body = bodyWithoutTitle(article.content);
  try {
    if (channel.type === "webhook") {
      // api_key doubles as a shared secret for webhook channels (unused by
      // this type otherwise) — sent so the receiver can verify the request
      // actually came from RankOnGeo. See the "Copy AI setup prompt" flow
      // in the dashboard's Add Channel modal, which generates this secret
      // and tells the user's endpoint to check for it.
      const res = await fetch(channel.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(channel.api_key ? { "X-RankOnGeo-Secret": channel.api_key } : {}),
        },
        body: JSON.stringify({
          title: article.title,
          content: body,
          keyword: article.keyword,
          // Optional — receivers built before these existed can ignore them.
          description: article.description ?? "",
          tags: Array.isArray(article.tags) ? article.tags : [],
          image_url: article.image_url ?? "",
          status: "publish",
          source: "rankongeo",
          ...(opts.update ? { action: "update", external_id: opts.update.remoteId } : {}),
        }),
      });
      if (!res.ok) return fail(`Webhook returned ${res.status} ${res.statusText}`);
      // Receivers that reply with { id, url } let RankOnGeo track and later
      // update the post. Plain "200 OK" receivers still work for publishing.
      const json = await res.json().catch(() => null);
      return { success: true, error: null, remoteId: pick(json, ["id", "external_id"]) ?? opts.update?.remoteId ?? null, publishedUrl: pick(json, ["url", "link"]) };
    }

    if (channel.type === "discord") {
      const preview = body.substring(0, 2000);
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
      if (!res.ok) return fail(`Discord returned ${res.status} ${res.statusText}`);
      return { success: true, error: null, remoteId: null, publishedUrl: null };
    }

    if (channel.type === "wordpress") {
      // username wasn't collected from the user before — hardcoding "admin"
      // silently 401s for anyone whose WP admin username isn't literally
      // that. Existing channels with no username saved keep the old
      // behavior via this fallback.
      const wpUser = channel.username || "admin";
      const auth = Buffer.from(`${wpUser}:${channel.api_key ?? ""}`).toString("base64");
      const base = channel.url.replace(/\/$/, "") + "/wp-json/wp/v2/posts";
      const res = await fetch(opts.update ? `${base}/${encodeURIComponent(opts.update.remoteId)}` : base, {
        method: "POST", // WordPress accepts POST for updates to /posts/{id}
        headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          title: article.title,
          content: body,
          status: "publish",
          ...(article.description ? { excerpt: article.description } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return fail(`WordPress ${res.status}: ${body.substring(0, 200)}`);
      }
      const json = await res.json().catch(() => null);
      return { success: true, error: null, remoteId: pick(json, ["id"]) ?? opts.update?.remoteId ?? null, publishedUrl: pick(json, ["link"]) };
    }

    return fail(`${channel.type} requires manual publish — copy the article content and paste it into your CMS`);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Unknown error");
  }
}
