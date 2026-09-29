"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/lib/supabase/server";
import { parseManualEntry } from "@/lib/manual-entry";

export type ManualState = { error: string | null };

export async function createManualTransaction(_prev: ManualState, formData: FormData): Promise<ManualState> {
  const { supabase, staff } = await getCurrentStaff();
  if (!staff?.active) redirect("/login");

  const parsed = parseManualEntry(Object.fromEntries(formData));
  if (!parsed.ok) return { error: parsed.error };
  const entry = parsed.value;

  // Station comes from the pump (RLS hides other stations' pumps).
  const { data: pump } = await supabase.from("pumps").select("station_id").eq("id", entry.pump_id).maybeSingle();
  if (!pump) return { error: "Không tìm thấy trụ bơm." };

  const { data, error } = await supabase
    .from("transactions")
    .insert({
      ...entry,
      station_id: pump.station_id,
      fueled_at: new Date().toISOString(),
      source: "manual",
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Số hóa đơn này đã tồn tại ở cửa hàng." };
    if (error.code === "42501") return { error: "Bạn không có quyền nhập giao dịch cho trụ này." };
    return { error: `Lỗi: ${error.message}` };
  }

  revalidatePath("/", "layout");
  // Straight to payment for the new transaction.
  redirect(`/transactions/${data.id}`);
}
