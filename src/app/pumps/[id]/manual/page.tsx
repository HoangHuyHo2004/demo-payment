import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/supabase/server";
import { ManualForm } from "./ManualForm";

// Fallback when the pump-to-vendor connection fails (PLAN.md §7).
export default async function ManualEntryPage({ params }: PageProps<"/pumps/[id]/manual">) {
  const { id } = await params;
  const { supabase } = await getCurrentStaff();

  const { data: pump } = await supabase.from("pumps").select("station_id, label").eq("id", id).maybeSingle();
  if (!pump) notFound();
  const { data: pumps } = await supabase
    .from("pumps")
    .select("id, label, vendor_pump_id")
    .eq("station_id", pump.station_id);
  const sorted = (pumps ?? []).sort((a, b) => a.vendor_pump_id.localeCompare(b.vendor_pump_id, undefined, { numeric: true }));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <Link href={`/pumps/${id}`} className="text-sm text-blue-600">← {pump.label}</Link>
      <h1 className="text-xl font-bold">Nhập tay giao dịch</h1>
      <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-800 dark:bg-orange-950 dark:text-orange-200">
        Chỉ dùng khi trụ bơm mất kết nối với hệ thống. Giao dịch sẽ được đánh dấu <strong>NHẬP TAY</strong> trong danh sách và báo cáo.
      </p>
      <ManualForm pumps={sorted} defaultPumpId={id} />
    </main>
  );
}
