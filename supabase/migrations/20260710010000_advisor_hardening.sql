alter function public.set_updated_at()
  set search_path = public, pg_temp;

create or replace view public.public_profiles
with (security_invoker = true) as
select
  p.id,
  p.preferred_name,
  p.full_name,
  p.avatar_url,
  p.city_region,
  p.country,
  p.languages,
  p.affiliation,
  p.bio,
  p.public_role,
  p.created_at,
  p.updated_at
from public.profiles p
join public.profile_preferences pref on pref.user_id = p.id
where coalesce(pref.data_consent -> 'directoryPublic', 'false'::jsonb) = 'true'::jsonb;

revoke all on public.public_profiles from anon, authenticated;
grant select on public.public_profiles to service_role;

drop policy if exists "stripe_events_deny_client" on public.stripe_events;
create policy "stripe_events_deny_client"
on public.stripe_events for all to anon, authenticated
using (false)
with check (false);
