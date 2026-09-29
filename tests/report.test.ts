import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildDailyReport, isIsoDate, litersToMl, summarize, vnDayRangeUtc, vnToday, type ReportRow } from "@/lib/report";

describe("Vietnam business day", () => {
  it("maps a date to [00:00, 24:00) Asia/Ho_Chi_Minh in UTC", () => {
    expect(vnDayRangeUtc("2026-09-30")).toEqual({ from: "2026-09-29T17:00:00.000Z", to: "2026-09-30T17:00:00.000Z" });
    expect(vnDayRangeUtc("2026-01-01")).toEqual({ from: "2025-12-31T17:00:00.000Z", to: "2026-01-01T17:00:00.000Z" });
  });
  it("vnToday switches date at 17:00 UTC", () => {
    expect(vnToday(new Date("2026-09-29T16:59:59Z"))).toBe("2026-09-29");
    expect(vnToday(new Date("2026-09-29T17:00:00Z"))).toBe("2026-09-30");
  });
  it("rejects invalid dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("30/09/2026")).toBe(false);
    expect(() => vnDayRangeUtc("2026-13-01")).toThrow();
  });
});

describe("litersToMl", () => {
  it("is exact for 3-decimal strings", () => {
    expect(litersToMl("12.345")).toBe(12345);
    expect(litersToMl("0.1")).toBe(100);
    expect(litersToMl("7")).toBe(7000);
  });
});

const row = (over: Partial<ReportRow>): ReportRow => ({
  fueled_at: "2026-09-30T01:00:00.000Z",
  pump_label: "Trụ 1",
  invoice_no: "HD1",
  fuel_type: "A95",
  volume: "0.100",
  unit_price: 20650,
  amount: 2065,
  source: "vendor",
  payment: null,
  ...over,
});
const cash = { method: "cash" as const, status: "confirmed" as const, cash_amount: 50000, confirmed_by_name: "Nhân viên CH1" };
const qrOk = { method: "qr" as const, status: "confirmed" as const, cash_amount: null, confirmed_by_name: "Nhân viên CH1" };
const qrPending = { method: "qr" as const, status: "pending" as const, cash_amount: null, confirmed_by_name: null };

// Fixture: 7 transactions across fuels and payment states.
const fixture: ReportRow[] = [
  row({ invoice_no: "A1", volume: "0.100", amount: 2065, payment: cash }),
  row({ invoice_no: "A2", volume: "0.200", amount: 4130, payment: cash }),
  row({ invoice_no: "A3", volume: "2.421", amount: 50000, payment: qrOk }),
  row({ invoice_no: "E1", fuel_type: "E5", volume: "10.500", unit_price: 19750, amount: 207375, payment: qrPending }),
  row({ invoice_no: "E2", fuel_type: "E5", volume: "5.063", unit_price: 19750, amount: 100000 }),
  row({ invoice_no: null, fuel_type: "DO", volume: "12.500", unit_price: 18870, amount: 235875, source: "manual", payment: cash }),
  row({ invoice_no: "D2", fuel_type: "DO", volume: "1.001", unit_price: 18870, amount: 18889, payment: qrOk }),
];
const sumVnd = fixture.reduce((s, r) => s + r.amount, 0);
const sumMl = fixture.reduce((s, r) => s + litersToMl(r.volume), 0);

describe("summarize", () => {
  const s = summarize(fixture);

  it("totals equal the sum of the day's transactions", () => {
    expect(s.total.total).toEqual({ ml: sumMl, vnd: sumVnd });
    expect(s.total.cash.vnd + s.total.qr.vnd + s.total.uncollected.vnd).toBe(sumVnd);
    expect(s.total.cash.ml + s.total.qr.ml + s.total.uncollected.ml).toBe(sumMl);
  });

  it("splits by fuel and payment state (pending QR counts as uncollected)", () => {
    expect(s.byFuel.A95).toEqual({
      cash: { ml: 300, vnd: 6195 }, qr: { ml: 2421, vnd: 50000 }, uncollected: { ml: 0, vnd: 0 }, total: { ml: 2721, vnd: 56195 },
    });
    expect(s.byFuel.E5.uncollected).toEqual({ ml: 15563, vnd: 307375 });
    expect(s.byFuel.DO.cash).toEqual({ ml: 12500, vnd: 235875 });
    expect(s.byFuel.DO.qr).toEqual({ ml: 1001, vnd: 18889 });
  });

  it("has no float drift (0.1 L + 0.2 L = exactly 0.3 L)", () => {
    expect(s.byFuel.A95.cash.ml).toBe(300);
  });
});

describe("buildDailyReport", async () => {
  const buf = await buildDailyReport({ stationName: "Cửa hàng xăng dầu số 1", date: "2026-09-30", rows: fixture });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const sum = wb.getWorksheet("Tổng hợp")!;
  const det = wb.getWorksheet("Chi tiết")!;

  it("has the summary and detail sheets", () => {
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Tổng hợp", "Chi tiết"]);
    expect(sum.getCell("A1").value).toBe("BÁO CÁO BÁN HÀNG NGÀY 30/09/2026");
  });

  it("summary rows: A95, E5, DO, Tổng with totals matching the transactions", () => {
    expect([6, 7, 8, 9].map((r) => sum.getCell(`A${r}`).value)).toEqual(["A95", "E5", "DO", "Tổng"]);
    expect(sum.getCell("H9").value).toBeCloseTo(sumMl / 1000, 3); // total liters
    expect(sum.getCell("I9").value).toBe(sumVnd); // total revenue
    expect(sum.getCell("C9").value).toBe(242070); // cash revenue: 2065 + 4130 + 235875
    expect(sum.getCell("E9").value).toBe(68889); // QR revenue
    expect(sum.getCell("G9").value).toBe(307375); // uncollected
  });

  it("detail: one row per transaction, Vietnam wall-clock time, manual flag", () => {
    expect(det.rowCount).toBe(1 + fixture.length);
    expect(det.getRow(1).values).toContain("Nhập tay");
    const first = det.getRow(2);
    expect((first.getCell(1).value as Date).toISOString()).toBe("2026-09-30T08:00:00.000Z"); // 08:00 VN shown
    const manual = det.getRows(2, fixture.length)!.filter((r) => r.getCell(12).value === "X");
    expect(manual).toHaveLength(1);
    expect(manual[0].getCell(3).value).toBe("");
    const amounts = det.getRows(2, fixture.length)!.map((r) => r.getCell(7).value as number);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(sumVnd);
  });
});
