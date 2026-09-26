// Where the server is allowed to POST alerts and reports. Customers type these URLs
// in, and the server fetches them, so an unchecked URL could be pointed at
// localhost or a private network. Slack and Discord webhooks must be the real
// services; a generic webhook must be public https.

const PRIVATE_HOST = [
  /^localhost$/i,
  /\.localhost$/i,
  /\.local$/i,
  /\.internal$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\./,
  /^\[?::1\]?$/,
  /^\[?(fc|fd)[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
];

export function isSafeWebhookUrl(kind: string, raw: string | null | undefined): boolean {
  if (!raw) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  if (kind === "slack") return host === "hooks.slack.com" && u.pathname.startsWith("/services/");
  if (kind === "discord") return /^(discord|discordapp)\.com$/.test(host.replace(/^(ptb|canary)\./, "")) && u.pathname.startsWith("/api/webhooks/");
  if (kind === "webhook") return !PRIVATE_HOST.some((re) => re.test(host)) && host.includes(".");
  return false;
}

export function webhookUrlProblem(kind: string): string {
  if (kind === "slack") return "That doesn't look like a Slack incoming-webhook URL (it should start with https://hooks.slack.com/services/).";
  if (kind === "discord") return "That doesn't look like a Discord webhook URL (it should start with https://discord.com/api/webhooks/).";
  return "Webhook URLs must be public https addresses.";
}

export const isEmail = (s: string | null | undefined): s is string => typeof s === "string" && s.length <= 254 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]{2,}$/.test(s);
