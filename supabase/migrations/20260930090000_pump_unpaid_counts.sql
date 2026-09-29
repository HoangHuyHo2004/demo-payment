-- Pump list (Phase 2): each pump with its count of unpaid transactions.
-- security_invoker so the caller's RLS on pumps/transactions/payments applies.
create view public.pump_list with (security_invoker = true) as
select p.id,
       p.station_id,
       p.label,
       p.vendor_pump_id,
       count(t.id) filter (where pay.id is null) as unpaid_count
from public.pumps p
left join public.transactions t on t.pump_id = p.id
left join public.payments pay on pay.transaction_id = t.id
group by p.id;

revoke all on public.pump_list from anon;
grant select on public.pump_list to authenticated;
