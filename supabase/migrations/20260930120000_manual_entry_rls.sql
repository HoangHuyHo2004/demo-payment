-- Phase 5: manual fallback entry. Tighten transaction writes so vendor data
-- stays unchanged (PLAN.md §4): staff may only INSERT manual rows for their
-- own station; editing transactions is admin-only. Vendor rows are written by
-- the server's service role (bypasses RLS).
drop policy transactions_write on public.transactions;
drop policy transactions_update on public.transactions;

create policy transactions_insert_manual on public.transactions for insert to authenticated
  with check (
    private.is_admin()
    or (source = 'manual' and synced_at is null and station_id = private.my_station_id())
  );

create policy transactions_admin_update on public.transactions for update to authenticated
  using (private.is_admin()) with check (private.is_admin());
