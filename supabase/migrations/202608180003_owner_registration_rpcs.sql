-- Owner-only registration controls compatible with Supabase sb_secret keys.

create or replace function public.owner_get_registration_enabled()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'owner'
      and p.account_status = 'active'
  ) then
    raise exception 'Owner access required';
  end if;

  return coalesce(
    (select rs.registration_enabled
     from public.registration_settings rs
     where rs.id = true),
    false
  );
end;
$$;

create or replace function public.owner_set_registration_enabled(
  new_registration_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  owner_id uuid := auth.uid();
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = owner_id
      and p.role = 'owner'
      and p.account_status = 'active'
  ) then
    raise exception 'Owner access required';
  end if;

  insert into public.registration_settings (
    id,
    registration_enabled,
    updated_at,
    updated_by
  )
  values (
    true,
    new_registration_enabled,
    now(),
    owner_id
  )
  on conflict (id) do update
  set registration_enabled = excluded.registration_enabled,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;
end;
$$;

revoke all on function public.owner_get_registration_enabled() from public;
revoke all on function public.owner_set_registration_enabled(boolean) from public;
grant execute on function public.owner_get_registration_enabled() to authenticated;
grant execute on function public.owner_set_registration_enabled(boolean) to authenticated;
