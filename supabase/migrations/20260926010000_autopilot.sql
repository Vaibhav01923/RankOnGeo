-- Blog autopilot: per-brand settings, a keyword queue, and the extra article
-- columns needed to review and update a post in place after it went live.
-- Both new tables are service-role only (RLS on, no policies): they are read
-- and written through authorised API routes and the Inngest job.

alter table public.articles
  add column if not exists published_url text,
  add column if not exists remote_id text,
  add column if not exists source text not null default 'manual',
  add column if not exists last_reviewed_at timestamptz,
  add column if not exists rewrite_count integer not null default 0;

create table if not exists public.autopilot_settings (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  enabled boolean not null default false,
  channel_id uuid references public.publishing_channels(id) on delete set null,
  posts_per_week integer not null default 2 check (posts_per_week between 1 and 7),
  publish_mode text not null default 'publish' check (publish_mode in ('publish', 'draft')),
  auto_rewrite boolean not null default true,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.autopilot_topics (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  keyword text not null,
  source text not null check (source in ('gap', 'search', 'ai')),
  status text not null default 'queued' check (status in ('queued', 'used', 'skipped')),
  article_id uuid references public.articles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (brand_id, keyword)
);

create index if not exists autopilot_topics_brand_status_idx on public.autopilot_topics (brand_id, status, created_at);

alter table public.autopilot_settings enable row level security;
alter table public.autopilot_topics enable row level security;
