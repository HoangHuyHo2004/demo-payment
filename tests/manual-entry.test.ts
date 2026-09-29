import { describe, expect, it } from "vitest";
import { computeAmount, parseLiters, parseManualEntry } from "@/lib/manual-entry";

describe("parseLiters", () => {
  it("accepts dot or Vietnamese comma decimals, normalised to 3 dp", () => {
    expect(parseLiters("12,5")).toBe("12.500");
    expect(parseLiters("12.345")).toBe("12.345");
    expect(parseLiters("7")).toBe("7.000");
  });
  it("rejects zero, negatives, >3 dp and junk", () => {
    for (const bad of ["0", "-1", "1.2345", "abc", "", "1,2,3"]) expect(parseLiters(bad)).toBeNull();
  });
});

describe("computeAmount", () => {
  it("multiplies liters by price and rounds to whole đồng", () => {
    expect(computeAmount("2.421", 20650)).toBe(49994); // 49993.65
    expect(computeAmount("10.000", 19750)).toBe(197500);
    expect(computeAmount("0.001", 20650)).toBe(21); // 20.65
  });
});

describe("parseManualEntry", () => {
  const valid = { pump_id: "p1", fuel_type: "E5", volume: "10,5", unit_price: "19.750", amount: "207.375", invoice_no: "" };

  it("parses a valid entry; empty invoice becomes null", () => {
    expect(parseManualEntry(valid)).toEqual({
      ok: true,
      value: { pump_id: "p1", fuel_type: "E5", volume: "10.500", unit_price: 19750, amount: 207375, invoice_no: null },
    });
  });

  it("keeps an edited amount (staff may override the computed value)", () => {
    const r = parseManualEntry({ ...valid, amount: "207.000" });
    expect(r.ok && r.value.amount).toBe(207000);
  });

  it("rejects missing pump, unknown fuel and bad numbers with Vietnamese messages", () => {
    expect(parseManualEntry({ ...valid, pump_id: "" })).toMatchObject({ ok: false });
    expect(parseManualEntry({ ...valid, fuel_type: "RON92" })).toMatchObject({ ok: false });
    expect(parseManualEntry({ ...valid, volume: "0" })).toMatchObject({ ok: false, error: expect.stringContaining("Số lít") });
    expect(parseManualEntry({ ...valid, unit_price: "0" })).toMatchObject({ ok: false });
    expect(parseManualEntry({ ...valid, amount: "1.5" })).toMatchObject({ ok: false });
  });
});
