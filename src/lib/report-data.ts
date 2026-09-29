import type { SupabaseClient } from "@supabase/supabase-js";
import { vnDayRangeUtc, type ReportRow } from "./report";

type Raw = Omit<ReportRow, "pump_label" | "payment"> & {
  pumps: { label: string } | null;
  payments:
    | { method: "cash" | "qr"; status: "pending" | "confirmed"; cash_amount: number | null; confirmer: { full_name: string } | null }
    | null;
};

// All of a station's transactions for one Vietnam business day. With the
// user's client, RLS limits staff to their own station.
export async function fetchReportRows(db: SupabaseClient, stationId: string, date: string): Promise<ReportRow[]> {
  const { from, to } = vnDayRangeUtc(date);
  const rows: ReportRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await db
      .from("transactions")
      .select(
        "fueled_at, invoice_no, fuel_type, volume, unit_price, amount, source, pumps(label), payments(method, status, cash_amount, confirmer:staff!payments_confirmed_by_fkey(full_name))",
      )
      .eq("station_id", stationId)
      .gte("fueled_at", from)
      .lt("fueled_at", to)
      .order("fueled_at")
      .order("id")
      .range(offset, offset + PAGE - 1)
      .returns<Raw[]>();
    if (error) throw error;
    for (const r of data) {
      const p = r.payments;
      rows.push({
        fueled_at: r.fueled_at,
        pump_label: r.pumps?.label ?? "",
        invoice_no: r.invoice_no,
        fuel_type: r.fuel_type,
        volume: String(r.volume),
        unit_price: r.unit_price,
        amount: r.amount,
        source: r.source,
        payment: p ? { method: p.method, status: p.status, cash_amount: p.cash_amount, confirmed_by_name: p.confirmer?.full_name ?? null } : null,
      });
    }
    if (data.length < PAGE) return rows;
  }
}
