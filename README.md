# Thanh toán cây xăng (Petrol Station QR Payment)

Mobile-first web app for station staff to collect cash / VietQR payments per pump.
See [PLAN.md](PLAN.md) for the full spec and build phases.

## Stack

Next.js (App Router, TypeScript) · Tailwind · Supabase (Postgres, Auth, RLS) · Vitest

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase URL, anon key,
   service-role key and a dev `SEED_PASSWORD`.
3. Apply the migrations in `supabase/migrations/` in filename order, then
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

## Access rules (RLS)

- Staff read their own station's rows only; inactive staff see nothing; anon sees nothing.
- Staff may insert/update transactions and payments for their own station.
- Stations, pumps, staff and bank accounts are writable by admins only (so staff
  cannot promote themselves or change the QR bank account).
- `sync_state` is written only by the server (service role, bypasses RLS).
- Helper functions live in the non-API `private` schema.

## Open items (PLAN.md §12)

Bank details per station, station short codes for `qr_ref`, whether staff may
download reports, and a sample of the accountant's Excel file. Bank accounts are
not seeded until real details arrive.
