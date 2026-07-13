-- Team mode: workspace owners invite members by email. Membership grants the
-- member full read/write access to all of the owner's brands (enforced in
-- app code via lib/team.ts — core tables have no RLS). team_members carries a
-- SELECT policy because requireBrandAccess() reads it through the anon-key
-- request client; removing that policy silently 404s every member.
-- team_invites is service-role only (tokens are secrets).

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member')),
  created_at timestamptz not null default now(),
  unique (owner_user_id, member_user_id),
  check (owner_user_id <> member_user_id)
);
create index if not exists team_members_member_idx
  on public.team_members (member_user_id);

alter table public.team_members enable row level security;
create policy "own memberships readable"
  on public.team_members for select
  using (auth.uid() = member_user_id or auth.uid() = owner_user_id);
-- no insert/update/delete policies: writes go through serverClient() only

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  token text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id) on delete set null
);
-- one live invite per (owner, email); re-inviting refreshes the row
create unique index if not exists team_invites_pending_unique
  on public.team_invites (owner_user_id, lower(email)) where status = 'pending';
create index if not exists team_invites_pending_email_idx
  on public.team_invites (lower(email)) where status = 'pending';

alter table public.team_invites enable row level security;
