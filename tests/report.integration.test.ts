// Phase 6 verification against the Supabase project in .env.local: the day's
// report includes exactly the transactions inside the Vietnam business day,
// manual rows included, and totals equal their sum. Uses a past date so real
// demo data can't interfere; removes its rows afterwards.
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { fetchReportRows } from "@/lib/report-data";
import { summarize } from "@/lib/report";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STATION_1 = "00000000-0000-0000-0000-00000000000a";
const PREFIX = `RTEST${Date.now().toString(36).toUpperCase()}`;
const DAY = "2025-01-15";

let db: SupabaseClient;

describe.skipIf(!url || !service)("daily report data", () => {
  beforeAll(async () => {
    db = createClient(url!, service!, { auth: { persistSession: false } });
    const { data: pump } = await db.from("pumps").select("id").eq("station_id", STATION_1).eq("vendor_pump_id", "P1").single();
    const base = { station_id: STATION_1, pump_id: pump!.id, fuel_type: "A95", unit_price: 20000 };
    const { error } = await db.from("transactions").insert([
      { ...base, invoice_no: `${PREFIX}-before`, volume: "1.000", amount: 20000, fueled_at: "2025-01-14T16:59:59Z", source: "vendor" }, // 23:59:59 on the 14th VN
      { ...base, invoice_no: `${PREFIX}-start`, volume: "2.000", amount: 40000, fueled_at: "2025-01-14T17:00:00Z", source: "vendor" }, // 00:00:00 on the 15th VN
      { ...base, invoice_no: `${PREFIX}-end`, volume: "3.000", amount: 60000, fueled_at: "2025-01-15T16:59:59Z", source: "vendor" }, // 23:59:59 on the 15th VN
      { ...base, invoice_no: `${PREFIX}-after`, volume: "4.000", amount: 80000, fueled_at: "2025-01-15T17:00:00Z", source: "vendor" }, // 00:00:00 on the 16th VN
      { ...base, invoice_no: `${PREFIX}-manual`, volume: "0.500", amount: 10000, fueled_at: "2025-01-15T05:00:00Z", source: "manual" },
    ]);
    if (error) throw error;
  });

  afterAll(async () => {
    await db.from("transactions").delete().like("invoice_no", `${PREFIX}-%`);
  });

  it("includes exactly the rows inside the Vietnam business day", async () => {
    const rows = (await fetchReportRows(db, STATION_1, DAY)).filter((r) => r.invoice_no?.startsWith(PREFIX));
    expect(rows.map((r) => r.invoice_no!.slice(PREFIX.length + 1))).toEqual(["start", "manual", "end"]);
  });

  it("marks manual rows and totals equal the sum of the day's transactions", async () => {
    const rows = await fetchReportRows(db, STATION_1, DAY);
    expect(rows.find((r) => r.invoice_no === `${PREFIX}-manual`)?.source).toBe("manual");
    const s = summarize(rows);
    expect(s.total.total.vnd).toBe(rows.reduce((a, r) => a + r.amount, 0));
    const ours = summarize(rows.filter((r) => r.invoice_no?.startsWith(PREFIX)));
    expect(ours.total.total).toEqual({ ml: 5500, vnd: 110000 });
  });
});
