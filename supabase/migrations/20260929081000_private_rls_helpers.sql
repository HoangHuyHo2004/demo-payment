-- Move RLS helper functions out of the API-exposed `public` schema so they
-- are not callable via /rest/v1/rpc (Supabase advisor 0029). Policies keep
-- working because they reference the functions by OID.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

alter function public.is_admin() set schema private;
alter function public.my_station_id() set schema private;
alter function public.can_access_station(uuid) set schema private;

create or replace function private.can_access_station(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_admin() or target = private.my_station_id();
$$;
