-- Soft email verification, decoupled from Supabase's own "Confirm email"
-- login gate (which, once disabled to remove signup friction, auto-confirms
-- everyone with no real verification email at all). This tracks a genuine
-- click-through verification without blocking any product access on it —
-- see app/api/verify-email/{send,confirm}/route.ts.
alter table public.user_plans add column if not exists email_verified_at timestamptz;
alter table public.user_plans add column if not exists email_verify_token text;
alter table public.user_plans add column if not exists email_verify_token_expires_at timestamptz;
create unique index if not exists user_plans_email_verify_token_idx
  on public.user_plans (email_verify_token) where email_verify_token is not null;

-- Anyone who already has a working account confirmed for real under the old
-- Supabase-gated flow — backfill so existing users don't suddenly see a
-- "pending verification" banner.
update public.user_plans up
set email_verified_at = u.email_confirmed_at
from auth.users u
where u.id = up.user_id and u.email_confirmed_at is not null and up.email_verified_at is null;
