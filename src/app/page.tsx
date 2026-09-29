import Link from "next/link";
import { getCurrentStaff } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

type PumpRow = {
  id: string;
  station_id: string;
  label: string;
  vendor_pump_id: string;
  unpaid_count: number;
};

export default async function Home() {
  const { supabase, staff } = await getCurrentStaff();

  if (!staff || !staff.active) {
    return (
      <Shell title="Không có quyền truy cập">
        <p className="text-neutral-600 dark:text-neutral-400">
          {staff ? "Tài khoản đã bị khóa." : "Tài khoản chưa được gán cho cửa hàng nào."} Vui lòng liên hệ quản trị viên.
        </p>
      </Shell>
    );
  }

  // RLS limits both queries to the staff member's station (admins see all).
  const [{ data: stations }, { data: pumps }] = await Promise.all([
    supabase.from("stations").select("id, name").order("name"),
    supabase.from("pump_list").select("id, station_id, label, vendor_pump_id, unpaid_count"),
  ]);

  const byStation = (stations ?? []).map((s) => ({
    ...s,
    pumps: ((pumps ?? []) as PumpRow[])
      .filter((p) => p.station_id === s.id)
      .sort((a, b) => a.vendor_pump_id.localeCompare(b.vendor_pump_id, undefined, { numeric: true })),
  }));

  return (
    <Shell title={staff.role === "admin" ? "Tất cả cửa hàng" : (byStation[0]?.name ?? "Trụ bơm")} name={staff.full_name}>
      {byStation.map((s) => (
        <section key={s.id} className="flex flex-col gap-3">
          {staff.role === "admin" && <h2 className="text-lg font-semibold">{s.name}</h2>}
          <ul className="grid grid-cols-2 gap-3">
            {s.pumps.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/pumps/${p.id}`}
                  className="flex flex-col gap-1 rounded-xl border border-neutral-200 p-4 active:bg-neutral-100 dark:border-neutral-800 dark:active:bg-neutral-900"
                >
                  <span className="text-lg font-semibold">{p.label}</span>
                  {p.unpaid_count > 0 ? (
                    <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
                      {p.unpaid_count} chưa thanh toán
                    </span>
                  ) : (
                    <span className="text-sm text-neutral-500">Không có giao dịch chờ</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Shell>
  );
}

function Shell({ title, name, children }: { title: string; name?: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          {name && <p className="text-sm text-neutral-500">{name}</p>}
        </div>
        <form action={signOut}>
          <button type="submit" className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700">
            Đăng xuất
          </button>
        </form>
      </header>
      {children}
    </main>
  );
}
