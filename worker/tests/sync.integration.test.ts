// syncStation against the Supabase project in ../.env.local with a fake
// VendorClient: imports rows, creates no duplicates when re-run, and records
// sync_state (last success / last error). Cleans up its rows. Skipped when
// env is missing.
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { syncStation } from "../src/sync.ts";
import type { VendorClient, VendorTransaction } from "../src/vendor/types.ts";

config({ path: ["../.env.local", ".env"], quiet: true });

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STATION = "00000000-0000-0000-0000-00000000000a";
const PREFIX = `ITEST${Date.now().toString(36).toUpperCase()}`;

const db = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;

const fueledAt = new Date().toISOString();
const vendorRows: VendorTransaction[] = ["1", "2", "3"].map((n) => ({
  vendor_pump_id: `P${n}`,
  fuel_type: "E5",
  volume: "5.063",
  unit_price: 19750,
  amount: 100000,
  fueled_at: fueledAt,
  invoice_no: `${PREFIX}-${n}`,
}));
const fakeVendor: VendorClient = {
  listTransactions: async (_stationId, since) => vendorRows.filter((r) => new Date(r.fueled_at) > since),
  close: async () => {},
};

const countOurs = async () => {
  const { count, error } = await db!
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .like("invoice_no", `${PREFIX}-%`);
  if (error) throw error;
  return count;
};
const state = async () =>
  (await db!.from("sync_state").select("last_run_at, last_success_at, last_error").eq("station_id", STATION).single()).data!;

describe.skipIf(!db)("syncStation against Supabase", () => {
  afterAll(async () => {
    await db!.from("transactions").delete().like("invoice_no", `${PREFIX}-%`);
  });

  it("imports vendor transactions", async () => {
    const result = await syncStation(db!, fakeVendor, STATION);
    expect(result).toEqual({ ok: true, fetched: 3, advanced: true });
    expect(await countOurs()).toBe(3);
  });

  it("creates no duplicates when re-run", async () => {
    await syncStation(db!, fakeVendor, STATION);
    await syncStation(db!, fakeVendor, STATION);
    expect(await countOurs()).toBe(3);
  });

  it("records a successful run in sync_state", async () => {
    const now = new Date();
    await syncStation(db!, fakeVendor, STATION, now);
    expect(await state()).toMatchObject({ last_error: null });
    expect(new Date((await state()).last_success_at).getTime()).toBe(now.getTime());
  });

  it("on a portal failure: records the error, keeps the old last_success_at, and rethrows", async () => {
    const before = await state();
    const broken: VendorClient = { listTransactions: async () => { throw new Error("portal down"); }, close: async () => {} };
    await expect(syncStation(db!, broken, STATION)).rejects.toThrow("portal down");
    const after = await state();
    expect(after.last_error).toBe("portal down");
    expect(after.last_success_at).toBe(before.last_success_at); // not advanced
    expect(new Date(after.last_run_at).getTime()).toBeGreaterThan(new Date(before.last_run_at).getTime());
  });

  it("an unmapped pump is reported and does not count as a success", async () => {
    const before = await state();
    const odd: VendorClient = {
      listTransactions: async () => [{ ...vendorRows[0], vendor_pump_id: "P99", invoice_no: `${PREFIX}-odd` }],
      close: async () => {},
    };
    expect(await syncStation(db!, odd, STATION)).toEqual({ ok: false, error: "Trụ chưa được ánh xạ: P99" });
    expect((await state()).last_success_at).toBe(before.last_success_at);
    await syncStation(db!, fakeVendor, STATION); // leave sync_state clean
  });
});
