import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatTime } from "@/lib/format";
import { getStationSync } from "@/lib/sync-status";
import { AutoRefresh } from "@/components/AutoRefresh";

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const stations = await getStationSync(supabase);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
      <AutoRefresh />
      <Link href="/" className="text-sm text-blue-600">← Danh sách trụ</Link>
      <h1 className="text-xl font-bold">Quản trị</h1>

      <nav className="grid grid-cols-2 gap-3">
        <Link href="/admin/staff" className="rounded-xl border border-neutral-200 p-4 font-semibold dark:border-neutral-800">Nhân viên</Link>
        <Link href="/admin/stations" className="rounded-xl border border-neutral-200 p-4 font-semibold dark:border-neutral-800">Cửa hàng, trụ &amp; tài khoản NH</Link>
      </nav>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Trạng thái đồng bộ (cổng thông tin trạm)</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr><th className="py-1">Cửa hàng</th><th>Đồng bộ thành công</th><th>Giao dịch mới nhất</th><th>Lỗi gần nhất</th></tr>
          </thead>
          <tbody>
            {stations.map((s) => (
              <tr key={s.station_id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                <td className="py-2 font-medium">{s.station_name}</td>
                <td className={s.stale ? "font-semibold text-red-700" : "text-green-700"}>
                  {s.last_success_at
                    ? `${formatTime(s.last_success_at)} (${s.ageSeconds! < 120 ? `${s.ageSeconds} giây` : `${Math.round(s.ageSeconds! / 60)} phút`} trước)`
                    : "Chưa có"}
                  {s.stale && " — mất kết nối"}
                </td>
                <td>{s.last_fueled_at ? formatTime(s.last_fueled_at) : "—"}</td>
                <td className="text-red-700">{s.last_error ?? <span className="text-green-700">OK</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
