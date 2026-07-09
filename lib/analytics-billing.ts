// Overage pricing for Web/LLM Analytics: once a brand's monthly event count
// (web_visits + bot_visits combined) exceeds its plan's included quota
// (see PLAN_ANALYTICS_EVENT_QUOTAS in lib/plan-limits.ts), charge credits per
// block of events over. Metered by inngest/functions/analytics-billing.ts.
export const ANALYTICS_OVERAGE_BLOCK_SIZE = 10000;
export const ANALYTICS_OVERAGE_CREDITS_PER_BLOCK = 1;

export function currentBillingPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function billingPeriodStart(period: string): string {
  return new Date(`${period}-01T00:00:00.000Z`).toISOString();
}

export function owedOverageCredits(totalEvents: number, quota: number): number {
  const overageEvents = Math.max(0, totalEvents - quota);
  return Math.ceil(overageEvents / ANALYTICS_OVERAGE_BLOCK_SIZE) * ANALYTICS_OVERAGE_CREDITS_PER_BLOCK;
}
