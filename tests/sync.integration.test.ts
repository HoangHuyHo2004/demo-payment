// Phase 3 verification: sync imports vendor rows and re-running it creates
// no duplicates. Runs against the Supabase project in .env.local with a fake
// VendorClient; cleans up its rows. Skipped when env is missing.
import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { syncStation } from "@/lib/sync";
import type { VendorClient, VendorTransaction } from "@/lib/vendor/types";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
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
};

const countOurs = async () => {
  const { count, error } = await db!
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .like("invoice_no", `${PREFIX}-%`);
  if (error) throw error;
  return count;
};

describe.skipIf(!db)("syncStation against Supabase", () => {
  afterAll(async () => {
    await db!.from("transactions").delete().like("invoice_no", `${PREFIX}-%`);
  });

  it("imports vendor transactions", async () => {
    const result = await syncStation(db!, fakeVendor, STATION);
    expect(result).toEqual({ ok: true, fetched: 3 });
    expect(await countOurs()).toBe(3);
  });

  it("creates no duplicates when re-run", async () => {
    await syncStation(db!, fakeVendor, STATION);
    await syncStation(db!, fakeVendor, STATION);
    expect(await countOurs()).toBe(3);
  });

  it("records the run in sync_state", async () => {
    const { data } = await db!.from("sync_state").select("last_run_at, last_error").eq("station_id", STATION).single();
    expect(data?.last_error).toBeNull();
    expect(Date.now() - new Date(data!.last_run_at).getTime()).toBeLessThan(60_000);
  });

  it("records vendor failures in sync_state", async () => {
    const broken: VendorClient = { listTransactions: async () => { throw new Error("vendor down"); } };
    expect(await syncStation(db!, broken, STATION)).toEqual({ ok: false, error: "vendor down" });
    const { data } = await db!.from("sync_state").select("last_error").eq("station_id", STATION).single();
    expect(data?.last_error).toBe("vendor down");
    await syncStation(db!, fakeVendor, STATION); // clear the error again
  });
});
