"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export type FormState = { error: string | null; ok?: string };

const ROLES = ["staff", "admin"] as const;
type Role = (typeof ROLES)[number];

function readAssignment(formData: FormData): { role: Role; station_id: string | null } | string {
  const role = String(formData.get("role") ?? "") as Role;
  if (!ROLES.includes(role)) return "Vai trò không hợp lệ.";
  const station = String(formData.get("station_id") ?? "") || null;
  if (role === "staff" && !station) return "Nhân viên phải được gán cửa hàng.";
  return { role, station_id: station };
}

export async function createStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireAdmin();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const assignment = readAssignment(formData);
  if (typeof assignment === "string") return { error: assignment };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Email không hợp lệ." };
  if (fullName.length < 2) return { error: "Vui lòng nhập họ tên." };
  if (password.length < 8) return { error: "Mật khẩu ban đầu phải có ít nhất 8 ký tự." };

  // Creating a login needs the Auth admin API (service role); the caller is verified admin above.
  const { data, error } = await createAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) return { error: error.message.includes("already") ? "Email này đã có tài khoản." : `Lỗi: ${error.message}` };

  // The staff row goes through the admin's own session, so RLS applies.
  const { error: staffError } = await supabase
    .from("staff")
    .insert({ id: data.user.id, full_name: fullName, ...assignment, active: true });
  if (staffError) {
    await createAdminClient().auth.admin.deleteUser(data.user.id); // don't leave an orphan login
    return { error: `Lỗi: ${staffError.message}` };
  }

  revalidatePath("/admin/staff");
  return { error: null, ok: `Đã tạo tài khoản ${email}.` };
}

export async function updateStaff(staffId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, staff: me } = await requireAdmin();
  const assignment = readAssignment(formData);
  if (typeof assignment === "string") return { error: assignment };
  const active = formData.get("active") === "on";

  if (staffId === me.id && (!active || assignment.role !== "admin")) {
    return { error: "Không thể tự khóa hoặc tự bỏ quyền quản trị của chính mình." };
  }

  const { error } = await supabase.from("staff").update({ ...assignment, active }).eq("id", staffId);
  if (error) return { error: `Lỗi: ${error.message}` };
  revalidatePath("/admin/staff");
  return { error: null, ok: "Đã lưu." };
}
