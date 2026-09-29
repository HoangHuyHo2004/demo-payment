// Phase 7: admin-only operations, as real users against .env.local's project.
import { config } from "dotenv";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
const configured = Boolean(url && anon && service && password);

const STATION_1 = "00000000-0000-0000-0000-00000000000a";
const PREFIX = `ATEST${Date.now().toString(36).toUpperCase()}`;

let svc: SupabaseClient;
let admin: SupabaseClient;
let staff1: SupabaseClient;
let adminId: string;
let staff1Id: string;
let txId: string;

async function signIn(email: string) {
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: password! });
  if (error) throw error;
  return { c, id: data.user.id };
}

describe.skipIf(!configured)("admin operations", () => {
  beforeAll(async () => {
    svc = createClient(url!, service!, { auth: { persistSession: false } });
    ({ c: admin, id: adminId } = await signIn("admin@petrol.test"));
    ({ c: staff1, id: staff1Id } = await signIn("staff1@petrol.test"));
    const { data: pump } = await svc.from("pumps").select("id").eq("station_id", STATION_1).eq("vendor_pump_id", "P7").single();
    const { data, error } = await svc.from("transactions").insert({
      station_id: STATION_1, pump_id: pump!.id, invoice_no: `${PREFIX}-1`, fuel_type: "A95",
      volume: "5.000", unit_price: 20650, amount: 103250, fueled_at: new Date().toISOString(), source: "vendor",
    }).select("id").single();
    if (error) throw error;
    txId = data.id;
    const { error: payError } = await staff1.from("payments").insert({
      transaction_id: txId, method: "cash", status: "confirmed", cash_amount: 103250,
      confirmed_by: staff1Id, confirmed_at: new Date().toISOString(), created_by: staff1Id,
    });
    if (payError) throw payError;
  });

  afterAll(async () => {
    await svc.from("payment_reversals").delete().eq("transaction_id", txId);
    await svc.from("payments").delete().eq("transaction_id", txId);
    await svc.from("transactions").delete().eq("id", txId);
  });

  const paymentId = async () =>
    (await svc.from("payments").select("id").eq("transaction_id", txId).maybeSingle()).data?.id as string | undefined;

  it("staff cannot reverse a confirmed payment", async () => {
    const { error } = await staff1.rpc("reverse_payment", { p_payment_id: await paymentId(), p_reason: "thử" });
    expect(error?.code).toBe("42501");
    expect(await paymentId()).toBeDefined();
  });

  it("a reason is required", async () => {
    const { error } = await admin.rpc("reverse_payment", { p_payment_id: await paymentId(), p_reason: "  " });
    expect(error?.message).toContain("lý do");
  });

  it("admin reverses: payment removed, snapshot + reason + admin logged", async () => {
    const id = await paymentId();
    const { error } = await admin.rpc("reverse_payment", { p_payment_id: id, p_reason: "Khách chuyển khoản nhầm, hoàn lại" });
    expect(error).toBeNull();
    expect(await paymentId()).toBeUndefined(); // transaction is unpaid again

    const { data: log } = await admin.from("payment_reversals").select("reason, reversed_by, payment").eq("transaction_id", txId).single();
    expect(log).toMatchObject({ reason: "Khách chuyển khoản nhầm, hoàn lại", reversed_by: adminId, payment: { id, method: "cash", cash_amount: 103250 } });
  });

  it("staff cannot read or tamper with the reversal log", async () => {
    expect((await staff1.from("payment_reversals").select("id").eq("transaction_id", txId)).data).toEqual([]);
    const { data } = await admin.from("payment_reversals").update({ reason: "sửa" }).eq("transaction_id", txId).select("id");
    expect(data).toEqual([]); // append-only, even for admins
  });

  it("only admins can change bank accounts and pump mapping", async () => {
    const { data: staffEdit } = await staff1.from("bank_accounts").update({ account_no: "123" }).eq("station_id", STATION_1).select("id");
    expect(staffEdit).toEqual([]);
    const { data: pump } = await admin.from("pumps").select("id, label").eq("station_id", STATION_1).eq("vendor_pump_id", "P7").single();
    const { data: adminEdit, error } = await admin.from("pumps").update({ label: pump!.label }).eq("id", pump!.id).select("id");
    expect(error).toBeNull();
    expect(adminEdit).toHaveLength(1);
  });
});
