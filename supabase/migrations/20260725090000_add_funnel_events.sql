-- Internal funnel analytics: domain submissions through the landing page /
-- setup wizard, trial checkout attempts, confirmed trial activations, and
-- trial-to-paid conversions. Written only by server routes via the service
-- role (app/api/setup, app/api/dodo/checkout, app/api/dodo/webhook); no
-- client access, so RLS is enabled with no policies — same pattern as
-- early_waitlist.

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'domain_submitted', 'trial_checkout_started', 'trial_started', 'trial_converted'
  )),
  domain text,
  email text,
  user_id uuid,
  brand_id uuid references public.brands(id) on delete set null,
  plan text,
  is_anonymous boolean,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.funnel_events enable row level security;

create index if not exists funnel_events_type_created_idx
  on public.funnel_events (event_type, created_at desc);

create index if not exists funnel_events_subscription_idx
  on public.funnel_events ((metadata->>'subscriptionId'));
