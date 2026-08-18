-- V1 account approval and owner-controlled registration.
-- Apply this migration before deploying the corresponding application code.

alter table public.profiles
  add column if not exists role text not null default 'user',
  add column if not exists account_status text not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now();

alter table public.profiles
  drop constraint if exists profiles_role_check,
  add constraint profiles_role_check
    check (role in ('owner', 'admin', 'user')),
  drop constraint if exists profiles_account_status_check,
  add constraint profiles_account_status_check
    check (account_status in ('pending', 'active', 'disabled', 'rejected'));

create table if not exists public.registration_settings (
  id boolean primary key default true check (id),
  registration_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

insert into public.registration_settings (id, registration_enabled)
values (true, false)
on conflict (id) do nothing;

alter table public.registration_settings enable row level security;

drop policy if exists "active users read own profile" on public.profiles;
create policy "active users read own profile"
on public.profiles for select
to authenticated
using (auth.uid() = id);

drop policy if exists "users update own profile fields" on public.profiles;
create policy "users update own profile fields"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.protect_profile_access_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
     and (
       new.role is distinct from old.role
       or new.account_status is distinct from old.account_status
       or new.approved_at is distinct from old.approved_at
       or new.approved_by is distinct from old.approved_by
     ) then
    raise exception 'Only the owner administration service can change account access.';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_access_fields on public.profiles;
create trigger protect_profile_access_fields
before update on public.profiles
for each row execute function public.protect_profile_access_fields();

-- The service-role client performs owner administration and bypasses RLS.
-- Public clients intentionally receive no policies for registration_settings.
