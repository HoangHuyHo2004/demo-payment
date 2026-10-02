# Thanh toán cây xăng (Petrol Station QR Payment)

Mobile-first web app for station staff to collect cash / VietQR payments per pump.
See [PLAN.md](PLAN.md) for the full spec and build phases.

## Stack

Next.js (App Router, TypeScript) · Tailwind · Supabase (Postgres, Auth, RLS) · Vitest ·
a separate Playwright **portal worker** (`worker/`) that reads the vendor's web portal

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key,
   service-role key and a dev `SEED_PASSWORD`.
3. Apply the migrations in `supabase/migrations/` in filename order (SQL editor), then
   `supabase/seed.sql` (2 stations × 8 pumps).
4. `npm run seed:users` creates `admin@petrol.test`, `staff1@petrol.test`
   (station 1) and `staff2@petrol.test` (station 2) with `SEED_PASSWORD`.
5. `npm run dev` (web app) and, in a second terminal, `npm run worker`
   (portal worker + mock portal; first time: `npm --prefix worker install` and
   `npx --prefix worker playwright install chromium`).

## Checks

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- Pumps by role: `npm test` runs `tests/pumps-by-role.test.ts` against the
  project in `.env.local` (skipped if env is missing; needs `seed:users`).
- Worker: `npm --prefix worker test` (portal login, session expiry re-login,
  CAPTCHA/OTP stop, backoff, sync against Supabase) and
  `npm --prefix worker run typecheck`.
- E2E (Playwright, Pixel 7 profile): `npm run e2e` starts the web app and the
  worker locally, or `E2E_BASE_URL=https://<deployment> npm run e2e` against a
  deploy (the worker must be running). Happy path: log in → pump → cash pay →
  QR pay → confirm → export. Seeds its own mock portal transactions and cleans
  them up (needs `.env.local`).
- RLS: run `supabase/tests/rls_test.sql` in the Supabase SQL editor. It runs in
  a rolled-back transaction and returns `RLS OK` or raises `RLS FAIL: ...`.

## Vendor portal reader (worker)

There is no vendor API. `worker/` is a separate Node.js service that logs in to
the vendor's web portal with one read-only account per station, reads new
transactions and writes them to Supabase. The web app never talks to the
portal; it only reads Supabase.

- `VendorClient` (`worker/src/vendor/types.ts`) is the only interface the
  worker's sync code uses. `VENDOR_MODE` selects the implementation:
  - `mock`: logs in to the **mock portal** (`worker/src/mock-portal/`, a fake
    site with a login page and a transaction table) with Playwright, then reads
    the JSON endpoint its transaction page uses. `npm run worker` starts both.
  - `portal_http` / `portal_scrape`: the real portal. **Not implemented until
    Phase 3b**, which needs the owner's portal access and the vendor's written
    OK (PLAN.md §12).
- Behaviour: one logged-in session per station, automatic re-login when the
  session expires, poll every 5 s, at least 1 s between portal requests per
  station, upsert on `(station_id, invoice_no)` with a 10-minute re-read window
  (re-runs never duplicate). On errors it backs off 5 s → 15 s → 60 s.
- **Read-only:** the only form the worker ever submits is the login. If the
  login page shows a CAPTCHA or OTP the worker stops polling that station,
  records the problem and waits for an operator. It never tries to bypass it.
- `sync_state`: `last_run_at` (every attempt), `last_success_at` (fully
  successful runs only), `last_error`. Unmapped vendor pump IDs count as an
  error. When `last_success_at` is more than 30 s old the app shows the red
  banner **"Mất kết nối dữ liệu trạm"** with a link to manual entry; admins see
  details under **Quản trị → Trạng thái đồng bộ**.
- `npm run mock:vendor` adds one transaction every 10 s to the mock portal's
  data across 2 × 8 pumps (`-- --every 3`, or `-- --count 20` for a batch).
  `npm --prefix worker run portal` runs just the mock portal
  (http://127.0.0.1:4010/login, `tram1` / `mock-portal-1`).

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

## Admin (`/admin`, admins only; others get 404)

- **Nhân viên**: create logins (email + initial password, via the Auth admin
  API server-side), assign station and role, deactivate. Admins can't lock out
  or demote themselves.
- **Cửa hàng, trụ & tài khoản NH**: QR bank account per station; pump display
  names and vendor pump IDs (the mapping sync uses).
- **Trạng thái đồng bộ**: last run, newest transaction and last error per station.
- **Hủy thanh toán**: on a transaction with a confirmed payment, an admin enters
  a reason; `reverse_payment` logs a snapshot + reason + admin in
  `payment_reversals` (append-only) and removes the payment, so the
  transaction is unpaid again. The history shows on the transaction screen.

## Access rules (RLS)

- Staff read their own station's rows only; inactive staff see nothing; anon sees nothing.
- Staff may insert only `manual` transactions for their own station, and create/confirm
  payments per the Phase 4 rules. Editing transactions is admin-only, so vendor data
  stays unchanged.
- Stations, pumps, staff and bank accounts are writable by admins only (so staff
  cannot promote themselves or change the QR bank account).
- `sync_state` is written only by the server (service role, bypasses RLS).
- Helper functions live in the non-API `private` schema.

## Deploy

**Web app (Vercel)**

1. vercel.com → **Add New → Project** → import `HoangHuyHo2004/demo-payment`
   (framework preset: Next.js, defaults are fine).
2. Environment variables (Production): `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (values as in
   `.env.local`; never `SEED_PASSWORD`). No cron and no vendor settings: the
   web app only reads Supabase, so the Hobby plan is enough.
3. Deploy. Every push to `main` redeploys.
4. Check: `E2E_BASE_URL=https://<your-domain> npm run e2e` (with the worker
   running), then on an Android phone open the site in Chrome → menu →
   **Install app / Add to Home screen**.

**Portal worker (small VPS, Docker)**

1. Copy the `worker/` folder to the VPS and create `worker/.env` from
   `worker/.env.example` (Supabase URL, service-role key, `VENDOR_MODE`, and
   for the real portal `PORTAL_URL` + `PORTAL_ACCOUNTS`). Secrets stay on the
   VPS only.
2. `docker compose up -d --build`: runs 24/7 with `restart: unless-stopped`.
   Logs: `docker compose logs -f`.
3. If every station stops on a CAPTCHA/OTP the worker stays idle on purpose
   (it does not exit, so Docker does not retry the login in a loop). Fix the
   login, then `docker compose restart`.

## Open items (PLAN.md §12)

Vendor's written OK for automated read-only portal access; portal URL and a
read-only login per station; screenshots of the portal's transaction page.
Bank details per station, station short codes for `qr_ref`, whether staff may
download reports, and a sample of the accountant's Excel file. Bank accounts are
not seeded until real details arrive.
