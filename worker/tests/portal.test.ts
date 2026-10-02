// MockPortalClient against the mock portal, with a real (headless) Chromium.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { startMockPortal, type MockPortal } from "../src/mock-portal/server.ts";
import { MockPortalClient } from "../src/vendor/mock.ts";
import { PortalChallengeError, PortalLoginError, type PortalAccount, type VendorTransaction } from "../src/vendor/types.ts";

const accounts: PortalAccount[] = [
  { station_id: "st-1", username: "tram1", password: "pw1" },
  { station_id: "st-2", username: "tram2", password: "pw2" },
];
const tx = (invoice_no: string, fueled_at: string): VendorTransaction => ({
  vendor_pump_id: "P1", fuel_type: "A95", volume: "2.421", unit_price: 20650, amount: 50000, fueled_at, invoice_no,
});
const data: Record<string, VendorTransaction[]> = {
  "st-1": [tx("A-1", "2026-10-01T01:00:00.000Z"), tx("A-2", "2026-10-01T02:00:00.000Z")],
  "st-2": [tx("B-1", "2026-10-01T01:30:00.000Z")],
};

let browser: Browser;
let portal: MockPortal;
let client: MockPortalClient;
const EPOCH = new Date(0);

beforeAll(async () => {
  browser = await chromium.launch();
  portal = await startMockPortal({
    accounts,
    listTransactions: async (stationId, since) => (data[stationId] ?? []).filter((t) => new Date(t.fueled_at) > since),
  });
  client = new MockPortalClient(browser, portal.url, accounts);
});

afterAll(async () => {
  await client.close();
  await browser.close();
  await portal.close();
});

describe("MockPortalClient", () => {
  it("logs in and reads the station's transactions", async () => {
    expect((await client.listTransactions("st-1", EPOCH)).map((t) => t.invoice_no)).toEqual(["A-1", "A-2"]);
    expect(portal.logins()).toBe(1);
  });

  it("only returns rows after `since`", async () => {
    const rows = await client.listTransactions("st-1", new Date("2026-10-01T01:00:00.000Z"));
    expect(rows.map((t) => t.invoice_no)).toEqual(["A-2"]);
  });

  it("keeps one session per station (no new login per poll; stations are separate)", async () => {
    await client.listTransactions("st-1", EPOCH);
    expect(portal.logins()).toBe(1);
    expect((await client.listTransactions("st-2", EPOCH)).map((t) => t.invoice_no)).toEqual(["B-1"]);
    expect(portal.logins()).toBe(2);
  });

  it("re-logs in automatically after a forced session expiry", async () => {
    portal.expireSessions();
    const rows = await client.listTransactions("st-1", EPOCH); // same call succeeds
    expect(rows).toHaveLength(2);
    expect(portal.logins()).toBe(3);
  });

  it("throttles: two requests for one station are at least 1 s apart", async () => {
    const t0 = Date.now();
    await client.listTransactions("st-1", EPOCH);
    await client.listTransactions("st-1", EPOCH);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(1000);
  });

  it("stops with PortalChallengeError on a CAPTCHA and does not log in", async () => {
    portal.expireSessions();
    portal.setChallenge("captcha");
    const before = portal.logins();
    await expect(client.listTransactions("st-1", EPOCH)).rejects.toBeInstanceOf(PortalChallengeError);
    expect(portal.logins()).toBe(before);
  });

  it("stops with PortalChallengeError on an OTP prompt", async () => {
    portal.setChallenge("otp");
    await expect(client.listTransactions("st-2", EPOCH)).rejects.toThrow(/OTP/);
    portal.setChallenge(null);
  });

  it("reports a wrong password as a login error", async () => {
    const bad = new MockPortalClient(browser, portal.url, [{ station_id: "st-1", username: "tram1", password: "wrong" }]);
    await expect(bad.listTransactions("st-1", EPOCH)).rejects.toBeInstanceOf(PortalLoginError);
    await bad.close();
  });

  it("the portal itself refuses data without a session", async () => {
    const res = await fetch(`${portal.url}/api/transactions?since=${EPOCH.toISOString()}`);
    expect(res.status).toBe(401);
  });
});
