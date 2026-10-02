# Petrol Station QR Payment App — Implementation Plan

This plan is for Claude Code. Build it phase by phase, finishing each phase's verification before starting the next. If something is unclear or not covered here, stop and ask; do not guess.

## 1. Goal

A mobile-first web app that station staff use on a smartphone. It shows each pump's fueling transactions and lets staff collect payment by cash or by a dynamic VietQR code with the exact amount due. At the end of each day it produces an Excel file for the accountant.

## 2. Scope and context

- 2 stations with 8 pumps each and one owner. Fuel types: A95, E5, DO.
- Each station already runs a third-party station management system (the "vendor") that is connected to the pump controllers. A transaction appears in the vendor system as soon as fueling stops.
- The vendor system already issues per-transaction e-invoices. **This app only reads the invoice number. It never issues or changes invoices.**
- **There is no vendor API.** Transaction data comes from the vendor's web portal, reachable over the internet. A background worker logs in to the portal with a station account and reads new transactions (see section 6).
- **Access is read-only.** The worker only logs in, navigates and reads. It must never click, submit or change anything in the portal, and we write nothing back.
- Development uses a **mock portal** first. The real portal is connected only after the owner provides access details and has confirmed with the vendor that automated reading is allowed.
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
| Portal worker | Separate Node.js (TypeScript) service using Playwright, running 24/7 on a small VPS (or Railway/Fly.io), and writing to Supabase |

**Rules for vendor data:**
- Only the worker talks to the vendor portal. The web app and browsers never do.
- Keep the portal credentials and the Supabase service-role key on the worker or server only. Never put them in the frontend or in git.

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

## 6. Vendor portal reader (worker)

**Interface:**
- Keep the `VendorClient` interface with one method: `listTransactions(stationId, since)`. It returns `{ vendor_pump_id, fuel_type, volume, unit_price, amount, fueled_at, invoice_no }[]`.
- The rest of the app depends only on this interface.

**Implementations**, selected with the environment variable `VENDOR_MODE`:
1. `mock`: talks to a mock portal, a small fake website with a login page and a transaction table, plus a script that generates transactions across 2 stations × 8 pumps. All development and testing uses this mode.
2. `portal_http` (preferred): log in once with Playwright to get the session cookie, then call the JSON endpoint that the portal's own transaction page uses. Find that endpoint in Phase 3b.
3. `portal_scrape` (fallback): if no usable JSON endpoint exists, read the transaction table from the page itself with Playwright.

**Worker behaviour:**
- Keep one logged-in session per station. Detect when a session expires and log in again automatically.
- Poll each station every 5 seconds, and upsert rows by `(station_id, invoice_no)`.
- After each run, update `sync_state` (last success, last error). On errors, back off: retry after 5 s, then 15 s, then 60 s.
- If the login page shows a CAPTCHA or OTP, stop and report the problem. Never try to bypass it.
- Throttle all requests and use one session per station, so the vendor's site is not overloaded.

**In the app:**
- If a station's last successful sync is more than 30 seconds old, show a red banner "Mất kết nối dữ liệu trạm" and point staff to manual entry (section 7).
- The worker handles all syncing; the web app only reads from Supabase. There is no in-app mock vendor API, no client-triggered sync and no Vercel cron.

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
3. **Mock portal and worker:** `VendorClient`, the mock portal, the worker in `mock` mode, and `sync_state`.
   → Verify: generated mock transactions appear in the app within 10 s, re-running sync creates no duplicates, and the worker re-logs in automatically after a forced session expiry.

   **3b. Real portal** (only after the owner provides the open items in section 12):
   - With the owner's account, log in manually in a Playwright session.
   - Record the network requests made by the transaction page and decide between `portal_http` and `portal_scrape`.
   - Report the findings to the owner before implementing.
   → Verify: the worker reads one day of real transactions, and they match the portal exactly (count and totals).
4. **Payments:** the cash flow, VietQR generation, and QR manual confirmation.
   → Verify: unit tests for the VietQR payload (field layout and CRC16) pass, and a real banking app scans the test QR with the correct amount prefilled (test with a small amount on the owner's account).
5. **Manual entry:** the fallback form and the `source` flag.
   → Verify: manual rows appear in the list and in reports, marked as manual.
6. **Excel report:** summary and detail sheets.
   → Verify: totals equal the sum of the transactions for the day, and day boundaries use Vietnam time.
7. **Admin and deploy:** admin screens, Vercel deploy, environment variables, a PWA install check on Android, and the worker deployed to a VPS with auto-restart (e.g. Docker + restart policy).
   → Verify: the Playwright happy path (log in → pump → cash pay → QR pay → confirm → export) passes against the deployed app.

## 11. Later (do not build now)

- **Vendor API:** if the vendor ever offers an official API, implement it as another `VendorClient` and retire the portal reader.
- **Bank API:** add a webhook endpoint that matches `qr_ref` plus the amount and auto-confirms the payment. Keep manual confirmation as a fallback.

## 12. Open items (ask the owner, do not assume)

- The vendor's written OK for automated read-only access to the portal.
- The portal URL and a dedicated read-only login for each station, with no CAPTCHA or OTP if possible.
- Screenshots of the transaction page. Confirm it shows pump ID, fuel type, volume, unit price, amount, time and invoice no.
- A sample of the accountant's current daily Excel file.
- Bank name/BIN, account number and account name for each station (one shared account or one per station?).
- Whether staff may download the daily report, or only admins.
- Station short codes to use in `qr_ref`.

## 13. Working rules for Claude Code

- Keep it simple: no features beyond this plan, and no speculative abstractions except `VendorClient`, which is required.
- State your assumptions before coding each phase, and ask if something is unclear.
- Make small, focused commits for each phase. Do not refactor unrelated code.
- Never commit secrets. Use `.env.local` for local secrets and add a `.env.example`.
