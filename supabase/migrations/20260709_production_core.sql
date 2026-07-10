create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  preferred_name text,
  full_name text,
  email text,
  avatar_url text,
  city_region text,
  country text,
  languages text[],
  affiliation text,
  bio text,
  public_role text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.profile_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  visibility jsonb,
  notification_preferences jsonb,
  data_consent jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint profile_preferences_directory_public_boolean check (
    data_consent is null
    or not (data_consent ? 'directoryPublic')
    or jsonb_typeof(data_consent -> 'directoryPublic') = 'boolean'
  )
);

create table if not exists public.onboarding_responses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  interests text[],
  skills text[],
  goals text[],
  contribution_preferences text[],
  availability text,
  mentoring_interest text,
  raw_answers jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text,
  website text,
  city_region text,
  country text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  subscription_status text,
  stripe_subscription_id text,
  stripe_checkout_session_id text,
  current_period_end text,
  stripe_latest_event_created integer not null default 0,
  stripe_latest_event_rank integer not null default 0,
  stripe_latest_event_id text not null default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.member_follows (
  user_id uuid references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, target_user_id),
  constraint member_follows_no_self check (user_id <> target_user_id)
);

create table if not exists public.member_interactions (
  id bigint generated always as identity primary key,
  from_user_id uuid references auth.users(id) on delete cascade,
  to_user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  created_at timestamptz default now(),
  constraint member_interactions_type check (type in ('view', 'like', 'skip', 'message', 'follow')),
  constraint member_interactions_no_self check (from_user_id <> to_user_id)
);

create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  event_created integer not null default 0,
  processed_at timestamptz default now()
);

create unique index if not exists profile_preferences_user_id_unique on public.profile_preferences(user_id);
create unique index if not exists onboarding_responses_user_id_unique on public.onboarding_responses(user_id);
create unique index if not exists stripe_customers_user_id_unique on public.stripe_customers(user_id);
create unique index if not exists stripe_customers_subscription_unique
  on public.stripe_customers(stripe_subscription_id)
  where stripe_subscription_id is not null and stripe_subscription_id <> '';

create index if not exists profile_preferences_user_id_idx on public.profile_preferences(user_id);
create index if not exists onboarding_responses_user_id_idx on public.onboarding_responses(user_id);
create index if not exists organization_memberships_organization_id_idx on public.organization_memberships(organization_id);
create index if not exists organization_memberships_user_id_idx on public.organization_memberships(user_id);
create index if not exists stripe_customers_user_id_idx on public.stripe_customers(user_id);
create index if not exists stripe_customers_stripe_customer_id_idx on public.stripe_customers(stripe_customer_id);
create index if not exists member_interactions_from_to_idx on public.member_interactions(from_user_id, to_user_id, created_at);
create index if not exists member_interactions_to_idx on public.member_interactions(to_user_id);
create index if not exists stripe_events_type_idx on public.stripe_events(type, event_created);

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists profile_preferences_updated_at on public.profile_preferences;
create trigger profile_preferences_updated_at
before update on public.profile_preferences
for each row execute function public.set_updated_at();

drop trigger if exists onboarding_responses_updated_at on public.onboarding_responses;
create trigger onboarding_responses_updated_at
before update on public.onboarding_responses
for each row execute function public.set_updated_at();

drop trigger if exists organizations_updated_at on public.organizations;
create trigger organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists stripe_customers_updated_at on public.stripe_customers;
create trigger stripe_customers_updated_at
before update on public.stripe_customers
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profile_preferences enable row level security;
alter table public.onboarding_responses enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.stripe_customers enable row level security;
alter table public.member_follows enable row level security;
alter table public.member_interactions enable row level security;
alter table public.stripe_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

drop policy if exists "profile_preferences_select_own" on public.profile_preferences;
create policy "profile_preferences_select_own"
on public.profile_preferences for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "profile_preferences_insert_own" on public.profile_preferences;
drop policy if exists "profile_preferences_update_own" on public.profile_preferences;

drop policy if exists "onboarding_responses_select_own" on public.onboarding_responses;
create policy "onboarding_responses_select_own"
on public.onboarding_responses for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "onboarding_responses_insert_own" on public.onboarding_responses;
drop policy if exists "onboarding_responses_update_own" on public.onboarding_responses;

drop policy if exists "organization_memberships_select_own" on public.organization_memberships;
create policy "organization_memberships_select_own"
on public.organization_memberships for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
on public.organizations for select to authenticated
using (
  exists (
    select 1
    from public.organization_memberships m
    where m.organization_id = organizations.id
      and m.user_id = auth.uid()
      and coalesce(m.status, 'active') = 'active'
  )
);

drop policy if exists "stripe_customers_select_own" on public.stripe_customers;
create policy "stripe_customers_select_own"
on public.stripe_customers for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "member_follows_select_participant" on public.member_follows;
create policy "member_follows_select_participant"
on public.member_follows for select to authenticated
using (auth.uid() = user_id or auth.uid() = target_user_id);

drop policy if exists "member_follows_insert_own" on public.member_follows;
drop policy if exists "member_follows_delete_own" on public.member_follows;

drop policy if exists "member_interactions_select_own" on public.member_interactions;
create policy "member_interactions_select_own"
on public.member_interactions for select to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

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

grant select on public.public_profiles to anon, authenticated;

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
