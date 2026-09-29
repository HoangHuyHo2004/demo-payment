"use client";

import { useActionState, useState } from "react";
import { confirmQr, payCash, startQr, switchToCash, type ActionState } from "./actions";

const initial: ActionState = { error: null };
const vnd = new Intl.NumberFormat("vi-VN");

function CashInput({ amountDue }: { amountDue: number }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      Tiền mặt đã nhận (đ)
      <input
        name="cash_amount"
        inputMode="numeric"
        defaultValue={vnd.format(amountDue)}
        required
        className="rounded-lg border border-neutral-300 px-3 py-3 text-right text-xl font-semibold dark:border-neutral-700 dark:bg-neutral-900"
      />
    </label>
  );
}

function ErrorText({ error }: { error: string | null }) {
  return error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null;
}

const primary = "w-full rounded-xl py-4 text-lg font-semibold text-white disabled:opacity-60";

export function UnpaidActions({ txId, amountDue, qrAvailable }: { txId: string; amountDue: number; qrAvailable: boolean }) {
  const [mode, setMode] = useState<"choose" | "cash">("choose");
  const [state, action, pending] = useActionState(payCash.bind(null, txId), initial);

  if (mode === "cash") {
    return (
      <form action={action} className="flex flex-col gap-3">
        <CashInput amountDue={amountDue} />
        <ErrorText error={state.error} />
        <button type="submit" disabled={pending} className={`${primary} bg-green-600`}>
          {pending ? "Đang lưu…" : "Xác nhận đã nhận tiền mặt"}
        </button>
        <button type="button" onClick={() => setMode("choose")} className="py-2 text-sm text-neutral-500">
          Quay lại
        </button>
      </form>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      <button type="button" onClick={() => setMode("cash")} className={`${primary} bg-green-600`}>
        Tiền mặt
      </button>
      <form action={startQr.bind(null, txId)}>
        <button type="submit" disabled={!qrAvailable} className={`${primary} bg-blue-600`}>
          QR
        </button>
      </form>
      {!qrAvailable && (
        <p className="col-span-2 text-sm text-amber-700">Chưa cấu hình tài khoản ngân hàng cho cửa hàng này.</p>
      )}
    </div>
  );
}

export function PendingQrActions({ txId, paymentId, amountDue }: { txId: string; paymentId: string; amountDue: number }) {
  const [switching, setSwitching] = useState(false);
  const [confirmState, confirmAction, confirming] = useActionState(
    async () => confirmQr(txId, paymentId),
    initial,
  );
  const [cashState, cashAction, savingCash] = useActionState(switchToCash.bind(null, txId, paymentId), initial);

  if (switching) {
    return (
      <form action={cashAction} className="flex flex-col gap-3">
        <CashInput amountDue={amountDue} />
        <ErrorText error={cashState.error} />
        <button type="submit" disabled={savingCash} className={`${primary} bg-green-600`}>
          {savingCash ? "Đang lưu…" : "Xác nhận đã nhận tiền mặt"}
        </button>
        <button type="button" onClick={() => setSwitching(false)} className="py-2 text-sm text-neutral-500">
          Quay lại mã QR
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={confirmAction}>
        <button type="submit" disabled={confirming} className={`${primary} bg-green-600`}>
          {confirming ? "Đang lưu…" : "Đã nhận tiền"}
        </button>
      </form>
      <ErrorText error={confirmState.error} />
      <button type="button" onClick={() => setSwitching(true)} className="py-2 text-sm text-neutral-600 underline dark:text-neutral-400">
        Khách trả tiền mặt thay vì QR
      </button>
    </div>
  );
}
