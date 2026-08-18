-- Owner-only profile administration compatible with Supabase sb_secret keys.

create or replace function public.owner_list_profiles()
returns table (
  id uuid,
  full_name text,
  role text,
  account_status text,
  approved_at timestamptz,
  updated_at timestamptz
)
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

  return query
  select p.id, p.full_name, p.role, p.account_status,
         p.approved_at, p.updated_at
  from public.profiles p;
end;
$$;

create or replace function public.owner_update_user_access(
  target_user_id uuid,
  new_role text,
  new_account_status text
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

  if new_role not in ('owner', 'admin', 'user')
     or new_account_status not in ('pending', 'active', 'disabled', 'rejected') then
    raise exception 'Invalid account access values';
  end if;

  if target_user_id = owner_id
     and (new_role <> 'owner' or new_account_status <> 'active') then
    raise exception 'The active owner cannot demote or disable their own account';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);

  update public.profiles
  set role = new_role,
      account_status = new_account_status,
      approved_at = case when new_account_status = 'active' then now() else null end,
      approved_by = case when new_account_status = 'active' then owner_id else null end,
      updated_at = now()
  where id = target_user_id;
end;
$$;

revoke all on function public.owner_list_profiles() from public;
revoke all on function public.owner_update_user_access(uuid, text, text) from public;
grant execute on function public.owner_list_profiles() to authenticated;
grant execute on function public.owner_update_user_access(uuid, text, text) to authenticated;
