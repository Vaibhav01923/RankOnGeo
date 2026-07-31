alter table public.engage_tasks
  add column if not exists mark_done_token text;
