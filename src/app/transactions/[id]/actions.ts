"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/supabase/server";
import { parseVnd } from "@/lib/format";

export type ActionState = { error: string | null };

function friendly(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Giao dịch này đã được thanh toán trên máy khác.";
  if (error.code === "42501") return error.message.startsWith("Thanh toán đã xác nhận")
    ? error.message
    : "Bạn không có quyền thực hiện thao tác này.";
  return `Lỗi: ${error.message}`;
}

async function session() {
  const { supabase, staff } = await getCurrentStaff();
  if (!staff?.active) redirect("/login");
  return { supabase, staff };
}

async function pumpIdOf(supabase: Awaited<ReturnType<typeof session>>["supabase"], txId: string) {
  const { data } = await supabase.from("transactions").select("pump_id").eq("id", txId).maybeSingle();
  return data?.pump_id as string | undefined;
}

export async function payCash(txId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, staff } = await session();
  const cash = parseVnd(formData.get("cash_amount"));
  if (cash === null) return { error: "Số tiền mặt không hợp lệ." };

  const now = new Date().toISOString();
  const { error } = await supabase.from("payments").insert({
    transaction_id: txId,
    method: "cash",
    status: "confirmed",
    cash_amount: cash,
    confirmed_by: staff.id,
    confirmed_at: now,
    created_by: staff.id,
  });
  if (error) return { error: friendly(error) };

  const pumpId = await pumpIdOf(supabase, txId);
  revalidatePath("/", "layout");
  redirect(pumpId ? `/pumps/${pumpId}` : "/");
}

export async function startQr(txId: string): Promise<void> {
  const { supabase } = await session();
  const { error } = await supabase.rpc("create_qr_payment", { tx_id: txId });
  // 23505: someone already started a payment; the page shows its current state.
  if (error && error.code !== "23505") throw new Error(friendly(error));
  revalidatePath(`/transactions/${txId}`);
}

export async function confirmQr(txId: string, paymentId: string): Promise<ActionState> {
  const { supabase, staff } = await session();
  const { data, error } = await supabase
    .from("payments")
    .update({ status: "confirmed", confirmed_by: staff.id, confirmed_at: new Date().toISOString() })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data.length) return { error: "Thanh toán này đã được xử lý." };

  const pumpId = await pumpIdOf(supabase, txId);
  revalidatePath("/", "layout");
  redirect(pumpId ? `/pumps/${pumpId}` : "/");
}

export async function switchToCash(
  txId: string,
  paymentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, staff } = await session();
  const cash = parseVnd(formData.get("cash_amount"));
  if (cash === null) return { error: "Số tiền mặt không hợp lệ." };

  const { data, error } = await supabase
    .from("payments")
    .update({
      method: "cash",
      cash_amount: cash,
      status: "confirmed",
      confirmed_by: staff.id,
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: friendly(error) };
  if (!data.length) return { error: "Thanh toán này đã được xử lý." };

  const pumpId = await pumpIdOf(supabase, txId);
  revalidatePath("/", "layout");
  redirect(pumpId ? `/pumps/${pumpId}` : "/");
}

// Admin only (checked again in the database by reverse_payment + RLS).
export async function reversePayment(
  txId: string,
  paymentId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { supabase, staff } = await session();
  if (staff.role !== "admin") return { error: "Chỉ quản trị viên được hủy thanh toán." };
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { error: "Vui lòng nhập lý do (ít nhất 3 ký tự)." };

  const { error } = await supabase.rpc("reverse_payment", { p_payment_id: paymentId, p_reason: reason });
  if (error) return { error: friendly(error) };
  revalidatePath("/", "layout");
  redirect(`/transactions/${txId}`);
}
