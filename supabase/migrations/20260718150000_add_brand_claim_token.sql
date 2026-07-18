-- Lets an anonymously-created brand (from /api/setup, before signup) be
-- claimed by whichever account confirms email next — the token is the sole
-- trust boundary (same shape as team_invites.token), resolved only via the
-- service-role client since there's no RLS policy granting anon access here.
alter table public.brands add column if not exists claim_token text unique;
