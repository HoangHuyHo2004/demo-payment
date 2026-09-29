"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";

export type FormState = { error: string | null; ok?: string };

export async function saveBankAccount(stationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const bank_bin = String(formData.get("bank_bin") ?? "").trim();
  const account_no = String(formData.get("account_no") ?? "").replace(/\s/g, "");
  const account_name = String(formData.get("account_name") ?? "").trim().toUpperCase();
  if (!/^\d{6}$/.test(bank_bin)) return { error: "Mã BIN ngân hàng gồm 6 chữ số (ví dụ 970436)." };
  if (!/^[0-9A-Za-z]{1,19}$/.test(account_no)) return { error: "Số tài khoản không hợp lệ." };
  if (account_name.length < 2) return { error: "Vui lòng nhập tên chủ tài khoản." };

  const { data: existing } = await supabase.from("bank_accounts").select("id").eq("station_id", stationId).limit(1).maybeSingle();
  const { error } = existing
    ? await supabase.from("bank_accounts").update({ bank_bin, account_no, account_name }).eq("id", existing.id)
    : await supabase.from("bank_accounts").insert({ station_id: stationId, bank_bin, account_no, account_name });
  if (error) return { error: `Lỗi: ${error.message}` };

  revalidatePath("/admin/stations");
  return { error: null, ok: "Đã lưu tài khoản ngân hàng." };
}

export async function savePump(pumpId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const label = String(formData.get("label") ?? "").trim();
  const vendor_pump_id = String(formData.get("vendor_pump_id") ?? "").trim();
  if (!label) return { error: "Tên trụ không được trống." };
  if (!/^[\w.-]{1,40}$/.test(vendor_pump_id)) return { error: "Mã trụ của hệ thống không hợp lệ." };

  const { error } = await supabase.from("pumps").update({ label, vendor_pump_id }).eq("id", pumpId);
  if (error) {
    return { error: error.code === "23505" ? "Mã trụ này đã được gán cho trụ khác của cửa hàng." : `Lỗi: ${error.message}` };
  }
  revalidatePath("/admin/stations");
  revalidatePath("/", "layout");
  return { error: null, ok: "Đã lưu." };
}
