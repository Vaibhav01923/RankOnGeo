// The AI-visibility "gaps": tracked prompts where AI engines answer without
// mentioning the brand. Mirrors computeGaps in app/dashboard/page.tsx, but works
// on raw scan_results rows so the server (Autopilot, the SEO & GEO tab) sees the
// same gaps the dashboard does. Pure, so it can be tested.

export type GapScanRow = {
  prompt_id: string | null;
  prompt_text: string;
  engine: string;
  response: string | null;
  brand_mentioned: boolean | null;
  competitor_mentions: { name: string; rank?: number | null }[] | null;
};

export type ServerGap = { promptText: string; engines: string[]; topCompetitor: string | null };

export const ENGINE_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google: "Google AI",
  grok: "Grok",
};

export function gapsFromScanRows(rows: GapScanRow[]): ServerGap[] {
  const groups = new Map<string, GapScanRow[]>();
  for (const r of rows) {
    const key = r.prompt_id ?? r.prompt_text;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  const gaps: ServerGap[] = [];
  for (const list of groups.values()) {
    // An empty response means the engine had no answer surface (e.g. no Google AI
    // Overview for that query); that is not a gap the brand can fill.
    const missing = list.filter((r) => !r.brand_mentioned && (r.response ?? "").trim());
    if (missing.length === 0) continue;
    const counts: Record<string, number> = {};
    for (const r of list) for (const c of r.competitor_mentions ?? []) counts[c.name] = (counts[c.name] ?? 0) + 1;
    gaps.push({
      promptText: list[0].prompt_text,
      engines: missing.map((r) => r.engine),
      topCompetitor: Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    });
  }
  return gaps.sort((a, b) => b.engines.length - a.engines.length || a.promptText.localeCompare(b.promptText));
}
