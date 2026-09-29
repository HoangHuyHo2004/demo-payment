import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { BankForm, PumpRow } from "./StationForms";

type Station = {
  id: string;
  name: string;
  code: string;
  bank_accounts: { bank_bin: string; account_no: string; account_name: string }[];
  pumps: { id: string; label: string; vendor_pump_id: string }[];
};

export default async function AdminStationsPage() {
  const { supabase } = await requireAdmin();
  const { data: stations } = await supabase
    .from("stations")
    .select("id, name, code, bank_accounts(bank_bin, account_no, account_name), pumps(id, label, vendor_pump_id)")
    .order("name")
    .returns<Station[]>();

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 p-4">
      <Link href="/admin" className="text-sm text-blue-600">← Quản trị</Link>
      <h1 className="text-xl font-bold">Cửa hàng, trụ &amp; tài khoản ngân hàng</h1>
      {stations?.map((s) => (
        <section key={s.id} className="flex flex-col gap-4 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
          <h2 className="font-semibold">{s.name} <span className="font-normal text-neutral-500">({s.code})</span></h2>
          <BankForm stationId={s.id} bank={s.bank_accounts[0] ?? null} />
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Trụ bơm — tên hiển thị / mã trên hệ thống quản lý</h3>
            {[...s.pumps]
              .sort((a, b) => a.label.localeCompare(b.label, "vi", { numeric: true }))
              .map((p) => <PumpRow key={p.id} pump={p} />)}
          </div>
        </section>
      ))}
    </main>
  );
}
