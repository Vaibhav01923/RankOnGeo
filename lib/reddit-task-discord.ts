import type { RedditServiceType } from "@/lib/types";

const SERVICE_LABELS: Record<RedditServiceType, string> = {
  post_upvote: "Post upvotes",
  post_downvote: "Post downvotes",
  comment_upvote: "Comment upvotes",
  comment_downvote: "Comment downvotes",
  custom_comments: "Custom comment",
  create_post: "Create a new post",
};

// Reddit engagement tasks are fulfilled by a human on the team, not an
// automated provider — this posts the task to Discord with a link-style
// "Mark as Done" button so whoever picks it up can close it out with one
// click. Link buttons (style 5) work on a plain incoming webhook with no
// bot/interactions endpoint required — they just open a URL, no callback.
export async function notifyDiscordOfTask(params: {
  taskId: string;
  markDoneToken: string;
  brandName: string;
  url: string;
  serviceType: RedditServiceType;
  quantity: number;
  commentText?: string | null;
  speed?: string | null;
  promptText?: string | null;
  engine?: string | null;
  subreddit?: string | null;
  postTitle?: string | null;
}): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_TASKS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[reddit-task-discord] DISCORD_TASKS_WEBHOOK_URL not configured");
    return false;
  }

  const isCreatePost = params.serviceType === "create_post";
  const markDoneUrl = `https://www.rankongeo.com/api/tasks/mark-done?taskId=${params.taskId}&token=${params.markDoneToken}`;

  const fields: { name: string; value: string; inline?: boolean }[] = [
    { name: "Brand", value: params.brandName, inline: true },
    { name: "Type", value: SERVICE_LABELS[params.serviceType] ?? params.serviceType, inline: true },
  ];
  if (isCreatePost) {
    fields.push({ name: "Subreddit", value: `r/${params.subreddit}`, inline: true });
    fields.push({ name: "Title", value: (params.postTitle ?? "").slice(0, 300) });
  } else if (params.serviceType !== "custom_comments") {
    fields.push({ name: "Quantity", value: String(params.quantity), inline: true });
  }
  if (params.speed) fields.push({ name: "Speed", value: params.speed, inline: true });
  if (params.engine) fields.push({ name: "Engine", value: params.engine, inline: true });
  if (params.promptText) fields.push({ name: "Prompt", value: params.promptText.slice(0, 200) });
  if (params.commentText) fields.push({ name: isCreatePost ? "Body" : "Comment text", value: params.commentText.slice(0, 1000) });

  const body = {
    embeds: [
      {
        title: isCreatePost ? "New Reddit post to submit" : "New Reddit engagement task",
        url: params.url,
        color: 0xb1552e,
        fields,
        timestamp: new Date().toISOString(),
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 5, label: "✅ Mark as Done", url: markDoneUrl },
          { type: 2, style: 5, label: isCreatePost ? "Open subreddit" : "Open Reddit link", url: params.url },
        ],
      },
    ],
  };

  try {
    const res = await fetch(`${webhookUrl}?with_components=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[reddit-task-discord] send failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("[reddit-task-discord] send threw", e instanceof Error ? e.message : e);
    return false;
  }
}
