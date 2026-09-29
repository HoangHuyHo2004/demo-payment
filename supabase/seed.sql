-- Dev seed: 2 stations x 8 pumps. Idempotent.
-- Staff accounts are created by `npm run seed:users` (needs Supabase Auth admin API).
-- Bank accounts below are PLACEHOLDERS until the owner supplies real details (PLAN.md section 12).

insert into public.stations (id, name, code) values
  ('00000000-0000-0000-0000-00000000000a', 'Cửa hàng xăng dầu số 1', 'S1'),
  ('00000000-0000-0000-0000-00000000000b', 'Cửa hàng xăng dầu số 2', 'S2')
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

-- PLACEHOLDER bank accounts (Phase 4) until the owner supplies real details.
-- 970436 = Vietcombank BIN; account 0000000000 does not receive real money.
insert into public.bank_accounts (station_id, bank_bin, account_no, account_name)
select s.id, '970436', '0000000000', 'TAI KHOAN THU NGHIEM'
from public.stations s
where not exists (select 1 from public.bank_accounts b where b.station_id = s.id);
