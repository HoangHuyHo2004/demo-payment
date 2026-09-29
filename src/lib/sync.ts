import type { SupabaseClient } from "@supabase/supabase-js";
import type { VendorClient, VendorTransaction } from "./vendor/types";

// Re-read this far behind the newest transaction we have, to catch rows the
// vendor publishes late. Upsert on (station_id, invoice_no) makes it idempotent.
export const SYNC_OVERLAP_MS = 10 * 60 * 1000;

export type TransactionRow = {
  station_id: string;
  pump_id: string;
  invoice_no: string;
  fuel_type: VendorTransaction["fuel_type"];
  volume: string;
  unit_price: number;
  amount: number;
  fueled_at: string;
  source: "vendor";
  synced_at: string;
};

export type SyncResult = { ok: true; fetched: number } | { ok: false; error: string };

// Pure: vendor rows -> our rows. Rows for unmapped pumps are reported, not dropped silently.
export function mapVendorTransactions(
  stationId: string,
  txs: VendorTransaction[],
  pumpIdByVendorId: Map<string, string>,
  now: Date,
): { rows: TransactionRow[]; unknownPumps: string[] } {
  const rows: TransactionRow[] = [];
  const unknown = new Set<string>();
  for (const t of txs) {
    const pumpId = pumpIdByVendorId.get(t.vendor_pump_id);
    if (!pumpId) {
      unknown.add(t.vendor_pump_id);
      continue;
    }
    rows.push({
      station_id: stationId,
      pump_id: pumpId,
      invoice_no: t.invoice_no,
      fuel_type: t.fuel_type,
      volume: t.volume,
      unit_price: t.unit_price,
      amount: t.amount,
      fueled_at: new Date(t.fueled_at).toISOString(),
      source: "vendor",
      synced_at: now.toISOString(),
    });
  }
  return { rows, unknownPumps: [...unknown].sort() };
}

// `db` must be the service-role client (writes sync_state, bypasses RLS).
export async function syncStation(
  db: SupabaseClient,
  vendor: VendorClient,
  stationId: string,
  now = new Date(),
): Promise<SyncResult> {
  const record = (patch: { last_error: string | null; last_fueled_at?: string }) =>
    db.from("sync_state").upsert({ station_id: stationId, last_run_at: now.toISOString(), ...patch });

  try {
    const [{ data: state, error: stateError }, { data: pumps, error: pumpsError }] = await Promise.all([
      db.from("sync_state").select("last_fueled_at").eq("station_id", stationId).maybeSingle(),
      db.from("pumps").select("id, vendor_pump_id").eq("station_id", stationId),
    ]);
    if (stateError) throw stateError;
    if (pumpsError) throw pumpsError;

    const last = state?.last_fueled_at ? new Date(state.last_fueled_at).getTime() : 0;
    const since = new Date(Math.max(0, last - SYNC_OVERLAP_MS));
    const txs = await vendor.listTransactions(stationId, since);

    const pumpMap = new Map(pumps.map((p) => [p.vendor_pump_id as string, p.id as string]));
    const { rows, unknownPumps } = mapVendorTransactions(stationId, txs, pumpMap, now);

    if (rows.length > 0) {
      const { error } = await db.from("transactions").upsert(rows, { onConflict: "station_id,invoice_no" });
      if (error) throw error;
    }

    const newest = rows.reduce((max, r) => Math.max(max, new Date(r.fueled_at).getTime()), last);
    const lastError = unknownPumps.length ? `Trụ chưa được ánh xạ: ${unknownPumps.join(", ")}` : null;
    await record({
      last_error: lastError,
      ...(newest > 0 ? { last_fueled_at: new Date(newest).toISOString() } : {}),
    });
    return lastError ? { ok: false, error: lastError } : { ok: true, fetched: rows.length };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await record({ last_error: message });
    return { ok: false, error: message };
  }
}
