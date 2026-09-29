"use client";

import { useActionState, useState } from "react";
import { computeAmount, FUEL_TYPES, parseLiters } from "@/lib/manual-entry";
import { parseVnd } from "@/lib/format";
import { createManualTransaction, type ManualState } from "./actions";

const initial: ManualState = { error: null };
const vnd = new Intl.NumberFormat("vi-VN");
const field = "rounded-lg border border-neutral-300 px-3 py-3 text-base dark:border-neutral-700 dark:bg-neutral-900";

export function ManualForm({ pumps, defaultPumpId }: { pumps: { id: string; label: string }[]; defaultPumpId: string }) {
  const [state, action, pending] = useActionState(createManualTransaction, initial);
  const [volume, setVolume] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [amountEdited, setAmountEdited] = useState(false);

  // Amount follows liters × price until the staff member edits it by hand.
  const recompute = (v: string, p: string) => {
    if (amountEdited) return;
    const liters = parseLiters(v);
    const price = parseVnd(p);
    setAmount(liters && price ? vnd.format(computeAmount(liters, price)) : "");
  };

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        Trụ bơm
        <select name="pump_id" defaultValue={defaultPumpId} className={field}>
          {pumps.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </label>

      <fieldset className="flex flex-col gap-1 text-sm font-medium">
        <legend className="mb-1">Loại nhiên liệu</legend>
        <div className="grid grid-cols-3 gap-2">
          {FUEL_TYPES.map((f, i) => (
            <label key={f} className="flex items-center justify-center rounded-lg border border-neutral-300 py-3 text-base has-checked:border-blue-600 has-checked:bg-blue-50 dark:border-neutral-700 dark:has-checked:bg-blue-950">
              <input type="radio" name="fuel_type" value={f} defaultChecked={i === 0} className="sr-only" />
              {f}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Số lít
          <input name="volume" inputMode="decimal" required placeholder="0,000" value={volume}
            onChange={(e) => { setVolume(e.target.value); recompute(e.target.value, unitPrice); }} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Đơn giá (đ/L)
          <input name="unit_price" inputMode="numeric" required value={unitPrice}
            onChange={(e) => { setUnitPrice(e.target.value); recompute(volume, e.target.value); }} className={field} />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Thành tiền (đ){amountEdited && <span className="text-xs font-normal text-amber-700">đã sửa tay</span>}
        <input name="amount" inputMode="numeric" required value={amount}
          onChange={(e) => { setAmount(e.target.value); setAmountEdited(true); }}
          className={`${field} text-right text-xl font-semibold`} />
      </label>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Số hóa đơn (không bắt buộc)
        <input name="invoice_no" maxLength={50} className={field} />
      </label>

      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button type="submit" disabled={pending} className="rounded-xl bg-orange-600 py-4 text-lg font-semibold text-white disabled:opacity-60">
        {pending ? "Đang lưu…" : "Lưu giao dịch nhập tay"}
      </button>
    </form>
  );
}
