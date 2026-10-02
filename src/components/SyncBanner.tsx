import Link from "next/link";
import type { StationSync } from "@/lib/sync-status";

// Red banner when a station's last successful sync is more than 30 s old.
// `manualHref` points staff to manual entry for the pump they are on.
export function SyncBanner({ stations, manualHref, showNames }: { stations: StationSync[]; manualHref?: string; showNames?: boolean }) {
  const stale = stations.filter((s) => s.stale);
  if (!stale.length) return null;
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
      <strong>Mất kết nối dữ liệu trạm{showNames && `: ${stale.map((s) => s.station_name).join(", ")}`}.</strong>{" "}
      Giao dịch mới có thể chưa hiện.{" "}
      {manualHref ? (
        <Link href={manualHref} className="font-semibold underline">Nhập tay giao dịch</Link>
      ) : (
        <>Mở trụ bơm và chọn <span className="font-semibold">Nhập tay giao dịch</span>.</>
      )}
    </div>
  );
}
