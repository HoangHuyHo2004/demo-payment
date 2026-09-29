// Phase 2 verification: each role sees the correct pumps.
// Integration test against the Supabase project in .env.local; needs
// `npm run seed:users` to have been run. Skipped when env is missing.
import { config } from "dotenv";
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const password = process.env.SEED_PASSWORD;
const configured = Boolean(url && anonKey && password);

const STATION_1 = "00000000-0000-0000-0000-00000000000a";
const STATION_2 = "00000000-0000-0000-0000-00000000000b";

async function pumpsFor(email: string) {
  const supabase = createClient(url!, anonKey!, { auth: { persistSession: false } });
  const { error: authError } = await supabase.auth.signInWithPassword({ email, password: password! });
  if (authError) throw authError;
  const { data, error } = await supabase.from("pump_list").select("station_id, label, unpaid_count");
  if (error) throw error;
  return data;
}

describe.skipIf(!configured)("pump list by role", () => {
  it("staff1 sees only station 1's 8 pumps", async () => {
    const pumps = await pumpsFor("staff1@petrol.test");
    expect(pumps).toHaveLength(8);
    expect(new Set(pumps.map((p) => p.station_id))).toEqual(new Set([STATION_1]));
  });

  it("staff2 sees only station 2's 8 pumps", async () => {
    const pumps = await pumpsFor("staff2@petrol.test");
    expect(pumps).toHaveLength(8);
    expect(new Set(pumps.map((p) => p.station_id))).toEqual(new Set([STATION_2]));
  });

  it("admin sees all 16 pumps across both stations", async () => {
    const pumps = await pumpsFor("admin@petrol.test");
    expect(pumps).toHaveLength(16);
    expect(new Set(pumps.map((p) => p.station_id))).toEqual(new Set([STATION_1, STATION_2]));
  });

  it("anonymous users get no pumps", async () => {
    const supabase = createClient(url!, anonKey!, { auth: { persistSession: false } });
    const { data } = await supabase.from("pump_list").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
