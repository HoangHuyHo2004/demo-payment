-- Phase 7: admin reversal of a payment, with the reason logged (PLAN.md §5.4, §9).
-- Reversing deletes the payment (the transaction becomes unpaid again) after
-- saving a full snapshot of it here. Only admins can reverse or read the log.
create table public.payment_reversals (
  id             uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete restrict,
  payment        jsonb not null, -- snapshot of the reversed payments row
  reason         text not null check (length(trim(reason)) >= 3),
  reversed_by    uuid not null references public.staff (id),
  reversed_at    timestamptz not null default now()
);
create index payment_reversals_tx_idx on public.payment_reversals (transaction_id);

alter table public.payment_reversals enable row level security;
revoke all on public.payment_reversals from anon;
create policy payment_reversals_admin_read on public.payment_reversals for select to authenticated
  using (private.is_admin());
create policy payment_reversals_admin_insert on public.payment_reversals for insert to authenticated
  with check (private.is_admin() and reversed_by = (select auth.uid()));
-- No update/delete policy: the log is append-only.

create function public.reverse_payment(p_payment_id uuid, p_reason text) returns public.payment_reversals
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  p public.payments;
  r public.payment_reversals;
begin
  if not private.is_admin() then
    raise exception 'Chỉ quản trị viên được hủy thanh toán' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Vui lòng nhập lý do (ít nhất 3 ký tự)' using errcode = '22023';
  end if;

  select * into p from public.payments where id = p_payment_id for update;
  if p.id is null then raise exception 'Không tìm thấy thanh toán' using errcode = 'P0002'; end if;

  insert into public.payment_reversals (transaction_id, payment, reason, reversed_by)
  values (p.transaction_id, to_jsonb(p), trim(p_reason), (select auth.uid()))
  returning * into r;
  delete from public.payments where id = p.id;
  return r;
end $$;
revoke all on function public.reverse_payment(uuid, text) from public, anon;
grant execute on function public.reverse_payment(uuid, text) to authenticated;
