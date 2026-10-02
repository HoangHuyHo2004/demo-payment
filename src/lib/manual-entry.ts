import { parseVnd } from "./format";
import type { FuelType } from "./types";

export const FUEL_TYPES: FuelType[] = ["A95", "E5", "DO"];

export type ManualEntry = {
  pump_id: string;
  fuel_type: FuelType;
  volume: string; // liters, up to 3 dp
  unit_price: number;
  amount: number;
  invoice_no: string | null;
};

// "12,5" / "12.500" (Vietnamese decimal comma) -> "12.500"; null if invalid.
export function parseLiters(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d{1,7}(\.\d{1,3})?$/.test(s)) return null;
  const n = Number(s);
  return n > 0 ? n.toFixed(3) : null;
}

// Amount due for a manual entry, rounded to whole đồng.
export function computeAmount(volume: string, unitPrice: number): number {
  return Math.round(Number(volume) * unitPrice);
}

export function parseManualEntry(input: Record<string, unknown>): { ok: true; value: ManualEntry } | { ok: false; error: string } {
  const pumpId = String(input.pump_id ?? "");
  if (!pumpId) return { ok: false, error: "Vui lòng chọn trụ bơm." };

  const fuel = String(input.fuel_type ?? "") as FuelType;
  if (!FUEL_TYPES.includes(fuel)) return { ok: false, error: "Vui lòng chọn loại nhiên liệu." };

  const volume = parseLiters(input.volume);
  if (!volume) return { ok: false, error: "Số lít không hợp lệ (tối đa 3 chữ số thập phân)." };

  const unitPrice = parseVnd(input.unit_price);
  if (unitPrice === null || unitPrice <= 0) return { ok: false, error: "Đơn giá không hợp lệ." };

  const amount = parseVnd(input.amount);
  if (amount === null || amount <= 0) return { ok: false, error: "Thành tiền không hợp lệ." };

  const invoice = String(input.invoice_no ?? "").trim();
  if (invoice.length > 50) return { ok: false, error: "Số hóa đơn quá dài." };

  return {
    ok: true,
    value: { pump_id: pumpId, fuel_type: fuel, volume, unit_price: unitPrice, amount, invoice_no: invoice || null },
  };
}
