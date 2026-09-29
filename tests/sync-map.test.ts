import { describe, expect, it } from "vitest";
import { mapVendorTransactions } from "@/lib/sync";
import type { VendorTransaction } from "@/lib/vendor/types";

const tx = (over: Partial<VendorTransaction> = {}): VendorTransaction => ({
  vendor_pump_id: "P1",
  fuel_type: "A95",
  volume: "2.421",
  unit_price: 20650,
  amount: 50000,
  fueled_at: "2026-09-30T08:15:00+07:00",
  invoice_no: "HD1ABC",
  ...over,
});

const pumps = new Map([["P1", "pump-uuid-1"], ["P2", "pump-uuid-2"]]);
const now = new Date("2026-09-30T01:15:05Z");

describe("mapVendorTransactions", () => {
  it("maps vendor fields unchanged and normalises time to UTC", () => {
    const { rows, unknownPumps } = mapVendorTransactions("st-1", [tx()], pumps, now);
    expect(unknownPumps).toEqual([]);
    expect(rows).toEqual([
      {
        station_id: "st-1",
        pump_id: "pump-uuid-1",
        invoice_no: "HD1ABC",
        fuel_type: "A95",
        volume: "2.421",
        unit_price: 20650,
        amount: 50000,
        fueled_at: "2026-09-30T01:15:00.000Z",
        source: "vendor",
        synced_at: "2026-09-30T01:15:05.000Z",
      },
    ]);
  });

  it("reports unmapped pumps instead of inventing a pump", () => {
    const { rows, unknownPumps } = mapVendorTransactions(
      "st-1",
      [tx({ vendor_pump_id: "P9", invoice_no: "A" }), tx({ vendor_pump_id: "P2", invoice_no: "B" }), tx({ vendor_pump_id: "P9", invoice_no: "C" })],
      pumps,
      now,
    );
    expect(rows.map((r) => r.invoice_no)).toEqual(["B"]);
    expect(unknownPumps).toEqual(["P9"]);
  });
});
