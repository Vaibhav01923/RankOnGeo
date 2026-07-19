-- Customer articles never got the SEO description/tags treatment blog_posts
-- has, and had no image field at all — this is what made the auto-publish
-- webhook fall back to using the raw gap-query keyword as a "tag" (see
-- app/api/rankongeo-publish/route.ts).
alter table public.articles add column if not exists description text;
alter table public.articles add column if not exists tags text[] not null default '{}';
alter table public.articles add column if not exists image_url text;

-- Mirrors the existing public "blog-images" bucket, kept separate since this
-- one holds customer-uploaded/generated content rather than RankOnGeo's own
-- official blog assets.
insert into storage.buckets (id, name, public) values ('article-images', 'article-images', true)
on conflict (id) do nothing;
