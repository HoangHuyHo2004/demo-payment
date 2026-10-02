-- Portal worker (PLAN.md §6): track the last fully successful sync separately
-- from the last attempt. The app shows "Mất kết nối dữ liệu trạm" when
-- last_success_at is more than 30 seconds old.
alter table public.sync_state add column last_success_at timestamptz;
