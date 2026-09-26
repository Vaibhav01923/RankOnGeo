// Human visitors who arrive from an AI answer engine (someone clicking a
// link inside a ChatGPT/Perplexity/Claude/etc. answer). Different from AI
// *crawlers* (bot_visits), which are the engines fetching your pages.

const AI_HOSTS: Record<string, string> = {
  "chatgpt.com": "ChatGPT",
  "chat.openai.com": "ChatGPT",
  "perplexity.ai": "Perplexity",
  "claude.ai": "Claude",
  "gemini.google.com": "Gemini",
  "bard.google.com": "Gemini",
  "copilot.microsoft.com": "Copilot",
  "you.com": "You.com",
  "poe.com": "Poe",
  "grok.com": "Grok",
  "chat.deepseek.com": "DeepSeek",
  "deepseek.com": "DeepSeek",
  "meta.ai": "Meta AI",
  "phind.com": "Phind",
};

// ChatGPT (and some others) append ?utm_source=<name> to outbound links, and
// browsers often drop the Referer on those clicks — so utm_source is checked
// as well as the referrer host, otherwise a big share of AI traffic would
// silently read as "Direct".
const UTM_ALIASES: Record<string, string> = {
  chatgpt: "ChatGPT",
  openai: "ChatGPT",
  perplexity: "Perplexity",
  claude: "Claude",
  anthropic: "Claude",
  gemini: "Gemini",
  copilot: "Copilot",
  grok: "Grok",
  deepseek: "DeepSeek",
  phind: "Phind",
  poe: "Poe",
};

function engineForHost(host: string): string | null {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (AI_HOSTS[h]) return AI_HOSTS[h];
  for (const key of Object.keys(AI_HOSTS)) {
    if (h.endsWith(`.${key}`)) return AI_HOSTS[key];
  }
  return null;
}

/** Which AI engine (if any) a single visit came from. */
export function aiEngineForVisit(referrerHost: string, utmSource: string | null | undefined): string | null {
  const fromHost = engineForHost(referrerHost);
  if (fromHost) return fromHost;
  if (!utmSource) return null;
  const u = utmSource.trim().toLowerCase();
  if (!u) return null;
  if (u.includes(".")) return engineForHost(u);
  return UTM_ALIASES[u] ?? null;
}
