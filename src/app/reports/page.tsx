import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/supabase/server";
import { vnToday } from "@/lib/report";

const field = "rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900";

export default async function ReportsPage() {
  const { supabase, staff } = await getCurrentStaff();
  if (!staff?.active) redirect("/");

  // RLS: staff get only their own station; admins get all.
  const { data: stations } = await supabase.from("stations").select("id, name").order("name");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm text-blue-600">← Danh sách trụ</Link>
      <h1 className="text-xl font-bold">Báo cáo ngày</h1>
      {/* Plain GET form: the browser downloads the .xlsx from the route handler. */}
      <form action="/api/reports/daily" method="get" className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Cửa hàng
          <select name="station_id" defaultValue={staff.station_id ?? stations?.[0]?.id} className={field}>
            {stations?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Ngày (giờ Việt Nam)
          <input type="date" name="date" required defaultValue={vnToday()} max={vnToday()} className={field} />
        </label>
        <button type="submit" className="rounded-xl bg-blue-600 py-4 text-lg font-semibold text-white">
          Tải báo cáo Excel
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        Sheet 1: tổng hợp sản lượng và doanh thu theo nhiên liệu (tiền mặt / QR / chưa thu). Sheet 2: chi tiết từng giao dịch.
      </p>
    </main>
  );
}
