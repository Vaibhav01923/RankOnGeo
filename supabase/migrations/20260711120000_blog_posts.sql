-- Blog posts for the public /blog section (separate from customer "articles").
-- Writes happen only through admin API routes using the service role key,
-- so RLS exposes published posts read-only and nothing else.

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  description text not null default '',
  content text not null default '',
  tags text[] not null default '{}',
  cover_image_url text,
  author_name text not null default 'RankOnGeo Team',
  status text not null default 'draft' check (status in ('draft', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

alter table public.blog_posts enable row level security;

create policy "Public can read published posts"
  on public.blog_posts for select
  using (status = 'published');

create index if not exists blog_posts_status_published_at_idx
  on public.blog_posts (status, published_at desc);
