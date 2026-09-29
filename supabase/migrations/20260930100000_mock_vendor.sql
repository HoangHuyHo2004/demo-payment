-- Phase 3: backing store for the mock vendor API (VENDOR_MODE=mock only).
-- RLS on with no policies: only the server's service role can read/write it.
create table public.mock_vendor_transactions (
  id             bigint generated always as identity primary key,
  station_id     uuid not null references public.stations (id) on delete cascade,
  vendor_pump_id text not null,
  fuel_type      public.fuel_type not null,
  volume         numeric(10, 3) not null check (volume > 0),
  unit_price     bigint not null check (unit_price >= 0),
  amount         bigint not null check (amount >= 0),
  fueled_at      timestamptz not null,
  invoice_no     text not null,
  unique (station_id, invoice_no)
);
create index mock_vendor_transactions_station_fueled_idx
  on public.mock_vendor_transactions (station_id, fueled_at);

alter table public.mock_vendor_transactions enable row level security;
revoke all on public.mock_vendor_transactions from anon, authenticated;
