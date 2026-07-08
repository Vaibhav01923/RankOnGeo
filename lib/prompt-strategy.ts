// Shared prompt-generation strategy for tracked prompts.
//
// Only ~20% of prompts may contain the brand name. The rest are discovery
// queries — questions people in the niche actually type into AI engines when
// they don't know the brand exists. Those are the prompts where showing up
// wins new customers; "Nykaa review" only reaches people who already know Nykaa.

export function promptDistribution(total: number) {
  const branded = Math.round(total * 0.2);
  const competitorAlt = Math.round(total * 0.25);
  const categoryLeader = Math.round(total * 0.3);
  const community = total - branded - competitorAlt - categoryLeader;
  return { branded, competitorAlt, categoryLeader, community };
}

// brandName may be a placeholder like "[Brand]" when the name isn't known
// until the same LLM call extracts it (setup flow).
export function promptStrategy(opts: {
  total: number;
  brandName: string;
  niche: string;
  competitors: string;
}) {
  const { branded, competitorAlt, categoryLeader, community } = promptDistribution(opts.total);
  const { brandName, niche, competitors } = opts;

  return `Prompt strategy — EXACTLY this distribution:

**${branded} BRANDED** (category: "Branded") — the ONLY prompts allowed to contain ${brandName}. These come from people who already know the brand:
- "${brandName} review"
- "is ${brandName} worth it"
- "${brandName} vs [Competitor] which is better"

**${competitorAlt} COMPETITOR-ALTERNATIVE** (category: "Competitor") — user knows a competitor, not the brand. Never mention ${brandName}:
- "alternative to [Competitor]"
- "best [Competitor] alternatives"
- "[Competitor] alternative that [specific benefit]"
Use real competitor names: ${competitors}

**${categoryLeader} CATEGORY / USE-CASE** (category: "Commercial") — questions from someone who has NEVER heard of the brand, hyper-specific to ${niche}. Never mention ${brandName}:
- "best [product or tool type] for [specific audience or problem]"
- "top [category] in 2026"
- "recommend a [category] for [use case]"

**${community} COMMUNITY / DISCUSSION** (category: "Commercial") — short casual questions (3-8 words) written like Reddit thread titles about the niche, never about the brand:
- "which [category] should I actually use"
- "[niche problem] any recommendations"
- "what do you all use for [use case]"

HARD RULE — this is the entire point of the product: only the ${branded} Branded prompts may contain the brand's name or domain in any form. Every other prompt must read like it was written by someone who has no idea the brand exists — they should DISCOVER the brand in the AI answer. If a non-Branded prompt mentions the brand, it is wrong. Do not anchor category prompts to the brand (e.g. "best moisturizers on ${brandName}" is wrong; "best affordable moisturizer for oily skin" is right).`;
}

// Post-generation enforcement: the model sometimes leaks the brand name into
// discovery prompts anyway. Recategorize any name-containing prompt as Branded,
// cap those at the ~20% quota (dropping overflow), and keep the rest.
export function enforceBrandCap<T extends { text: string; category: string }>(
  prompts: T[],
  brandName: string,
  total: number
): T[] {
  if (!brandName.trim()) return prompts.slice(0, total);
  const { branded } = promptDistribution(total);
  const re = new RegExp(brandName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  const withName: T[] = [];
  const discovery: T[] = [];
  for (const p of prompts) (re.test(p.text) ? withName : discovery).push(p);
  return [
    ...withName.slice(0, branded).map((p) => ({ ...p, category: "Branded" })),
    ...discovery,
  ].slice(0, total);
}
