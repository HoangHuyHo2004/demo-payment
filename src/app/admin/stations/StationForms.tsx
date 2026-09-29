"use client";

import { useActionState } from "react";
import { saveBankAccount, savePump, type FormState } from "./actions";

const initial: FormState = { error: null };
const field = "min-w-0 rounded-lg border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900";

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-green-700">{state.ok}</p>;
  return null;
}

type Bank = { bank_bin: string; account_no: string; account_name: string } | null;

export function BankForm({ stationId, bank }: { stationId: string; bank: Bank }) {
  const [state, action, pending] = useActionState(saveBankAccount.bind(null, stationId), initial);
  return (
    <form action={action} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Tài khoản nhận QR</h3>
      <div className="grid grid-cols-3 gap-2">
        <input name="bank_bin" defaultValue={bank?.bank_bin} placeholder="BIN" inputMode="numeric" aria-label="Mã BIN ngân hàng" className={field} />
        <input name="account_no" defaultValue={bank?.account_no} placeholder="Số tài khoản" inputMode="numeric" aria-label="Số tài khoản" className={`${field} col-span-2`} />
      </div>
      <input name="account_name" defaultValue={bank?.account_name} placeholder="TÊN CHỦ TÀI KHOẢN" aria-label="Tên chủ tài khoản" className={field} />
      <Message state={state} />
      <button type="submit" disabled={pending} className="self-end rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {pending ? "Đang lưu…" : "Lưu tài khoản"}
      </button>
    </form>
  );
}

export function PumpRow({ pump }: { pump: { id: string; label: string; vendor_pump_id: string } }) {
  const [state, action, pending] = useActionState(savePump.bind(null, pump.id), initial);
  return (
    <form action={action} className="flex flex-col gap-1">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input name="label" defaultValue={pump.label} aria-label="Tên trụ" className={field} />
        <input name="vendor_pump_id" defaultValue={pump.vendor_pump_id} aria-label="Mã trụ trên hệ thống" className={`${field} font-mono`} />
        <button type="submit" disabled={pending} className="rounded-lg border border-neutral-300 px-3 text-sm dark:border-neutral-700">
          {pending ? "…" : "Lưu"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
