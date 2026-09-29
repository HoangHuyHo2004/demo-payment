import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { formatTime } from "@/lib/format";

type SyncRow = { last_run_at: string | null; last_fueled_at: string | null; last_error: string | null };

// Data step (outside render): sync status per station, with minutes since the last run.
async function loadSyncStatus(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"]) {
  const { data } = await supabase
    .from("stations")
    .select("id, name, code, sync_state(last_run_at, last_fueled_at, last_error)")
    .order("name")
    .returns<{ id: string; name: string; code: string; sync_state: SyncRow | null }[]>();
  const now = Date.now();
  return (data ?? []).map((s) => ({
    ...s,
    ageMin: s.sync_state?.last_run_at ? Math.round((now - Date.parse(s.sync_state.last_run_at)) / 60000) : null,
  }));
}

export default async function AdminHome() {
  const { supabase } = await requireAdmin();
  const stations = await loadSyncStatus(supabase);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 p-4">
      <Link href="/" className="text-sm text-blue-600">← Danh sách trụ</Link>
      <h1 className="text-xl font-bold">Quản trị</h1>

      <nav className="grid grid-cols-2 gap-3">
        <Link href="/admin/staff" className="rounded-xl border border-neutral-200 p-4 font-semibold dark:border-neutral-800">Nhân viên</Link>
        <Link href="/admin/stations" className="rounded-xl border border-neutral-200 p-4 font-semibold dark:border-neutral-800">Cửa hàng, trụ &amp; tài khoản NH</Link>
      </nav>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">Trạng thái đồng bộ</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-neutral-500">
            <tr><th className="py-1">Cửa hàng</th><th>Lần chạy cuối</th><th>Giao dịch mới nhất</th><th>Lỗi</th></tr>
          </thead>
          <tbody>
            {stations.map((s) => {
              const st = s.sync_state;
              const ageMin = s.ageMin;
              return (
                <tr key={s.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="py-2 font-medium">{s.name} <span className="text-neutral-500">({s.code})</span></td>
                  <td className={ageMin !== null && ageMin > 5 ? "text-amber-700" : ""}>
                    {st?.last_run_at ? `${formatTime(st.last_run_at)} (${ageMin} phút trước)` : "Chưa chạy"}
                  </td>
                  <td>{st?.last_fueled_at ? formatTime(st.last_fueled_at) : "—"}</td>
                  <td className="text-red-700">{st?.last_error ?? <span className="text-green-700">OK</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
