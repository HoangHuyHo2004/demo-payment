import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/supabase/server";
import { formatLiters, formatTime, formatVnd, paymentStatusLabel } from "@/lib/format";
import { SyncPoller } from "./SyncPoller";

type Payment = { method: "cash" | "qr"; status: "pending" | "confirmed" };
type Tx = {
  id: string;
  invoice_no: string | null;
  fuel_type: string;
  volume: string;
  unit_price: number;
  amount: number;
  fueled_at: string;
  source: "vendor" | "manual";
  payments: Payment | Payment[] | null;
};

const STATUS_STYLE: Record<string, string> = {
  "Chưa thanh toán": "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  "QR – chờ xác nhận": "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
};

export default async function PumpPage({ params }: PageProps<"/pumps/[id]">) {
  const { id } = await params;
  const { supabase } = await getCurrentStaff();

  // RLS returns nothing for another station's pump.
  const { data: pump } = await supabase.from("pumps").select("label, station_id").eq("id", id).maybeSingle();
  if (!pump) notFound();

  const [{ data: txs }, { data: sync }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, invoice_no, fuel_type, volume, unit_price, amount, fueled_at, source, payments(method, status)")
      .eq("pump_id", id)
      .order("fueled_at", { ascending: false })
      .limit(50)
      .returns<Tx[]>(),
    supabase.from("sync_state").select("last_error").eq("station_id", pump.station_id).maybeSingle(),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm text-blue-600">← Danh sách trụ</Link>
      <h1 className="text-xl font-bold">{pump.label}</h1>
      <SyncPoller stationId={pump.station_id} initialError={sync?.last_error ?? null} />

      {!txs?.length ? (
        <p className="text-neutral-500">Chưa có giao dịch.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {txs.map((t) => {
            const payment = Array.isArray(t.payments) ? (t.payments[0] ?? null) : t.payments;
            const status = paymentStatusLabel(payment);
            return (
              <li key={t.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-semibold">{formatVnd(t.amount)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300"}`}>
                    {status}
                  </span>
                </div>
                <div className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                  {t.fuel_type} · {formatLiters(t.volume)} × {formatVnd(t.unit_price)}/L
                </div>
                <div className="mt-1 flex justify-between text-xs text-neutral-500">
                  <span>
                    {t.invoice_no ? `HĐ ${t.invoice_no}` : "Không có số HĐ"}
                    {t.source === "manual" && <span className="ml-2 font-semibold text-orange-600">NHẬP TAY</span>}
                  </span>
                  <span>{formatTime(t.fueled_at)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
