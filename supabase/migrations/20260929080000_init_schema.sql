-- Phase 1: core schema (PLAN.md section 4) + Row Level Security.
-- Amounts are VND integers (bigint); volume is liters numeric(10,3).

create type public.staff_role as enum ('staff', 'admin');
create type public.fuel_type as enum ('A95', 'E5', 'DO');
create type public.tx_source as enum ('vendor', 'manual');
create type public.payment_method as enum ('cash', 'qr');
create type public.payment_status as enum ('pending', 'confirmed');

create table public.stations (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table public.pumps (
  id             uuid primary key default gen_random_uuid(),
  station_id     uuid not null references public.stations (id) on delete restrict,
  vendor_pump_id text not null,
  label          text not null,
  unique (station_id, vendor_pump_id),
  -- lets transactions reference (pump_id, station_id) so a pump can't belong to another station
  unique (id, station_id)
);

create table public.staff (
  id         uuid primary key references auth.users (id) on delete cascade,
  station_id uuid references public.stations (id) on delete restrict,
  full_name  text not null,
  role       public.staff_role not null default 'staff',
  active     boolean not null default true,
  -- regular staff must belong to a station; admins may be unassigned
  check (role = 'admin' or station_id is not null)
);

create table public.transactions (
  id         uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations (id) on delete restrict,
  pump_id    uuid not null,
  invoice_no text,
  fuel_type  public.fuel_type not null,
  volume     numeric(10, 3) not null check (volume > 0),
  unit_price bigint not null check (unit_price >= 0),
  amount     bigint not null check (amount >= 0),
  fueled_at  timestamptz not null,
  source     public.tx_source not null,
  synced_at  timestamptz,
  foreign key (pump_id, station_id) references public.pumps (id, station_id) on delete restrict,
  -- invoice_no is optional only for manual rows (section 7)
  check (source = 'manual' or invoice_no is not null),
  unique (station_id, invoice_no)
);
create index transactions_pump_fueled_idx on public.transactions (pump_id, fueled_at desc);
create index transactions_station_fueled_idx on public.transactions (station_id, fueled_at);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null unique references public.transactions (id) on delete restrict,
  method         public.payment_method not null,
  status         public.payment_status not null,
  cash_amount    bigint check (cash_amount >= 0),
  qr_ref         text unique check (qr_ref ~ '^[A-Z0-9]{1,25}$'),
  confirmed_by   uuid references public.staff (id),
  confirmed_at   timestamptz,
  created_by     uuid not null references public.staff (id),
  created_at     timestamptz not null default now(),
  check (method <> 'cash' or (cash_amount is not null and status = 'confirmed')),
  check (method <> 'qr' or qr_ref is not null),
  check ((status = 'confirmed') = (confirmed_by is not null and confirmed_at is not null))
);

create table public.bank_accounts (
  id           uuid primary key default gen_random_uuid(),
  station_id   uuid not null references public.stations (id) on delete restrict,
  bank_bin     text not null check (bank_bin ~ '^[0-9]{6}$'),
  account_no   text not null check (account_no ~ '^[0-9A-Za-z]{1,19}$'),
  account_name text not null
);

create table public.sync_state (
  station_id     uuid primary key references public.stations (id) on delete cascade,
  last_fueled_at timestamptz,
  last_run_at    timestamptz,
  last_error     text
);

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER so policies can read staff without
-- recursing into staff's own RLS. Inactive staff get no access at all.
-- ---------------------------------------------------------------------------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.staff
    where id = (select auth.uid()) and role = 'admin' and active
  );
$$;

create function public.my_station_id() returns uuid
language sql stable security definer set search_path = ''
as $$
  select station_id from public.staff
  where id = (select auth.uid()) and active;
$$;

create function public.can_access_station(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_admin() or target = public.my_station_id();
$$;

revoke all on function public.is_admin(), public.my_station_id(), public.can_access_station(uuid) from public, anon;
grant execute on function public.is_admin(), public.my_station_id(), public.can_access_station(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS. No anon access anywhere. The server-side service role bypasses RLS
-- (used by vendor sync and seeding).
-- ---------------------------------------------------------------------------
alter table public.stations      enable row level security;
alter table public.pumps         enable row level security;
alter table public.staff         enable row level security;
alter table public.transactions  enable row level security;
alter table public.payments      enable row level security;
alter table public.bank_accounts enable row level security;
alter table public.sync_state    enable row level security;

revoke all on all tables in schema public from anon;

-- Read: own station, or everything for admins.
create policy stations_read on public.stations for select to authenticated
  using (public.can_access_station(id));
create policy pumps_read on public.pumps for select to authenticated
  using (public.can_access_station(station_id));
create policy staff_read on public.staff for select to authenticated
  using (id = (select auth.uid()) or public.can_access_station(station_id));
create policy transactions_read on public.transactions for select to authenticated
  using (public.can_access_station(station_id));
create policy payments_read on public.payments for select to authenticated
  using (exists (select 1 from public.transactions t
                 where t.id = transaction_id and public.can_access_station(t.station_id)));
create policy bank_accounts_read on public.bank_accounts for select to authenticated
  using (public.can_access_station(station_id));
create policy sync_state_read on public.sync_state for select to authenticated
  using (public.can_access_station(station_id));

-- Staff write their own station's operational rows (manual transactions, payments).
create policy transactions_write on public.transactions for insert to authenticated
  with check (public.can_access_station(station_id));
create policy transactions_update on public.transactions for update to authenticated
  using (public.can_access_station(station_id))
  with check (public.can_access_station(station_id));

create policy payments_insert on public.payments for insert to authenticated
  with check (created_by = (select auth.uid()) and exists (
    select 1 from public.transactions t
    where t.id = transaction_id and public.can_access_station(t.station_id)));
create policy payments_update on public.payments for update to authenticated
  using (exists (select 1 from public.transactions t
                 where t.id = transaction_id and public.can_access_station(t.station_id)))
  with check (exists (select 1 from public.transactions t
                      where t.id = transaction_id and public.can_access_station(t.station_id)));

-- Configuration tables are admin-only for writes (otherwise staff could
-- promote themselves or redirect QR money to another bank account).
create policy stations_admin on public.stations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy pumps_admin on public.pumps for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy staff_admin on public.staff for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy bank_accounts_admin on public.bank_accounts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy transactions_admin_delete on public.transactions for delete to authenticated
  using (public.is_admin());
create policy payments_admin_delete on public.payments for delete to authenticated
  using (public.is_admin());
-- sync_state is written only by the server (service role).
