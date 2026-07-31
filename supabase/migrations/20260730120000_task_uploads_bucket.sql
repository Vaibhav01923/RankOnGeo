-- Separate public bucket for media attached to Reddit "create a new post"
-- tasks — served from Supabase's own storage domain, not rankongeo.com, so
-- user-uploaded content never lives on a path under our own SEO-relevant
-- domain (see app/api/tasks/upload-media/route.ts).
insert into storage.buckets (id, name, public) values ('task-uploads', 'task-uploads', true)
on conflict (id) do nothing;
