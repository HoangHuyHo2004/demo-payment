-- Phase 4: payments. Station codes for qr_ref, QR payment creation, and a
-- guard that makes confirmed payments final for staff.

-- Station short codes (placeholders until the owner confirms, PLAN.md §12).
alter table public.stations add column code text unique check (code ~ '^[A-Z0-9]{1,8}$');
update public.stations set code = 'S1' where id = '00000000-0000-0000-0000-00000000000a';
update public.stations set code = 'S2' where id = '00000000-0000-0000-0000-00000000000b';
alter table public.stations alter column code set not null;

-- qr_ref = 'XD' + station code + base-36 counter. Global sequence => unique.
create sequence private.qr_ref_seq;

create function private.to_base36(n bigint) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  digits constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  out text := '';
begin
  if n < 0 then raise exception 'negative'; end if;
  loop
    out := substr(digits, (n % 36)::int + 1, 1) || out;
    n := n / 36;
    exit when n = 0;
  end loop;
  return out;
end $$;

-- Creates a pending QR payment for an unpaid transaction. Runs as the caller
-- (SECURITY INVOKER), so RLS and the guard trigger apply; only the sequence
-- step needs elevated rights, done by a tiny definer helper.
create function private.next_qr_ref(station uuid) returns text
language sql volatile security definer set search_path = ''
as $$
  select 'XD' || s.code || private.to_base36(nextval('private.qr_ref_seq'))
  from public.stations s where s.id = station;
$$;
revoke all on function private.next_qr_ref(uuid), private.to_base36(bigint) from public, anon;
grant execute on function private.next_qr_ref(uuid), private.to_base36(bigint) to authenticated;

create function public.create_qr_payment(tx_id uuid) returns public.payments
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  tx public.transactions;
  p public.payments;
begin
  select * into tx from public.transactions where id = tx_id; -- RLS-filtered
  if tx.id is null then raise exception 'Không tìm thấy giao dịch' using errcode = 'P0002'; end if;
  if tx.amount <= 0 then raise exception 'Số tiền không hợp lệ' using errcode = '22023'; end if;

  insert into public.payments (transaction_id, method, status, qr_ref, created_by)
  values (tx.id, 'qr', 'pending', private.next_qr_ref(tx.station_id), (select auth.uid()))
  returning * into p;
  return p;
end $$;
revoke all on function public.create_qr_payment(uuid) from public, anon;
grant execute on function public.create_qr_payment(uuid) to authenticated;

-- Guard: rules for non-admin users (the service role, auth.uid() null, is exempt).
--  insert: cash must be confirmed by yourself; QR must start pending.
--  update: only a pending QR may change, to confirmed QR or to cash, by yourself.
--  confirmed payments are final (admin reversal comes in Phase 7).
create function private.payments_guard() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null or private.is_admin() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if new.created_by is distinct from uid then
      raise exception 'created_by must be the current user' using errcode = '42501';
    end if;
    if new.method = 'cash' and (new.confirmed_by is distinct from uid) then
      raise exception 'Cash must be confirmed by the current user' using errcode = '42501';
    end if;
    if new.method = 'qr' and new.status <> 'pending' then
      raise exception 'QR payments start pending' using errcode = '42501';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Chỉ quản trị viên được xóa thanh toán' using errcode = '42501';
  end if;

  -- UPDATE
  if old.status = 'confirmed' then
    raise exception 'Thanh toán đã xác nhận. Chỉ quản trị viên được thay đổi.' using errcode = '42501';
  end if;
  if new.transaction_id <> old.transaction_id or new.created_by <> old.created_by
     or new.created_at <> old.created_at or new.qr_ref is distinct from old.qr_ref then
    raise exception 'Immutable payment fields changed' using errcode = '42501';
  end if;
  if new.status <> 'confirmed' or new.confirmed_by is distinct from uid then
    raise exception 'A pending QR may only be confirmed by the current user' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger payments_guard
  before insert or update or delete on public.payments
  for each row execute function private.payments_guard();
