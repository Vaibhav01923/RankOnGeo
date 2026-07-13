-- Team mode, part 2: RLS policies for members.
--
-- Every product table already carries owner-only policies (auth.uid() =
-- user_id on brands, brand→owner subqueries on children), so without these
-- additions RLS silently hides the owner's rows from teammates and every
-- member request 404s. Policies are permissive (OR'd), so these grants sit
-- alongside the existing owner policies without touching them.
--
-- is_team_member_of() embeds the paid-owner gate: when the owner's
-- subscription lapses, members lose row visibility instantly — the same rule
-- lib/team.ts enforces in app code. SECURITY DEFINER is required: the caller
-- (a member) cannot read the owner's user_plans row directly, and it also
-- avoids policy recursion via brands.

create or replace function public.is_team_member_of(owner_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1
    from team_members tm
    join user_plans up on up.user_id = tm.owner_user_id
    where tm.owner_user_id = owner_id
      and tm.member_user_id = auth.uid()
      and up.dodo_subscription_id is not null
  );
$$;

create or replace function public.has_brand_access(b_id uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from brands b
    where b.id = b_id
      and (b.user_id = auth.uid() or public.is_team_member_of(b.user_id))
  );
$$;

-- Brands: members can read and edit, never delete (delete stays owner-only).
drop policy if exists "team members read brands" on public.brands;
create policy "team members read brands"
  on public.brands for select
  using (public.is_team_member_of(user_id));

drop policy if exists "team members update brands" on public.brands;
create policy "team members update brands"
  on public.brands for update
  using (public.is_team_member_of(user_id))
  with check (public.is_team_member_of(user_id));

-- Members can read their owner's plan row: /api/credits?brandId=, the
-- analytics isFree checks, and lib/team.ts all resolve the workspace plan
-- through the member's own request client.
drop policy if exists "team members read owner plan" on public.user_plans;
create policy "team members read owner plan"
  on public.user_plans for select
  using (public.is_team_member_of(user_id));

-- Brand-scoped tables the whole team works in. This single policy also lets
-- the OWNER see member-created rows on tables whose legacy policy was
-- user_id-scoped (engage_tasks, articles, alert_destinations,
-- publishing_channels, social_keywords).
drop policy if exists "workspace team access" on public.tracked_prompts;
create policy "workspace team access" on public.tracked_prompts
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.scan_runs;
create policy "workspace team access" on public.scan_runs
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.scan_results;
create policy "workspace team access" on public.scan_results
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.visibility_scores;
create policy "workspace team access" on public.visibility_scores
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.prompt_suggestions;
create policy "workspace team access" on public.prompt_suggestions
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.reddit_threads;
create policy "workspace team access" on public.reddit_threads
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.articles;
create policy "workspace team access" on public.articles
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.engage_tasks;
create policy "workspace team access" on public.engage_tasks
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.alert_destinations;
create policy "workspace team access" on public.alert_destinations
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.alert_deliveries;
create policy "workspace team access" on public.alert_deliveries
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.publishing_channels;
create policy "workspace team access" on public.publishing_channels
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.publishing_log;
create policy "workspace team access" on public.publishing_log
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

drop policy if exists "workspace team access" on public.social_keywords;
create policy "workspace team access" on public.social_keywords
  for all using (public.has_brand_access(brand_id)) with check (public.has_brand_access(brand_id));

-- Analytics tables: reads only — writes come from service-role ingestion.
drop policy if exists "workspace team read" on public.web_visits;
create policy "workspace team read" on public.web_visits
  for select using (public.has_brand_access(brand_id));

drop policy if exists "workspace team read" on public.bot_visits;
create policy "workspace team read" on public.bot_visits
  for select using (public.has_brand_access(brand_id));

drop policy if exists "workspace team read" on public.analytics_usage_cycles;
create policy "workspace team read" on public.analytics_usage_cycles
  for select using (public.has_brand_access(brand_id));

-- agent_chats stays personal (existing auth.uid() = user_id policy) — each
-- teammate keeps a private chat history per brand, matching the API design.
