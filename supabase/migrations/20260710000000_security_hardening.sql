alter table public.stripe_customers
  add column if not exists stripe_latest_event_rank integer not null default 0;
alter table public.stripe_customers
  add column if not exists stripe_latest_event_id text not null default '';

update public.stripe_customers
set stripe_customer_id = null
where btrim(coalesce(stripe_customer_id, '')) = '';

update public.stripe_customers
set stripe_subscription_id = null
where btrim(coalesce(stripe_subscription_id, '')) = '';

update public.stripe_customers
set stripe_checkout_session_id = null
where btrim(coalesce(stripe_checkout_session_id, '')) = '';

update public.profile_preferences
set data_consent = coalesce(data_consent, '{}'::jsonb) - 'directoryPublic'
where data_consent ? 'directoryPublic'
  and jsonb_typeof(data_consent -> 'directoryPublic') <> 'boolean';

alter table public.profile_preferences
  drop constraint if exists profile_preferences_directory_public_boolean;
alter table public.profile_preferences
  add constraint profile_preferences_directory_public_boolean check (
    data_consent is null
    or not (data_consent ? 'directoryPublic')
    or jsonb_typeof(data_consent -> 'directoryPublic') = 'boolean'
  );

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profile_preferences_insert_own" on public.profile_preferences;
drop policy if exists "profile_preferences_update_own" on public.profile_preferences;
drop policy if exists "onboarding_responses_insert_own" on public.onboarding_responses;
drop policy if exists "onboarding_responses_update_own" on public.onboarding_responses;
drop policy if exists "member_follows_insert_own" on public.member_follows;
drop policy if exists "member_follows_delete_own" on public.member_follows;
drop policy if exists "member_interactions_insert_own" on public.member_interactions;

create or replace view public.public_profiles as
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

create or replace function public.apply_stripe_event(
  p_event_id text,
  p_event_type text,
  p_event_created integer,
  p_event_rank integer,
  p_user_id uuid default null,
  p_stripe_customer_id text default null,
  p_stripe_subscription_id text default null,
  p_stripe_checkout_session_id text default null,
  p_status text default 'pending',
  p_current_period_end text default null
)
returns setof public.stripe_customers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.stripe_customers%rowtype;
  v_user_id uuid;
begin
  if nullif(btrim(p_event_id), '') is null then
    raise exception 'Stripe event id is required';
  end if;

  insert into public.stripe_events (id, type, event_created)
  values (left(p_event_id, 120), left(coalesce(p_event_type, 'unknown'), 120), greatest(coalesce(p_event_created, 0), 0))
  on conflict (id) do nothing;

  if not found then
    return query
      select sc.*
      from public.stripe_customers sc
      where (nullif(btrim(p_stripe_subscription_id), '') is not null
          and sc.stripe_subscription_id = nullif(btrim(p_stripe_subscription_id), ''))
         or (nullif(btrim(p_stripe_checkout_session_id), '') is not null
          and sc.stripe_checkout_session_id = nullif(btrim(p_stripe_checkout_session_id), ''))
         or (p_user_id is not null and sc.user_id = p_user_id)
      order by sc.updated_at desc
      limit 1;
    return;
  end if;

  select sc.*
  into v_existing
  from public.stripe_customers sc
  where (nullif(btrim(p_stripe_subscription_id), '') is not null
      and sc.stripe_subscription_id = nullif(btrim(p_stripe_subscription_id), ''))
     or (nullif(btrim(p_stripe_checkout_session_id), '') is not null
      and sc.stripe_checkout_session_id = nullif(btrim(p_stripe_checkout_session_id), ''))
     or (p_user_id is not null and sc.user_id = p_user_id)
  order by sc.updated_at desc
  limit 1
  for update;

  v_user_id := coalesce(v_existing.user_id, p_user_id);
  if v_user_id is null then
    return;
  end if;

  insert into public.stripe_customers (
    user_id,
    stripe_customer_id,
    stripe_subscription_id,
    stripe_checkout_session_id,
    subscription_status,
    current_period_end,
    stripe_latest_event_created,
    stripe_latest_event_rank,
    stripe_latest_event_id
  ) values (
    v_user_id,
    nullif(btrim(p_stripe_customer_id), ''),
    nullif(btrim(p_stripe_subscription_id), ''),
    nullif(btrim(p_stripe_checkout_session_id), ''),
    coalesce(nullif(btrim(p_status), ''), 'pending'),
    nullif(btrim(p_current_period_end), ''),
    greatest(coalesce(p_event_created, 0), 0),
    greatest(coalesce(p_event_rank, 0), 0),
    left(p_event_id, 120)
  )
  on conflict (user_id) do update
  set stripe_customer_id = coalesce(excluded.stripe_customer_id, stripe_customers.stripe_customer_id),
      stripe_subscription_id = coalesce(excluded.stripe_subscription_id, stripe_customers.stripe_subscription_id),
      stripe_checkout_session_id = coalesce(excluded.stripe_checkout_session_id, stripe_customers.stripe_checkout_session_id),
      subscription_status = excluded.subscription_status,
      current_period_end = coalesce(excluded.current_period_end, stripe_customers.current_period_end),
      stripe_latest_event_created = excluded.stripe_latest_event_created,
      stripe_latest_event_rank = excluded.stripe_latest_event_rank,
      stripe_latest_event_id = excluded.stripe_latest_event_id,
      updated_at = now()
  where (
    stripe_customers.stripe_latest_event_created,
    stripe_customers.stripe_latest_event_rank,
    stripe_customers.stripe_latest_event_id
  ) < (
    excluded.stripe_latest_event_created,
    excluded.stripe_latest_event_rank,
    excluded.stripe_latest_event_id
  )
  returning * into v_existing;

  if not found then
    select sc.* into v_existing
    from public.stripe_customers sc
    where sc.user_id = v_user_id;
  end if;

  return next v_existing;
end;
$$;

revoke all on function public.apply_stripe_event(text, text, integer, integer, uuid, text, text, text, text, text)
from public, anon, authenticated;
grant execute on function public.apply_stripe_event(text, text, integer, integer, uuid, text, text, text, text, text)
to service_role;
