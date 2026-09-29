"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const INTERVAL_MS = 5000;

// While the pump screen is open: ask the server to sync every 5 s, then
// re-render the list. Shows a warning banner when sync fails.
export function SyncPoller({ stationId, initialError }: { stationId: string; initialError: string | null }) {
  const router = useRouter();
  const [error, setError] = useState(initialError);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      const started = Date.now();
      try {
        const res = await fetch(`/api/sync?station_id=${stationId}`, { method: "POST" });
        const body = (await res.json()) as { ok: boolean; error?: string };
        setError(body.ok ? null : (body.error ?? `HTTP ${res.status}`));
      } catch {
        setError("Mất kết nối máy chủ");
      }
      if (!stopped) {
        router.refresh();
        // Fixed 5 s cadence including the sync's own duration.
        timer = setTimeout(tick, Math.max(0, INTERVAL_MS - (Date.now() - started)));
      }
    };
    tick();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [router, stationId]);

  if (!error) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      <strong>Không đồng bộ được dữ liệu trụ bơm.</strong> Danh sách có thể chưa đầy đủ. ({error})
    </div>
  );
}
