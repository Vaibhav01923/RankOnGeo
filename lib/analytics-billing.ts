// Overage handling for Web/LLM Analytics: once a brand's monthly event count
// (web_visits + bot_visits combined) exceeds its plan's included quota (see
// PLAN_ANALYTICS_EVENT_QUOTAS in lib/plan-limits.ts), the overage is drawn
// down from the account's purchased event balance (see
// user_plans.purchased_event_balance, topped up via /api/dodo/events-checkout,
// never expires, rolls over across billing periods). Metered by
// inngest/functions/analytics-billing.ts.
export const EVENTS_PRICE_PER_UNIT_CENTS = 75; // 1 unit = 1000 events
export const EVENTS_PER_UNIT = 1000;
export const MIN_EVENT_UNITS = 10; // 10,000 events
export const MAX_EVENT_UNITS = 500; // 500,000 events

export function currentBillingPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function billingPeriodStart(period: string): string {
  return new Date(`${period}-01T00:00:00.000Z`).toISOString();
}
