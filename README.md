# Thanh toán cây xăng (Petrol Station QR Payment)

Mobile-first web app for station staff to collect cash / VietQR payments per pump.
See [PLAN.md](PLAN.md) for the full spec and build phases.

## Stack

Next.js (App Router, TypeScript) · Tailwind · Supabase (Postgres, Auth, RLS) · Vitest

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key,
   service-role key and a dev `SEED_PASSWORD`.
3. Apply the migrations in `supabase/migrations/` in filename order (SQL editor), then
   `supabase/seed.sql` (2 stations × 8 pumps).
4. `npm run seed:users` creates `admin@petrol.test`, `staff1@petrol.test`
   (station 1) and `staff2@petrol.test` (station 2) with `SEED_PASSWORD`.
5. `npm run dev`

## Checks

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- Pumps by role: `npm test` runs `tests/pumps-by-role.test.ts` against the
  project in `.env.local` (skipped if env is missing; needs `seed:users`).
- RLS: run `supabase/tests/rls_test.sql` in the Supabase SQL editor. It runs in
  a rolled-back transaction and returns `RLS OK` or raises `RLS FAIL: ...`.

## Vendor sync (mock)

- `VendorClient` (`src/lib/vendor/`) is the only way business code reads vendor
  data. `VENDOR_MODE=mock` selects `MockVendorClient`, which calls this app's
  `/api/mock-vendor/transactions` (backed by `mock_vendor_transactions`).
- `npm run mock:vendor` generates one transaction every 10 s across 2 × 8 pumps
  (`-- --every 3` to change the rate, `-- --count 20` for a one-off batch).
- An open pump screen calls `POST /api/sync` every 5 s; Vercel Cron calls
  `GET /api/cron/sync` every minute (`Authorization: Bearer $CRON_SECRET`).
- Sync re-reads 10 min behind the newest transaction and upserts on
  `(station_id, invoice_no)`, so re-runs never duplicate. Failures and unmapped
  vendor pump IDs are written to `sync_state.last_error` and shown as a red
  banner on the pump screen.

## Payments

- Tap a transaction → **Tiền mặt** (enter cash received, prefilled with the
  amount due) or **QR** (full-screen VietQR with the exact amount; staff tap
  **Đã nhận tiền** after seeing the bank notification, or switch to cash).
- VietQR payload is built in `src/lib/vietqr.ts` (NAPAS/EMVCo fields + CRC16).
- `qr_ref` = `XD` + station code + base-36 counter (DB sequence), e.g. `XDS13`.
- The `payments_guard` trigger makes confirmed payments final for staff; only
  a pending QR can change (to confirmed QR or to cash), always confirmed by the
  current user. Admin reversal arrives in Phase 7.
- **Placeholders:** station codes `S1`/`S2` and bank account
  `970436 / 0000000000 / TAI KHOAN THU NGHIEM` until the owner supplies real
  details. Update `stations.code` and `bank_accounts` in the SQL editor.

## Manual entry (fallback)

- Pump screen → **Nhập tay giao dịch**: pump, fuel type, liters, unit price,
  amount (computed as liters × price rounded to whole đồng, editable) and an
  optional invoice no. Rows get `source = manual` and a **NHẬP TAY** badge.
- If a manual invoice no. later arrives from the vendor, sync merges it into the
  vendor row (same `(station_id, invoice_no)`); any payment stays attached.

## Daily Excel report

- Home → **Báo cáo** → choose station and date → `BaoCao_<code>_<YYYY-MM-DD>.xlsx`
  (`GET /api/reports/daily?station_id=&date=`). Admins: any station; staff:
  their own (RLS).
- A business day is 00:00–24:00 Asia/Ho_Chi_Minh (UTC+7, no DST).
- Sheet **Tổng hợp**: per fuel type, liters and revenue for cash, QR
  (confirmed), "chưa thu" (unpaid + QR awaiting confirmation) and total.
  Liters are summed as integer milliliters (exact).
- Sheet **Chi tiết**: one row per transaction with time (Vietnam), pump,
  invoice, fuel, liters, unit price, amount, method, cash received, status,
  confirmed by, manual flag.
- **Default layout** until the accountant's sample file arrives (PLAN.md §8).

## Access rules (RLS)

- Staff read their own station's rows only; inactive staff see nothing; anon sees nothing.
- Staff may insert only `manual` transactions for their own station, and create/confirm
  payments per the Phase 4 rules. Editing transactions is admin-only, so vendor data
  stays unchanged.
- Stations, pumps, staff and bank accounts are writable by admins only (so staff
  cannot promote themselves or change the QR bank account).
- `sync_state` is written only by the server (service role, bypasses RLS).
- Helper functions live in the non-API `private` schema.

## Open items (PLAN.md §12)

Bank details per station, station short codes for `qr_ref`, whether staff may
download reports, and a sample of the accountant's Excel file. Bank accounts are
not seeded until real details arrive.
