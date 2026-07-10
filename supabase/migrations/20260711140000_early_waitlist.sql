-- Early-access waitlist: users who purchased a plan through /early at the
-- flat 50% discount. Written only by the Dodo webhook via the service role;
-- no client access, so RLS is enabled with no policies.

create table if not exists public.early_waitlist (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique,
  email text not null,
  plan text not null,
  dodo_subscription_id text,
  created_at timestamptz not null default now(),
  emailed_at timestamptz
);

alter table public.early_waitlist enable row level security;
