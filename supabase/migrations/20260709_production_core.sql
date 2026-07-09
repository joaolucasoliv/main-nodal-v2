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
  updated_at timestamptz default now()
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
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "profile_preferences_select_own" on public.profile_preferences;
create policy "profile_preferences_select_own"
on public.profile_preferences for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "profile_preferences_insert_own" on public.profile_preferences;
create policy "profile_preferences_insert_own"
on public.profile_preferences for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "profile_preferences_update_own" on public.profile_preferences;
create policy "profile_preferences_update_own"
on public.profile_preferences for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "onboarding_responses_select_own" on public.onboarding_responses;
create policy "onboarding_responses_select_own"
on public.onboarding_responses for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "onboarding_responses_insert_own" on public.onboarding_responses;
create policy "onboarding_responses_insert_own"
on public.onboarding_responses for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "onboarding_responses_update_own" on public.onboarding_responses;
create policy "onboarding_responses_update_own"
on public.onboarding_responses for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

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
create policy "member_follows_insert_own"
on public.member_follows for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "member_follows_delete_own" on public.member_follows;
create policy "member_follows_delete_own"
on public.member_follows for delete to authenticated
using (auth.uid() = user_id);

drop policy if exists "member_interactions_select_own" on public.member_interactions;
create policy "member_interactions_select_own"
on public.member_interactions for select to authenticated
using (auth.uid() = from_user_id or auth.uid() = to_user_id);

drop policy if exists "member_interactions_insert_own" on public.member_interactions;
create policy "member_interactions_insert_own"
on public.member_interactions for insert to authenticated
with check (auth.uid() = from_user_id);

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
where coalesce((pref.data_consent ->> 'directoryPublic')::boolean, false) = true;

grant select on public.public_profiles to anon, authenticated;
