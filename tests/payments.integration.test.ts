// Phase 4: payment rules enforced by RLS + the payments_guard trigger, exercised
// as real staff users against the Supabase project in .env.local.
// Creates its own transactions (service role) and removes them afterwards.
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
const PREFIX = `PTEST${Date.now().toString(36).toUpperCase()}`;

let admin: SupabaseClient;
let staff1: SupabaseClient;
let staff2: SupabaseClient;
let staff1Id: string;
let staff2Id: string;
const txIds: Record<string, string> = {};

async function signIn(email: string) {
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: password! });
  if (error) throw error;
  return { client: c, id: data.user.id };
}

describe.skipIf(!configured)("payment rules", () => {
  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    ({ client: staff1, id: staff1Id } = await signIn("staff1@petrol.test"));
    ({ client: staff2, id: staff2Id } = await signIn("staff2@petrol.test"));

    const { data: pump } = await admin.from("pumps").select("id").eq("station_id", STATION_1).eq("vendor_pump_id", "P8").single();
    const rows = ["cash", "qr", "switch", "other"].map((k) => ({
      station_id: STATION_1,
      pump_id: pump!.id,
      invoice_no: `${PREFIX}-${k}`,
      fuel_type: "A95",
      volume: "4.843",
      unit_price: 20650,
      amount: 100000,
      fueled_at: new Date().toISOString(),
      source: "vendor",
    }));
    const { data, error } = await admin.from("transactions").insert(rows).select("id, invoice_no");
    if (error) throw error;
    for (const r of data) txIds[r.invoice_no.split("-").pop()!] = r.id;
  });

  afterAll(async () => {
    const ids = Object.values(txIds);
    await admin.from("payments").delete().in("transaction_id", ids);
    await admin.from("transactions").delete().in("id", ids);
  });

  const now = () => new Date().toISOString();

  it("cash: staff confirms; a second payment and later edits are rejected", async () => {
    const pay = { transaction_id: txIds.cash, method: "cash", status: "confirmed", cash_amount: 100000, confirmed_by: staff1Id, confirmed_at: now(), created_by: staff1Id };
    expect((await staff1.from("payments").insert(pay)).error).toBeNull();

    expect((await staff1.from("payments").insert(pay)).error?.code).toBe("23505");

    const edit = await staff1.from("payments").update({ cash_amount: 1 }).eq("transaction_id", txIds.cash);
    expect(edit.error?.code).toBe("42501");

    await staff1.from("payments").delete().eq("transaction_id", txIds.cash);
    const { data } = await admin.from("payments").select("cash_amount").eq("transaction_id", txIds.cash).single();
    expect(data?.cash_amount).toBe(100000);
  });

  it("cash: cannot be recorded as confirmed by someone else", async () => {
    const res = await staff1.from("payments").insert({
      transaction_id: txIds.other, method: "cash", status: "confirmed", cash_amount: 100000,
      confirmed_by: staff2Id, confirmed_at: now(), created_by: staff1Id,
    });
    expect(res.error).not.toBeNull();
  });

  it("qr: cannot be inserted already confirmed", async () => {
    const res = await staff1.from("payments").insert({
      transaction_id: txIds.other, method: "qr", status: "confirmed", qr_ref: `${PREFIX}X`.slice(0, 25),
      confirmed_by: staff1Id, confirmed_at: now(), created_by: staff1Id,
    });
    expect(res.error?.code).toBe("42501");
  });

  it("qr: create pending with a valid qr_ref, then confirm manually", async () => {
    const { data: p, error } = await staff1.rpc("create_qr_payment", { tx_id: txIds.qr });
    expect(error).toBeNull();
    expect(p.status).toBe("pending");
    expect(p.qr_ref).toMatch(/^XDS1[0-9A-Z]+$/);
    expect(p.qr_ref.length).toBeLessThanOrEqual(25);

    const { data: confirmed, error: e2 } = await staff1
      .from("payments")
      .update({ status: "confirmed", confirmed_by: staff1Id, confirmed_at: now() })
      .eq("id", p.id)
      .select("status, confirmed_by")
      .single();
    expect(e2).toBeNull();
    expect(confirmed).toEqual({ status: "confirmed", confirmed_by: staff1Id });
  });

  it("qr: a pending QR can be switched to cash", async () => {
    const { data: p } = await staff1.rpc("create_qr_payment", { tx_id: txIds.switch });
    const { data, error } = await staff1
      .from("payments")
      .update({ method: "cash", cash_amount: 100000, status: "confirmed", confirmed_by: staff1Id, confirmed_at: now() })
      .eq("id", p.id)
      .select("method, status, qr_ref")
      .single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ method: "cash", status: "confirmed", qr_ref: p.qr_ref });
  });

  it("another station's staff cannot start a QR payment", async () => {
    const { error } = await staff2.rpc("create_qr_payment", { tx_id: txIds.other });
    expect(error?.message).toContain("Không tìm thấy giao dịch");
  });
});
