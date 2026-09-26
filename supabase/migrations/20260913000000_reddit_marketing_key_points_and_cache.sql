-- Reddit Marketing tab: per-brand custom "key points" (concrete value props
-- the user wants woven into AI-drafted comments and used to bias thread
-- discovery toward people facing the exact problems these solve), plus a
-- cache of the last scan's results so reloading the tab (or a page refresh)
-- shows something instantly instead of forcing a fresh expensive scan.
alter table brands add column if not exists reddit_key_points text[] not null default '{}'::text[];

create table if not exists reddit_opportunity_scans (
  brand_id uuid primary key references brands(id) on delete cascade,
  threads jsonb not null default '[]'::jsonb,
  suggested_posts jsonb not null default '[]'::jsonb,
  total_found integer not null default 0,
  scanned_at timestamptz not null default now()
);

-- Locked down like `admins` — no RLS policies means only the service-role
-- client can read/write it. Every route touching this table already gates
-- access via requireBrandAccess at the application layer first, so there's
-- no need for row-level policies here too.
alter table reddit_opportunity_scans enable row level security;
