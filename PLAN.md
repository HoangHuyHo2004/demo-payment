# Petrol Station QR Payment App — Implementation Plan

This plan is for Claude Code. Build it phase by phase, finishing each phase's verification before starting the next. If something is unclear or not covered here, stop and ask; do not guess.

## 1. Goal

A mobile-first web app that station staff use on a smartphone. It shows each pump's fueling transactions and lets staff collect payment by cash or by a dynamic VietQR code with the exact amount due. At the end of each day it produces an Excel file for the accountant.

## 2. Scope and context

- 2 stations with 8 pumps each and one owner. Fuel types: A95, E5, DO.
- Each station already runs a third-party station management system (the "vendor") that is connected to the pump controllers. A transaction appears in the vendor system as soon as fueling stops.
- The vendor system already issues per-transaction e-invoices. **This app only reads the invoice number. It never issues or changes invoices.**
- **The vendor API is read-only for us.** We do not write payment method or anything else back.
- The vendor API documentation is not available yet, so build against a **mock vendor API** behind an adapter that can be swapped later.
- The bank API for automatic QR confirmation will come later. For now, staff confirm QR payments manually.
- Both stations have stable internet. Each station has 1–2 phones, and each staff member has their own login.
- The UI is in **Vietnamese**, and all money is in VND.

## 3. Tech stack

| Layer | Choice |
|---|---|
| App | Next.js (App Router, TypeScript), deployed on Vercel |
| Database and auth | Supabase (Postgres, Supabase Auth, Row Level Security) |
| UI | Tailwind CSS, mobile-first, installable as a PWA |
| QR | VietQR (NAPAS/EMVCo) payload generated in our code, rendered with the `qrcode` package |
| Excel | `exceljs` |
| Tests | Vitest for unit tests, Playwright for one end-to-end happy path |

**Rules for vendor data:**
- Call the vendor API only from server-side code. Never call it from the browser.
- Keep the Supabase service-role key server-side only.

## 4. Data model

Store all amounts in VND as integers (`bigint`). Store volume as `numeric(10,3)` in liters. Use timezone `Asia/Ho_Chi_Minh` for all business-day boundaries.

| Table | Fields |
|---|---|
| `stations` | id, name |
| `pumps` | id, station_id, vendor_pump_id, label |
| `staff` | id (= auth user id), station_id, full_name, role (`staff` \| `admin`), active |
| `transactions` | id, station_id, pump_id, invoice_no (unique per station), fuel_type (`A95` \| `E5` \| `DO`), volume, unit_price, amount, fueled_at, source (`vendor` \| `manual`), synced_at |
| `payments` | id, transaction_id (unique), method (`cash` \| `qr`), status (`pending` \| `confirmed`), cash_amount, qr_ref, confirmed_by (staff id), confirmed_at, created_by, created_at |
| `bank_accounts` | id, station_id, bank_bin, account_no, account_name |
| `sync_state` | station_id, last_fueled_at, last_run_at, last_error |

Rules:
- `transactions` holds the vendor data unchanged. Payment information lives only in `payments`.
- A transaction with no `payments` row is **unpaid**.
- Row Level Security: staff can read and write only their own station's rows. Admins can read and write everything.

## 5. Payment flow

1. Staff log in, see their station's pumps (each with a count of unpaid transactions), and tap a pump.
2. The pump screen lists that pump's transactions, newest first. Each row shows invoice no., fuel type, volume, unit price, amount, time and status (Chưa thanh toán / Tiền mặt / QR – chờ xác nhận / QR – đã xác nhận).
3. Staff tap an unpaid transaction and choose **Tiền mặt** or **QR**.
   - **Cash:** staff enter the cash amount received (prefilled with the amount due), then confirm. The app creates a payment with method `cash`, status `confirmed`, and `confirmed_by` set to the current staff member.
   - **QR:** the app shows a full-screen dynamic VietQR code for the exact amount, with `qr_ref` in the transfer description. It creates a payment with status `pending`. Staff tap **Đã nhận tiền** after seeing the bank notification, which sets status `confirmed` along with `confirmed_by` and `confirmed_at`.
   - **Switch to cash:** if a QR payment fails, staff can change a pending QR payment to cash.
4. A confirmed payment is final for staff. Only an admin can reverse one, and each reversal is logged.

**`qr_ref` format:** short, uppercase alphanumeric, unique, 25 characters or fewer, for example `XD` + station code + a base-36 counter. Banks may strip other characters, and the future bank webhook will match payments on this code plus the amount.

## 6. Vendor integration (mock first)

- Define a `VendorClient` interface with one method: `listTransactions(stationId, since)`. It returns `{ vendor_pump_id, fuel_type, volume, unit_price, amount, fueled_at, invoice_no }[]`.
- Implement `MockVendorClient`: an in-app mock endpoint (`/api/mock-vendor/...`, enabled only when `VENDOR_MODE=mock`) plus a dev script that generates realistic transactions across 2 stations × 8 pumps.
- **Sync strategy (polling):**
  - While a pump screen is open, the client asks our server to sync every 5 seconds. The server calls the vendor and upserts rows by `(station_id, invoice_no)`.
  - A Vercel cron runs every minute and syncs both stations, so data stays complete even when no one has the app open.
  - Record errors in `sync_state`. If sync fails, show a visible warning banner on screen.

## 7. Manual fallback entry

If the pump-to-vendor connection fails, staff can add a transaction manually with pump, fuel type, volume, unit price and amount (the amount is computed and editable). These rows get `source = manual` and are clearly marked in the UI and the Excel file. Invoice no. is optional for manual rows.

## 8. Daily Excel report

- Admins, and staff at the end of their shift if allowed, choose a date and station and download `BaoCao_<station>_<YYYY-MM-DD>.xlsx`.
- **Sheet 1, summary:** the date at the top. For each fuel type: sản lượng (liters) and DT (revenue), split into cash and QR, with totals.
- **Sheet 2, detail:** one row per transaction: date/time, pump, invoice no., fuel type, volume, unit price, amount, method, cash amount, status, confirmed by, and a manual flag.
- The exact column layout must match the accountant's current file. **Ask the owner for a sample file before finalising the format.**

## 9. Admin screens

- Manage staff: create, deactivate, and assign station and role.
- Configure bank accounts for each station.
- Map vendor pump IDs to pumps.
- View sync status.
- Reverse a confirmed payment (with the reason logged).

## 10. Build phases

Each phase ends with a verification step that must pass before moving on.

1. **Setup:** create the repo, Next.js, Tailwind, Supabase migrations for section 4, and seed data (2 stations, 16 pumps, 1 admin, 2 staff).
   → Verify: migrations apply cleanly, and RLS tests show that staff from station A cannot read station B's data.
2. **Auth and pumps:** Vietnamese login screen and the pump list for the staff member's station.
   → Verify: each role sees the correct pumps.
3. **Mock vendor and sync:** `VendorClient`, the mock, the sync endpoint, the cron, and `sync_state`.
   → Verify: generated mock transactions appear within 5 s, and re-running sync creates no duplicates.
4. **Payments:** the cash flow, VietQR generation, and QR manual confirmation.
   → Verify: unit tests for the VietQR payload (field layout and CRC16) pass, and a real banking app scans the test QR with the correct amount prefilled (test with a small amount on the owner's account).
5. **Manual entry:** the fallback form and the `source` flag.
   → Verify: manual rows appear in the list and in reports, marked as manual.
6. **Excel report:** summary and detail sheets.
   → Verify: totals equal the sum of the transactions for the day, and day boundaries use Vietnam time.
7. **Admin and deploy:** admin screens, Vercel deploy, environment variables, and a PWA install check on Android.
   → Verify: the Playwright happy path (log in → pump → cash pay → QR pay → confirm → export) passes against the deployed app.

## 11. Later (do not build now)

- **Real vendor API:** implement `HttpVendorClient` once the documentation arrives. The swap happens through the `VENDOR_MODE` environment variable.
- **Bank API:** add a webhook endpoint that matches `qr_ref` plus the amount and auto-confirms the payment. Keep manual confirmation as a fallback.

## 12. Open items (ask the owner, do not assume)

- A sample of the accountant's current daily Excel file.
- Bank name/BIN, account number and account name for each station (one shared account or one per station?).
- Whether staff may download the daily report, or only admins.
- Station short codes to use in `qr_ref`.

## 13. Working rules for Claude Code

- Keep it simple: no features beyond this plan, and no speculative abstractions except `VendorClient`, which is required.
- State your assumptions before coding each phase, and ask if something is unclear.
- Make small, focused commits for each phase. Do not refactor unrelated code.
- Never commit secrets. Use `.env.local` for local secrets and add a `.env.example`.
