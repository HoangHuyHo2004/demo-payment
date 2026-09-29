-- Dev seed: 2 stations x 8 pumps. Idempotent.
-- Staff accounts are created by `npm run seed:users` (needs Supabase Auth admin API).
-- Bank accounts are not seeded until the owner supplies real details (PLAN.md section 12).

insert into public.stations (id, name) values
  ('00000000-0000-0000-0000-00000000000a', 'Cửa hàng xăng dầu số 1'),
  ('00000000-0000-0000-0000-00000000000b', 'Cửa hàng xăng dầu số 2')
on conflict (id) do nothing;

insert into public.pumps (station_id, vendor_pump_id, label)
select s.id, 'P' || n, 'Trụ ' || n
from public.stations s
cross join generate_series(1, 8) as n
where s.id in ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b')
on conflict (station_id, vendor_pump_id) do nothing;

insert into public.sync_state (station_id)
select id from public.stations
on conflict (station_id) do nothing;
