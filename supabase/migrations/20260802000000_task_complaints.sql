-- Lets a user flag a problem with a past engage_task (Reddit order, create-post
-- task, etc.) — the complaint text gets posted to the team's Discord channel
-- (see lib/task-complaint-discord.ts) so it's actioned like any other support
-- report, without building a whole ticketing system for it.
create table public.task_complaints (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.engage_tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  message text not null check (char_length(message) >= 1 and char_length(message) <= 2000),
  created_at timestamptz not null default now()
);

create index task_complaints_task_id_idx on public.task_complaints (task_id);

alter table public.task_complaints enable row level security;

create policy "Users can insert their own task complaints"
  on public.task_complaints for insert
  with check (auth.uid() = user_id);

create policy "Users can view their own task complaints"
  on public.task_complaints for select
  using (auth.uid() = user_id);
