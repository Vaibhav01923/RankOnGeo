alter table public.web_visits
  add column if not exists geo_country text,
  add column if not exists user_agent text,
  add column if not exists device_type text,
  add column if not exists browser text,
  add column if not exists os text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text;

create index if not exists web_visits_brand_visitor_created_idx
  on public.web_visits (brand_id, visitor_id, created_at);
