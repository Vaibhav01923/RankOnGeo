-- One row per paid DataForSEO call, using the cost DataForSEO itself reports in
-- each response, so spend can be itemised by day and by source (AI-engine scans
-- vs keyword research). No FK on brand_id on purpose: deleting a brand must not
-- erase what it cost. Service-role only: RLS on, no policies.
create table if not exists public.dataforseo_spend (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  source text not null,
  cost numeric(10,6) not null,
  brand_id uuid
);

create index if not exists dataforseo_spend_created_at_idx on public.dataforseo_spend (created_at desc);

alter table public.dataforseo_spend enable row level security;
