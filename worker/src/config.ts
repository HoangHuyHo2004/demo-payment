import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { PortalAccount, VendorTransaction } from "./vendor/types.ts";

// Local dev: reuse the web app's .env.local, then worker/.env. In Docker the
// variables come from the container environment.
loadEnv({ path: ["../.env.local", ".env"], quiet: true });

export type VendorMode = "mock" | "portal_http" | "portal_scrape";

// Mock portal logins. Not secrets: they only open the fake portal.
const MOCK_ACCOUNTS: PortalAccount[] = [
  { station_id: "00000000-0000-0000-0000-00000000000a", username: "tram1", password: "mock-portal-1" },
  { station_id: "00000000-0000-0000-0000-00000000000b", username: "tram2", password: "mock-portal-2" },
];

export const MOCK_PORTAL_PORT = Number(process.env.MOCK_PORTAL_PORT ?? 4010);

export function readConfig() {
  const mode = (process.env.VENDOR_MODE ?? "") as VendorMode;
  if (!["mock", "portal_http", "portal_scrape"].includes(mode)) {
    throw new Error(`VENDOR_MODE must be mock, portal_http or portal_scrape (got "${mode}")`);
  }
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");

  let accounts: PortalAccount[];
  if (mode === "mock") {
    accounts = MOCK_ACCOUNTS;
  } else {
    // Real portal: one dedicated read-only login per station, supplied by the owner
    // as JSON in PORTAL_ACCOUNTS (never committed).
    accounts = JSON.parse(process.env.PORTAL_ACCOUNTS ?? "[]") as PortalAccount[];
    if (!accounts.length || accounts.some((a) => !a.station_id || !a.username || !a.password)) {
      throw new Error('PORTAL_ACCOUNTS must be JSON: [{"station_id":"…","username":"…","password":"…"}]');
    }
    if (!process.env.PORTAL_URL) throw new Error("PORTAL_URL is required for the real portal");
  }

  return {
    mode,
    accounts,
    // In mock mode without PORTAL_URL, main.ts starts the mock portal itself.
    portalUrl: process.env.PORTAL_URL,
    db: createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } }),
  };
}

export { MOCK_ACCOUNTS };

// The mock portal's "database": rows produced by `npm run mock:vendor` in the web app.
export function mockPortalData(db: SupabaseClient) {
  return async (stationId: string, since: Date): Promise<VendorTransaction[]> => {
    const { data, error } = await db
      .from("mock_vendor_transactions")
      .select("vendor_pump_id, fuel_type, volume, unit_price, amount, fueled_at, invoice_no")
      .eq("station_id", stationId)
      .gt("fueled_at", since.toISOString())
      .order("fueled_at")
      .limit(1000);
    if (error) throw new Error(error.message);
    return data.map((r) => ({ ...r, volume: String(r.volume) })) as VendorTransaction[];
  };
}
