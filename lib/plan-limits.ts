// Shared across app/api/setup (initial auto-generation), the add/accept
// enforcement endpoints, and the dashboard's usage display — one source of
// truth so these numbers can't drift out of sync with each other again.
export const PLAN_PROMPT_LIMITS: Record<string, number> = { starter: 20, growth: 50, enterprise: 100 };
export const FREE_PROMPT_LIMIT = 20;

export function promptLimitForPlan(plan: string | null | undefined): number {
  return plan ? PLAN_PROMPT_LIMITS[plan] ?? FREE_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
}

// How many brands a plan can track — enforced in app/api/setup (blocks adding
// a new brand past the limit) and mirrored in the dashboard's "at limit" UI
// gate. Single source of truth so the two can't disagree on the number again.
export const BRAND_LIMITS: Record<string, number> = { starter: 1, growth: 2, enterprise: 3 };
export const FREE_BRAND_LIMIT = 1;

export function brandLimitForPlan(plan: string | null | undefined): number {
  return plan ? BRAND_LIMITS[plan] ?? FREE_BRAND_LIMIT : FREE_BRAND_LIMIT;
}

// Included monthly Web+LLM Analytics events per plan (web_visits + bot_visits
// combined). Usage past this is metered via Dodo credits — see
// lib/analytics-billing.ts and inngest/functions/analytics-billing.ts.
export const PLAN_ANALYTICS_EVENT_QUOTAS: Record<string, number> = { starter: 20000, growth: 100000, enterprise: 500000 };

export function analyticsEventQuotaForPlan(plan: string | null | undefined): number {
  return plan ? PLAN_ANALYTICS_EVENT_QUOTAS[plan] ?? 0 : 0;
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
