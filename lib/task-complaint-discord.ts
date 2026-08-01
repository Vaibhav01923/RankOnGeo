// Posts a user-submitted "raise a complaint" report (about a past
// engage_task — a Reddit order, create-post task, etc.) to Discord so it's
// triaged like any other support report, without a whole ticketing system.
export async function notifyDiscordOfComplaint(params: {
  taskId: string;
  taskUrl: string;
  serviceType: string;
  brandName: string;
  userEmail: string;
  message: string;
}): Promise<boolean> {
  const webhookUrl = process.env.DISCORD_COMPLAINTS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("[task-complaint-discord] DISCORD_COMPLAINTS_WEBHOOK_URL not configured");
    return false;
  }

  const embed = {
    title: "New task complaint",
    color: 0xd6493a,
    fields: [
      { name: "Brand", value: params.brandName, inline: true },
      { name: "Task type", value: params.serviceType, inline: true },
      { name: "Reported by", value: params.userEmail, inline: true },
      { name: "Task", value: params.taskUrl },
      { name: "Issue", value: params.message.slice(0, 1000) },
    ],
    timestamp: new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error("[task-complaint-discord] send failed", res.status, await res.text().catch(() => ""));
    return res.ok;
  } catch (e) {
    console.error("[task-complaint-discord] send threw", e instanceof Error ? e.message : e);
    return false;
  }
}
