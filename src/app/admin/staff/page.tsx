import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateStaffForm, StaffRow } from "./StaffForms";

export default async function AdminStaffPage() {
  const { supabase, staff: me } = await requireAdmin();
  const [{ data: stations }, { data: staff }, { data: users }] = await Promise.all([
    supabase.from("stations").select("id, name").order("name"),
    supabase.from("staff").select("id, full_name, role, station_id, active").order("full_name"),
    // Emails live in Auth, not in public.staff; read them server-side for display only.
    createAdminClient().auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const emailById = new Map(users?.users.map((u) => [u.id, u.email ?? null]));

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <Link href="/admin" className="text-sm text-blue-600">← Quản trị</Link>
      <h1 className="text-xl font-bold">Nhân viên</h1>
      <CreateStaffForm stations={stations ?? []} />
      <div className="flex flex-col gap-2">
        {staff?.map((s) => (
          <StaffRow key={s.id} staff={{ ...s, email: emailById.get(s.id) ?? null }} stations={stations ?? []} isMe={s.id === me.id} />
        ))}
      </div>
    </main>
  );
}
