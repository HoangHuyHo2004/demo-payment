"use client";

import { useActionState } from "react";
import { createStaff, updateStaff, type FormState } from "./actions";

type Station = { id: string; name: string };
type Staff = { id: string; full_name: string; role: "staff" | "admin"; station_id: string | null; active: boolean; email: string | null };

const initial: FormState = { error: null };
const field = "rounded-lg border border-neutral-300 px-3 py-2 text-base dark:border-neutral-700 dark:bg-neutral-900";

function Assignment({ stations, role, stationId }: { stations: Station[]; role?: string; stationId?: string | null }) {
  return (
    <>
      <select name="role" defaultValue={role ?? "staff"} className={field} aria-label="Vai trò">
        <option value="staff">Nhân viên</option>
        <option value="admin">Quản trị</option>
      </select>
      <select name="station_id" defaultValue={stationId ?? ""} className={field} aria-label="Cửa hàng">
        <option value="">— Không gán —</option>
        {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </>
  );
}

function Message({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="text-sm text-red-600">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-green-700">{state.ok}</p>;
  return null;
}

export function CreateStaffForm({ stations }: { stations: Station[] }) {
  const [state, action, pending] = useActionState(createStaff, initial);
  return (
    <form action={action} className="flex flex-col gap-2 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Thêm nhân viên</h2>
      <input name="full_name" placeholder="Họ tên" required className={field} />
      <input name="email" type="email" placeholder="Email đăng nhập" required autoComplete="off" className={field} />
      <input name="password" type="password" placeholder="Mật khẩu ban đầu (≥ 8 ký tự)" required minLength={8} autoComplete="new-password" className={field} />
      <div className="grid grid-cols-2 gap-2"><Assignment stations={stations} /></div>
      <Message state={state} />
      <button type="submit" disabled={pending} className="rounded-lg bg-blue-600 py-3 font-semibold text-white disabled:opacity-60">
        {pending ? "Đang tạo…" : "Tạo tài khoản"}
      </button>
    </form>
  );
}

export function StaffRow({ staff, stations, isMe }: { staff: Staff; stations: Station[]; isMe: boolean }) {
  const [state, action, pending] = useActionState(updateStaff.bind(null, staff.id), initial);
  return (
    <form action={action} className={`flex flex-col gap-2 rounded-xl border p-3 ${staff.active ? "border-neutral-200 dark:border-neutral-800" : "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold">{staff.full_name}{isMe && " (bạn)"}</span>
        <span className="truncate text-xs text-neutral-500">{staff.email}</span>
      </div>
      <div className="grid grid-cols-2 gap-2"><Assignment stations={stations} role={staff.role} stationId={staff.station_id} /></div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="active" defaultChecked={staff.active} className="h-5 w-5" /> Đang hoạt động
        </label>
        <button type="submit" disabled={pending} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-700">
          {pending ? "Đang lưu…" : "Lưu"}
        </button>
      </div>
      <Message state={state} />
    </form>
  );
}
