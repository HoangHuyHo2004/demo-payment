// Phase 5: manual entry permissions, as real staff users against .env.local's project.
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
const STATION_2 = "00000000-0000-0000-0000-00000000000b";
const PREFIX = `MTEST${Date.now().toString(36).toUpperCase()}`;

let admin: SupabaseClient;
let staff1: SupabaseClient;
let pump1: string;
let pump2: string;

const row = (over: Record<string, unknown>) => ({
  station_id: STATION_1, pump_id: pump1, fuel_type: "DO", volume: "10.000",
  unit_price: 18870, amount: 188700, fueled_at: new Date().toISOString(), source: "manual", ...over,
});

describe.skipIf(!configured)("manual entry permissions", () => {
  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    staff1 = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error } = await staff1.auth.signInWithPassword({ email: "staff1@petrol.test", password: password! });
    if (error) throw error;
    const { data } = await admin.from("pumps").select("id, station_id").eq("vendor_pump_id", "P8");
    pump1 = data!.find((p) => p.station_id === STATION_1)!.id;
    pump2 = data!.find((p) => p.station_id === STATION_2)!.id;
  });

  afterAll(async () => {
    await admin.from("transactions").delete().like("invoice_no", `${PREFIX}%`);
    await admin.from("transactions").delete().eq("pump_id", pump1).eq("source", "manual").eq("amount", 188700);
  });

  it("staff can add a manual row without an invoice number, flagged manual", async () => {
    const { data, error } = await staff1.from("transactions").insert(row({})).select("source, invoice_no, synced_at").single();
    expect(error).toBeNull();
    expect(data).toEqual({ source: "manual", invoice_no: null, synced_at: null });
  });

  it("staff can add a manual row with an optional invoice number", async () => {
    const { error } = await staff1.from("transactions").insert(row({ invoice_no: `${PREFIX}-1` }));
    expect(error).toBeNull();
  });

  it("staff cannot insert rows posing as vendor data", async () => {
    const { error } = await staff1.from("transactions").insert(row({ source: "vendor", invoice_no: `${PREFIX}-V` }));
    expect(error?.code).toBe("42501");
  });

  it("staff cannot add a manual row for another station", async () => {
    const { error } = await staff1.from("transactions").insert(row({ station_id: STATION_2, pump_id: pump2, invoice_no: `${PREFIX}-B` }));
    expect(error?.code).toBe("42501");
  });

  it("staff cannot edit transactions (vendor data stays unchanged)", async () => {
    const { data: tx } = await admin.from("transactions").select("id, amount").eq("invoice_no", `${PREFIX}-1`).single();
    const { data } = await staff1.from("transactions").update({ amount: 1 }).eq("id", tx!.id).select("id");
    expect(data).toEqual([]);
    const { data: after } = await admin.from("transactions").select("amount").eq("id", tx!.id).single();
    expect(after?.amount).toBe(tx!.amount);
  });
});
