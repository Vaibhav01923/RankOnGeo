import { serverClient } from "@/lib/supabase";
import { VisibilityScore } from "@/lib/types";
import { isSafeWebhookUrl } from "@/lib/webhook-url";

type AlertPayload = {
  event: "scan_completed";
  brandId: string;
  brandName: string;
  overallScore: number;
  scores: { engine: string; score: number; mentionCount: number; totalPrompts: number }[];
};

function buildSlackBlocks(payload: AlertPayload) {
  const scoreLines = payload.scores
    .map((s) => `• *${s.engine}*: ${s.score}% (${s.mentionCount}/${s.totalPrompts} mentions)`)
    .join("\n");

  return {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Scan complete: ${payload.brandName}`, emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Overall Score*\n${payload.overallScore}%` },
          { type: "mrkdwn", text: `*Engines scanned*\n${payload.scores.length}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: scoreLines || "_No engine results_" },
      },
    ],
  };
}

function buildDiscordEmbed(payload: AlertPayload) {
  return {
    embeds: [
      {
        title: `Scan complete: ${payload.brandName}`,
        color: payload.overallScore >= 60 ? 0x22c55e : payload.overallScore >= 30 ? 0xf59e0b : 0xef4444,
        fields: [
          { name: "Overall Score", value: `${payload.overallScore}%`, inline: true },
          { name: "Engines", value: `${payload.scores.length}`, inline: true },
          ...payload.scores.map((s) => ({
            name: s.engine,
            value: `${s.score}% (${s.mentionCount}/${s.totalPrompts})`,
            inline: true,
          })),
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function sendToDestination(dest: any, payload: AlertPayload, db: ReturnType<typeof serverClient>) {
  let status = "succeeded";
  let error_detail: string | null = null;

  try {
    if ((dest.kind === "slack" || dest.kind === "discord" || dest.kind === "webhook") && !isSafeWebhookUrl(dest.kind, dest.url)) {
      status = "failed";
      error_detail = "This destination's URL isn't allowed. Edit it and paste the webhook URL again.";
    } else if ((dest.kind === "slack" || dest.kind === "discord" || dest.kind === "webhook") && dest.url) {
      let body: unknown;
      if (dest.kind === "slack") body = buildSlackBlocks(payload);
      else if (dest.kind === "discord") body = buildDiscordEmbed(payload);
      else body = payload;

      const res = await fetch(dest.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        status = "failed";
        error_detail = `HTTP ${res.status}: ${await res.text().catch(() => "")}`.slice(0, 500);
      }
    } else if (dest.kind === "email") {
      status = "failed";
      error_detail = "Email delivery not yet configured — add an email provider (e.g. Resend) to enable.";
    } else {
      status = "failed";
      error_detail = `Unknown kind: ${dest.kind}`;
    }
  } catch (err) {
    status = "failed";
    error_detail = String(err).slice(0, 500);
  }

  await Promise.allSettled([
    db.from("alert_deliveries").insert({
      destination_id: dest.id,
      brand_id: payload.brandId,
      event_type: "scan_completed",
      status,
      error_detail: error_detail ?? null,
    }),
    status === "succeeded"
      ? db
          .from("alert_destinations")
          .update({ events_count: (dest.events_count ?? 0) + 1 })
          .eq("id", dest.id)
      : Promise.resolve(),
  ]);
}

export async function fireAlerts(
  brandId: string,
  brandName: string,
  overallScore: number,
  scores: VisibilityScore[]
) {
  const db = serverClient();

  const { data: destinations } = await db
    .from("alert_destinations")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", "active")
    .eq("scan_alerts", true);

  if (!destinations?.length) return;

  const payload: AlertPayload = {
    event: "scan_completed",
    brandId,
    brandName,
    overallScore,
    scores: scores.map((s) => ({
      engine: s.engine,
      score: s.score,
      mentionCount: s.mentionCount,
      totalPrompts: s.totalPrompts,
    })),
  };

  await Promise.allSettled(destinations.map((dest) => sendToDestination(dest, payload, db)));
}
