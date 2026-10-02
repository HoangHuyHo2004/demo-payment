import type { SupabaseClient } from "@supabase/supabase-js";
import type { VendorClient, VendorTransaction } from "./vendor/types.ts";

// Re-read this far behind the newest transaction we have, to catch rows the
// portal shows late. Upsert on (station_id, invoice_no) makes it idempotent.
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

// `fetched` counts rows read (the 10-minute window re-reads recent ones);
// `advanced` is true when something newer than before arrived.
export type SyncResult = { ok: true; fetched: number; advanced: boolean } | { ok: false; error: string };

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

// One sync run for one station. `db` is the service-role client.
// sync_state: last_run_at always; last_success_at only when the run was fully
// successful (the app shows "Mất kết nối dữ liệu trạm" when it is > 30 s old).
// Errors from the vendor client are recorded and re-thrown so the caller can
// back off or stop.
export async function syncStation(
  db: SupabaseClient,
  vendor: VendorClient,
  stationId: string,
  now = new Date(),
): Promise<SyncResult> {
  const record = async (patch: Record<string, string | null>) => {
    const { error } = await db
      .from("sync_state")
      .upsert({ station_id: stationId, last_run_at: now.toISOString(), ...patch });
    if (error) console.error(`[sync ${stationId}] cannot write sync_state: ${error.message}`);
  };

  try {
    const [{ data: state, error: stateError }, { data: pumps, error: pumpsError }] = await Promise.all([
      db.from("sync_state").select("last_fueled_at").eq("station_id", stationId).maybeSingle(),
      db.from("pumps").select("id, vendor_pump_id").eq("station_id", stationId),
    ]);
    if (stateError) throw new Error(stateError.message);
    if (pumpsError) throw new Error(pumpsError.message);

    const last = state?.last_fueled_at ? new Date(state.last_fueled_at).getTime() : 0;
    const since = new Date(Math.max(0, last - SYNC_OVERLAP_MS));
    const txs = await vendor.listTransactions(stationId, since);

    const pumpMap = new Map(pumps.map((p) => [p.vendor_pump_id as string, p.id as string]));
    const { rows, unknownPumps } = mapVendorTransactions(stationId, txs, pumpMap, now);

    if (rows.length > 0) {
      const { error } = await db.from("transactions").upsert(rows, { onConflict: "station_id,invoice_no" });
      if (error) throw new Error(error.message);
    }

    const newest = rows.reduce((max, r) => Math.max(max, new Date(r.fueled_at).getTime()), last);
    const fueled: Record<string, string> = newest > 0 ? { last_fueled_at: new Date(newest).toISOString() } : {};
    if (unknownPumps.length) {
      const error = `Trụ chưa được ánh xạ: ${unknownPumps.join(", ")}`;
      await record({ last_error: error, ...fueled });
      return { ok: false, error };
    }
    await record({ last_error: null, last_success_at: now.toISOString(), ...fueled });
    return { ok: true, fetched: rows.length, advanced: newest > last };
  } catch (e) {
    await record({ last_error: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
