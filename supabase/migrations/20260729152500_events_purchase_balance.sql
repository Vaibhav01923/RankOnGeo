alter table public.user_plans
  add column if not exists purchased_event_balance bigint not null default 0;

alter table public.analytics_usage_cycles
  add column if not exists events_covered_by_balance bigint not null default 0;

-- credits_charged is no longer written to (see lib/analytics-billing.ts) but
-- is left in place rather than dropped, to avoid destroying historical
-- billing data on a live production table.

-- Idempotency for the events-purchase webhook — a Dodo payment_id can only
-- ever credit the balance once, even if the webhook redelivers.
create table if not exists public.event_balance_credits (
  payment_id text primary key,
  user_id uuid not null,
  amount bigint not null,
  created_at timestamptz not null default now()
);
alter table public.event_balance_credits enable row level security;
