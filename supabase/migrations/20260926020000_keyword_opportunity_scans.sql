-- Cached "high-intent keywords + search volume" result for the setup wizard, one
-- row per brand, so revisiting the step (or re-running setup) never pays for
-- another keyword-volume lookup. Service-role only: RLS on, no policies.
create table if not exists public.keyword_opportunity_scans (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  keywords jsonb not null default '[]'::jsonb,
  volume_available boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.keyword_opportunity_scans enable row level security;
