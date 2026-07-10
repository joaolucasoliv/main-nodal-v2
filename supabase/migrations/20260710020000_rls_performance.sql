create index if not exists member_follows_target_user_id_idx
  on public.member_follows(target_user_id);

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

drop policy if exists "profile_preferences_select_own" on public.profile_preferences;
create policy "profile_preferences_select_own"
on public.profile_preferences for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "onboarding_responses_select_own" on public.onboarding_responses;
create policy "onboarding_responses_select_own"
on public.onboarding_responses for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "organization_memberships_select_own" on public.organization_memberships;
create policy "organization_memberships_select_own"
on public.organization_memberships for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
on public.organizations for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = organizations.id
      and m.user_id = (select auth.uid())
      and coalesce(m.status, 'active') = 'active'
  )
);

drop policy if exists "stripe_customers_select_own" on public.stripe_customers;
create policy "stripe_customers_select_own"
on public.stripe_customers for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "member_follows_select_participant" on public.member_follows;
create policy "member_follows_select_participant"
on public.member_follows for select to authenticated
using ((select auth.uid()) = user_id or (select auth.uid()) = target_user_id);

drop policy if exists "member_interactions_select_own" on public.member_interactions;
create policy "member_interactions_select_own"
on public.member_interactions for select to authenticated
using ((select auth.uid()) = from_user_id or (select auth.uid()) = to_user_id);
