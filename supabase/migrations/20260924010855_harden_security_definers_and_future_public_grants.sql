-- Harden SECURITY DEFINER trigger helpers and future public-schema grants.
-- Applied to Supabase project rgcedpnwxashnhrdhmlp on 2026-09-24.

revoke execute on function public.handle_new_user_profile() from public, anon, authenticated;
revoke execute on function public.protect_profile_access_fields() from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;
