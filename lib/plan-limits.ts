// Shared across app/api/setup (initial auto-generation), the add/accept
// enforcement endpoints, and the dashboard's usage display — one source of
// truth so these numbers can't drift out of sync with each other again.
export const PLAN_PROMPT_LIMITS: Record<string, number> = { starter: 50, growth: 150, enterprise: 400 };
export const FREE_PROMPT_LIMIT = 20;

export function promptLimitForPlan(plan: string | null | undefined): number {
  return plan ? PLAN_PROMPT_LIMITS[plan] ?? FREE_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
}

// Costs scale with how many prompts actually get scanned — paused ones are
// skipped by every scan (see isDueForScheduledScan), so only active prompts
// count against the limit. Existing brands already over their limit are
// grandfathered: this only ever blocks *adding* more, never removes anything.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function assertUnderPromptLimit(db: any, userId: string, brandId: string): Promise<{ ok: true } | { ok: false; limit: number }> {
  const { data: planRow } = await db.from("user_plans").select("plan, dodo_subscription_id").eq("user_id", userId).maybeSingle();
  const plan = planRow?.dodo_subscription_id ? planRow.plan : null;
  const limit = promptLimitForPlan(plan);

  const { count } = await db
    .from("tracked_prompts")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", brandId)
    .neq("status", "paused");

  if ((count ?? 0) >= limit) return { ok: false, limit };
  return { ok: true };
}
