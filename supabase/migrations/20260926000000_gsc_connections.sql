-- Google Search Console connection per brand. Holds an OAuth refresh token
-- (encrypted at the application layer), so it is service-role only: RLS is
-- enabled with no policies, same pattern as reddit_opportunity_scans/admins.
create table if not exists public.gsc_connections (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  connected_by uuid not null,
  google_email text,
  refresh_token_enc text not null,
  site_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.gsc_connections enable row level security;
