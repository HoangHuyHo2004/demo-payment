-- Phase 1 RLS verification. Self-contained: creates throwaway auth users and
-- rows inside a transaction and rolls everything back. Any failed check
-- raises an exception; success returns one row "RLS OK". Run it in the
-- Supabase SQL editor (or via the Supabase MCP execute_sql tool).
begin;

-- Fixture ------------------------------------------------------------------
insert into auth.users (id, email) values
  ('10000000-0000-0000-0000-00000000000a', 'rls-staff-a@test.local'),
  ('10000000-0000-0000-0000-00000000000b', 'rls-staff-b@test.local'),
  ('10000000-0000-0000-0000-0000000000ad', 'rls-admin@test.local'),
  ('10000000-0000-0000-0000-0000000000ff', 'rls-inactive-a@test.local');

insert into public.staff (id, station_id, full_name, role, active) values
  ('10000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'Test A', 'staff', true),
  ('10000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'Test B', 'staff', true),
  ('10000000-0000-0000-0000-0000000000ad', null, 'Test Admin', 'admin', true),
  ('10000000-0000-0000-0000-0000000000ff', '00000000-0000-0000-0000-00000000000a', 'Test Inactive', 'staff', false);

insert into public.transactions (id, station_id, pump_id, invoice_no, fuel_type, volume, unit_price, amount, fueled_at, source)
select v.id::uuid, v.station::uuid,
       (select id from public.pumps where station_id = v.station::uuid and vendor_pump_id = 'P1'),
       v.inv, 'A95', 10.000, 20000, 200000, now(), 'vendor'
from (values
  ('20000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000a', 'RLS-A-1'),
  ('20000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000b', 'RLS-B-1')
) as v(id, station, inv);

insert into public.payments (transaction_id, method, status, cash_amount, confirmed_by, confirmed_at, created_by) values
  ('20000000-0000-0000-0000-00000000000b', 'cash', 'confirmed', 200000,
   '10000000-0000-0000-0000-00000000000b', now(), '10000000-0000-0000-0000-00000000000b');

insert into public.bank_accounts (station_id, bank_bin, account_no, account_name) values
  ('00000000-0000-0000-0000-00000000000b', '970436', '0000000000', 'TEST B');

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'RLS FAIL: %', label; end if;
end $$;

-- Staff A: sees only station A ---------------------------------------------
select pg_temp.act_as('10000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.stations) = 1, 'A sees 1 station');
select pg_temp.check((select count(*) from public.pumps) = 8, 'A sees 8 pumps');
select pg_temp.check(not exists (select 1 from public.pumps where station_id = '00000000-0000-0000-0000-00000000000b'), 'A sees no B pumps');
select pg_temp.check((select count(*) from public.transactions where invoice_no like 'RLS-%') = 1, 'A sees only its transaction');
select pg_temp.check(not exists (select 1 from public.transactions where station_id = '00000000-0000-0000-0000-00000000000b'), 'A sees no B transactions');
select pg_temp.check((select count(*) from public.payments) = 0, 'A sees no B payments');
select pg_temp.check((select count(*) from public.bank_accounts) = 0, 'A sees no B bank accounts');
select pg_temp.check(not exists (select 1 from public.staff where station_id = '00000000-0000-0000-0000-00000000000b'), 'A sees no B staff');
select pg_temp.check(not exists (select 1 from public.sync_state where station_id = '00000000-0000-0000-0000-00000000000b'), 'A sees no B sync_state');

-- Staff A: cannot write station B ------------------------------------------
with u as (update public.transactions set amount = 1
           where id = '20000000-0000-0000-0000-00000000000b' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'A cannot update B transaction');

do $$ begin
  insert into public.transactions (station_id, pump_id, fuel_type, volume, unit_price, amount, fueled_at, source)
  values ('00000000-0000-0000-0000-00000000000b',
          (select id from public.pumps where vendor_pump_id = 'P1' limit 1),
          'DO', 1, 1, 1, now(), 'manual');
  raise exception 'RLS FAIL: A inserted into station B';
exception when insufficient_privilege or foreign_key_violation then null;
end $$;

do $$ begin
  insert into public.payments (transaction_id, method, status, cash_amount, confirmed_by, confirmed_at, created_by)
  values ('20000000-0000-0000-0000-00000000000b', 'cash', 'confirmed', 1,
          '10000000-0000-0000-0000-00000000000a', now(), '10000000-0000-0000-0000-00000000000a');
  raise exception 'RLS FAIL: A paid a station B transaction';
exception when insufficient_privilege then null;
end $$;

-- Staff A: cannot escalate or touch config ---------------------------------
with u as (update public.staff set role = 'admin'
           where id = '10000000-0000-0000-0000-00000000000a' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'A cannot promote self');

with u as (update public.pumps set label = 'x' returning 1)
select pg_temp.check((select count(*) from u) = 0, 'A cannot edit pumps');

-- Staff A: can work its own station ----------------------------------------
insert into public.payments (transaction_id, method, status, cash_amount, confirmed_by, confirmed_at, created_by)
values ('20000000-0000-0000-0000-00000000000a', 'cash', 'confirmed', 200000,
        '10000000-0000-0000-0000-00000000000a', now(), '10000000-0000-0000-0000-00000000000a');
select pg_temp.check((select count(*) from public.payments) = 1, 'A can pay own transaction');

-- Staff B mirror -----------------------------------------------------------
select pg_temp.act_as('10000000-0000-0000-0000-00000000000b');
select pg_temp.check(not exists (select 1 from public.transactions where station_id = '00000000-0000-0000-0000-00000000000a'), 'B sees no A transactions');
select pg_temp.check((select count(*) from public.payments) = 1, 'B sees only its own payment');

-- Inactive staff sees nothing ----------------------------------------------
select pg_temp.act_as('10000000-0000-0000-0000-0000000000ff');
select pg_temp.check((select count(*) from public.pumps) = 0, 'inactive staff sees no pumps');
select pg_temp.check((select count(*) from public.transactions) = 0, 'inactive staff sees no transactions');

-- Admin sees everything ----------------------------------------------------
select pg_temp.act_as('10000000-0000-0000-0000-0000000000ad');
select pg_temp.check((select count(*) from public.stations) = 2, 'admin sees 2 stations');
select pg_temp.check((select count(*) from public.pumps) = 16, 'admin sees 16 pumps');
select pg_temp.check((select count(*) from public.transactions where invoice_no like 'RLS-%') = 2, 'admin sees both transactions');
select pg_temp.check((select count(*) from public.payments) = 2, 'admin sees both payments');

-- Anonymous has no access ---------------------------------------------------
select set_config('role', 'anon', true), set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  perform 1 from public.pumps;
  raise exception 'RLS FAIL: anon read pumps';
exception when insufficient_privilege then null;
end $$;

select 'RLS OK' as result;
rollback;
