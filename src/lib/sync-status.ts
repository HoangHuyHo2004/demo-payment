import type { SupabaseClient } from "@supabase/supabase-js";

// The portal worker syncs every 5 s. If a station's last fully successful
// sync is older than this, staff are told to use manual entry (PLAN.md §6).
export const STALE_AFTER_MS = 30_000;

export function isStale(lastSuccessAt: string | null, now: number): boolean {
  return !lastSuccessAt || now - Date.parse(lastSuccessAt) > STALE_AFTER_MS;
}

export type StationSync = {
  station_id: string;
  station_name: string;
  last_success_at: string | null;
  last_run_at: string | null;
  last_fueled_at: string | null;
  last_error: string | null;
  stale: boolean;
  ageSeconds: number | null; // since the last successful sync
};

type Row = {
  id: string;
  name: string;
  sync_state: { last_success_at: string | null; last_run_at: string | null; last_fueled_at: string | null; last_error: string | null } | null;
};

// Sync health for the stations the caller can see (RLS), optionally one station.
export async function getStationSync(supabase: SupabaseClient, stationId?: string): Promise<StationSync[]> {
  let query = supabase
    .from("stations")
    .select("id, name, sync_state(last_success_at, last_run_at, last_fueled_at, last_error)")
    .order("name");
  if (stationId) query = query.eq("id", stationId);
  const { data } = await query.returns<Row[]>();
  const now = Date.now();
  return (data ?? []).map((s) => {
    const last = s.sync_state?.last_success_at ?? null;
    return {
      station_id: s.id,
      station_name: s.name,
      last_success_at: last,
      last_run_at: s.sync_state?.last_run_at ?? null,
      last_fueled_at: s.sync_state?.last_fueled_at ?? null,
      last_error: s.sync_state?.last_error ?? null,
      stale: isStale(last, now),
      ageSeconds: last ? Math.round((now - Date.parse(last)) / 1000) : null,
    };
  });
}
