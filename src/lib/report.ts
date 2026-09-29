import ExcelJS from "exceljs";
import type { FuelType } from "./vendor/types";
import { FUEL_TYPES } from "./manual-entry";

// Vietnam has no DST: a business day is [D 00:00 +07:00, D+1 00:00 +07:00).
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
}

export function vnDayRangeUtc(date: string): { from: string; to: string } {
  if (!isIsoDate(date)) throw new Error(`Invalid date: ${date}`);
  const startUtc = Date.parse(`${date}T00:00:00Z`) - VN_OFFSET_MS;
  return { from: new Date(startUtc).toISOString(), to: new Date(startUtc + 86_400_000).toISOString() };
}

export function vnToday(now = new Date()): string {
  return new Date(now.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);
}

export type ReportRow = {
  fueled_at: string;
  pump_label: string;
  invoice_no: string | null;
  fuel_type: FuelType;
  volume: string;
  unit_price: number;
  amount: number;
  source: "vendor" | "manual";
  payment: {
    method: "cash" | "qr";
    status: "pending" | "confirmed";
    cash_amount: number | null;
    confirmed_by_name: string | null;
  } | null;
};

export type Bucket = "cash" | "qr" | "uncollected";
export type Cell = { ml: number; vnd: number }; // liters kept as integer milliliters: exact sums
export type SummaryLine = Record<Bucket | "total", Cell>;
export type Summary = { byFuel: Record<FuelType, SummaryLine>; total: SummaryLine };

export function bucketOf(p: ReportRow["payment"]): Bucket {
  if (p?.status === "confirmed") return p.method === "cash" ? "cash" : "qr";
  return "uncollected"; // unpaid or QR awaiting confirmation
}

export function litersToMl(volume: string): number {
  const [int, frac = ""] = volume.split(".");
  return Number(int) * 1000 + Number(frac.padEnd(3, "0").slice(0, 3));
}

const emptyLine = (): SummaryLine => ({
  cash: { ml: 0, vnd: 0 }, qr: { ml: 0, vnd: 0 }, uncollected: { ml: 0, vnd: 0 }, total: { ml: 0, vnd: 0 },
});

export function summarize(rows: ReportRow[]): Summary {
  const byFuel = Object.fromEntries(FUEL_TYPES.map((f) => [f, emptyLine()])) as Record<FuelType, SummaryLine>;
  const total = emptyLine();
  for (const r of rows) {
    const ml = litersToMl(r.volume);
    for (const line of [byFuel[r.fuel_type], total]) {
      for (const key of [bucketOf(r.payment), "total"] as const) {
        line[key].ml += ml;
        line[key].vnd += r.amount;
      }
    }
  }
  return { byFuel, total };
}

const STATUS_LABEL = (p: ReportRow["payment"]) =>
  !p ? "Chưa thanh toán" : p.method === "cash" ? "Tiền mặt" : p.status === "confirmed" ? "QR – đã xác nhận" : "QR – chờ xác nhận";

// Excel stores wall-clock times without a zone: write Vietnam local time.
const vnWallClock = (iso: string) => new Date(Date.parse(iso) + VN_OFFSET_MS);

const L = "#,##0.000";
const VND = "#,##0";

export async function buildDailyReport(opts: {
  stationName: string;
  date: string; // YYYY-MM-DD (Vietnam business day)
  rows: ReportRow[];
}): Promise<Buffer> {
  const { stationName, date, rows } = opts;
  const s = summarize(rows);
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const [y, m, d] = date.split("-");

  // Sheet 1: summary ---------------------------------------------------------
  const sum = wb.addWorksheet("Tổng hợp");
  sum.addRow([`BÁO CÁO BÁN HÀNG NGÀY ${d}/${m}/${y}`]).font = { bold: true, size: 14 };
  sum.addRow([stationName]);
  sum.addRow([]);
  const head1 = sum.addRow(["Nhiên liệu", "Tiền mặt", "", "QR", "", "Chưa thu", "", "Tổng cộng", ""]);
  const head2 = sum.addRow(["", "Sản lượng (L)", "DT (đ)", "Sản lượng (L)", "DT (đ)", "Sản lượng (L)", "DT (đ)", "Sản lượng (L)", "DT (đ)"]);
  for (const [a, b] of [["B4", "C4"], ["D4", "E4"], ["F4", "G4"], ["H4", "I4"]]) sum.mergeCells(`${a}:${b}`);
  sum.mergeCells("A4:A5");
  for (const r of [head1, head2]) { r.font = { bold: true }; r.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; }

  const line = (label: string, l: SummaryLine) =>
    [label, ...(["cash", "qr", "uncollected", "total"] as const).flatMap((k) => [l[k].ml / 1000, l[k].vnd])];
  for (const f of FUEL_TYPES) sum.addRow(line(f, s.byFuel[f]));
  sum.addRow(line("Tổng", s.total)).font = { bold: true };

  sum.getColumn(1).width = 12;
  for (let c = 2; c <= 9; c++) {
    sum.getColumn(c).width = 16;
    sum.getColumn(c).numFmt = c % 2 === 0 ? L : VND;
  }
  sum.addRow([]);
  sum.addRow([`"Chưa thu" gồm giao dịch chưa thanh toán và QR chờ xác nhận. Số giao dịch: ${rows.length}.`]).font = { italic: true, size: 9 };

  // Sheet 2: detail ----------------------------------------------------------
  const det = wb.addWorksheet("Chi tiết");
  det.columns = [
    { header: "Ngày giờ", key: "time", width: 20, style: { numFmt: "dd/mm/yyyy hh:mm:ss" } },
    { header: "Trụ", key: "pump", width: 10 },
    { header: "Số HĐ", key: "invoice", width: 18 },
    { header: "Nhiên liệu", key: "fuel", width: 10 },
    { header: "Số lít", key: "volume", width: 12, style: { numFmt: L } },
    { header: "Đơn giá", key: "price", width: 12, style: { numFmt: VND } },
    { header: "Thành tiền", key: "amount", width: 14, style: { numFmt: VND } },
    { header: "Hình thức", key: "method", width: 12 },
    { header: "Tiền mặt nhận", key: "cash", width: 14, style: { numFmt: VND } },
    { header: "Trạng thái", key: "status", width: 20 },
    { header: "Người xác nhận", key: "by", width: 20 },
    { header: "Nhập tay", key: "manual", width: 10 },
  ];
  det.getRow(1).font = { bold: true };
  for (const r of [...rows].sort((a, b) => a.fueled_at.localeCompare(b.fueled_at))) {
    det.addRow({
      time: vnWallClock(r.fueled_at),
      pump: r.pump_label,
      invoice: r.invoice_no ?? "",
      fuel: r.fuel_type,
      volume: litersToMl(r.volume) / 1000,
      price: r.unit_price,
      amount: r.amount,
      method: r.payment ? (r.payment.method === "cash" ? "Tiền mặt" : "QR") : "",
      cash: r.payment?.cash_amount ?? null,
      status: STATUS_LABEL(r.payment),
      by: r.payment?.confirmed_by_name ?? "",
      manual: r.source === "manual" ? "X" : "",
    });
  }
  det.views = [{ state: "frozen", ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}
