import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentStaff } from "@/lib/supabase/server";

// Placeholder: the transaction list and payment flow arrive in Phases 3–4.
export default async function PumpPage({ params }: PageProps<"/pumps/[id]">) {
  const { id } = await params;
  const { supabase } = await getCurrentStaff();
  // RLS returns nothing for another station's pump.
  const { data: pump } = await supabase.from("pumps").select("label").eq("id", id).maybeSingle();
  if (!pump) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 p-4">
      <Link href="/" className="text-sm text-blue-600">← Danh sách trụ</Link>
      <h1 className="text-xl font-bold">{pump.label}</h1>
      <p className="text-neutral-500">Chưa có giao dịch.</p>
    </main>
  );
}
