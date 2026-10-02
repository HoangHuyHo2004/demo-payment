// Portal worker: one logged-in session per station, poll every 5 s, upsert to
// Supabase, record sync_state. Runs 24/7 (see Dockerfile).
import { chromium } from "playwright";
import { MOCK_PORTAL_PORT, mockPortalData, readConfig } from "./config.ts";
import { startMockPortal, type MockPortal } from "./mock-portal/server.ts";
import { runStation } from "./runner.ts";
import { syncStation } from "./sync.ts";
import { MockPortalClient } from "./vendor/mock.ts";
import type { VendorClient } from "./vendor/types.ts";

const cfg = readConfig();
const log = (m: string) => console.log(`${new Date().toISOString()} ${m}`);

let mockPortal: MockPortal | undefined;
let portalUrl = cfg.portalUrl;
if (cfg.mode === "mock" && !portalUrl) {
  mockPortal = await startMockPortal({ accounts: cfg.accounts, listTransactions: mockPortalData(cfg.db) }, MOCK_PORTAL_PORT);
  portalUrl = mockPortal.url;
  log(`mock portal listening on ${portalUrl}`);
}

const browser = await chromium.launch({ headless: true });

let vendor: VendorClient;
if (cfg.mode === "mock") {
  vendor = new MockPortalClient(browser, portalUrl!, cfg.accounts);
} else {
  // portal_http / portal_scrape are implemented in Phase 3b, after the owner
  // provides portal access and the vendor's OK (PLAN.md sections 10 and 12).
  await browser.close();
  throw new Error(`VENDOR_MODE=${cfg.mode} is not implemented yet (Phase 3b). Use VENDOR_MODE=mock.`);
}

const abort = new AbortController();
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { log(`${sig}: shutting down`); abort.abort(); });
}

log(`worker started: mode=${cfg.mode}, stations=${cfg.accounts.length}`);
const outcomes = await Promise.all(
  cfg.accounts.map((a) =>
    runStation({ stationId: a.station_id, runOnce: () => syncStation(cfg.db, vendor, a.station_id) }, abort.signal),
  ),
);

if (!abort.signal.aborted && outcomes.every((o) => o === "challenge")) {
  // Every station stopped on a CAPTCHA/OTP. Do NOT exit: a restart policy would
  // log in again in a loop. Stay idle (sync_state carries the error, the app
  // shows the banner) until an operator fixes the login and restarts the worker.
  log("all stations stopped on CAPTCHA/OTP; idle until restarted by an operator");
  await new Promise<void>((resolve) => abort.signal.addEventListener("abort", () => resolve(), { once: true }));
}

await vendor.close();
await browser.close();
await mockPortal?.close();
process.exit(0);
