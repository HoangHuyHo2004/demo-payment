import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { getCurrentStaff } from "@/lib/supabase/server";
import { formatLiters, formatTime, formatVnd, paymentStatusLabel } from "@/lib/format";
import { buildVietQrPayload } from "@/lib/vietqr";
import { PendingQrActions, UnpaidActions } from "./PaymentForms";

type Payment = {
  id: string;
  method: "cash" | "qr";
  status: "pending" | "confirmed";
  cash_amount: number | null;
  qr_ref: string | null;
  confirmed_at: string | null;
  confirmer: { full_name: string } | null;
};

export default async function TransactionPage({ params }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  const { supabase } = await getCurrentStaff();

  // RLS: another station's transaction simply isn't found.
  const { data: tx } = await supabase
    .from("transactions")
    .select("id, station_id, pump_id, invoice_no, fuel_type, volume, unit_price, amount, fueled_at, source, pumps(label)")
    .eq("id", id)
    .maybeSingle<{
      id: string; station_id: string; pump_id: string; invoice_no: string | null; fuel_type: string;
      volume: string; unit_price: number; amount: number; fueled_at: string; source: "vendor" | "manual";
      pumps: { label: string } | null;
    }>();
  if (!tx) notFound();

  const [{ data: payment }, { data: bank }] = await Promise.all([
    supabase
      .from("payments")
      .select("id, method, status, cash_amount, qr_ref, confirmed_at, confirmer:staff!payments_confirmed_by_fkey(full_name)")
      .eq("transaction_id", id)
      .maybeSingle<Payment>(),
    supabase.from("bank_accounts").select("bank_bin, account_no, account_name").eq("station_id", tx.station_id).limit(1).maybeSingle(),
  ]);

  const pendingQr = payment?.method === "qr" && payment.status === "pending" ? payment : null;
  const qrImage =
    pendingQr && bank && pendingQr.qr_ref
      ? await QRCode.toDataURL(
          buildVietQrPayload({ bankBin: bank.bank_bin, accountNo: bank.account_no, amount: tx.amount, description: pendingQr.qr_ref }),
          { errorCorrectionLevel: "M", margin: 2, width: 720 },
        )
      : null;

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <Link href={`/pumps/${tx.pump_id}`} className="text-sm text-blue-600">← {tx.pumps?.label ?? "Trụ bơm"}</Link>

      {pendingQr && qrImage && bank ? (
        // Full-screen QR for the customer to scan.
        <section className="flex flex-col items-center gap-3 text-center">
          <p className="text-sm text-neutral-500">Quét mã để chuyển khoản</p>
          <p className="text-4xl font-bold">{formatVnd(tx.amount)}</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL generated server-side */}
          <img src={qrImage} alt={`Mã VietQR ${formatVnd(tx.amount)}`} className="aspect-square w-full max-w-sm rounded-xl bg-white" />
          <dl className="w-full rounded-xl bg-neutral-100 p-3 text-left text-sm dark:bg-neutral-900">
            <div className="flex justify-between"><dt>Chủ tài khoản</dt><dd className="font-semibold">{bank.account_name}</dd></div>
            <div className="flex justify-between"><dt>Số tài khoản</dt><dd className="font-mono">{bank.account_no}</dd></div>
            <div className="flex justify-between"><dt>Nội dung</dt><dd className="font-mono font-semibold">{pendingQr.qr_ref}</dd></div>
          </dl>
          <div className="w-full">
            <PendingQrActions txId={tx.id} paymentId={pendingQr.id} amountDue={tx.amount} />
          </div>
        </section>
      ) : (
        <>
          <section className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <p className="text-3xl font-bold">{formatVnd(tx.amount)}</p>
            <p className="mt-1 text-neutral-600 dark:text-neutral-400">
              {tx.fuel_type} · {formatLiters(tx.volume)} × {formatVnd(tx.unit_price)}/L
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              {tx.invoice_no ? `HĐ ${tx.invoice_no}` : "Không có số HĐ"} · {formatTime(tx.fueled_at)}
              {tx.source === "manual" && <span className="ml-2 font-semibold text-orange-600">NHẬP TAY</span>}
            </p>
            <p className="mt-3 font-semibold">{paymentStatusLabel(payment ?? null)}</p>
            {payment?.status === "confirmed" && (
              <p className="text-sm text-neutral-500">
                {payment.method === "cash" && payment.cash_amount !== null && `Nhận ${formatVnd(payment.cash_amount)} · `}
                {payment.confirmer?.full_name} · {payment.confirmed_at && formatTime(payment.confirmed_at)}
              </p>
            )}
          </section>

          {!payment && <UnpaidActions txId={tx.id} amountDue={tx.amount} qrAvailable={Boolean(bank)} />}
          {pendingQr && !bank && (
            <p className="text-sm text-amber-700">Chưa cấu hình tài khoản ngân hàng cho cửa hàng này.</p>
          )}
        </>
      )}
    </main>
  );
}
