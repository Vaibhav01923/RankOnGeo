-- Autopilot now works through the brand's keyword-research list (highest search
-- volume first), so topics can carry a volume and come from a "research" source.
alter table public.autopilot_topics add column if not exists volume integer;

alter table public.autopilot_topics drop constraint if exists autopilot_topics_source_check;
alter table public.autopilot_topics add constraint autopilot_topics_source_check check (source in ('research', 'gap', 'search', 'ai'));
