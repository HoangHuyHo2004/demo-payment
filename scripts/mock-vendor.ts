// Generates realistic mock vendor transactions across 2 stations x 8 pumps.
// Usage:
//   npm run mock:vendor                 one new transaction every 10 s (Ctrl+C to stop)
//   npm run mock:vendor -- --every 3    one every 3 s
//   npm run mock:vendor -- --count 20   insert 20 now and exit
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");

const STATIONS = [
  { id: "00000000-0000-0000-0000-00000000000a", code: "1" },
  { id: "00000000-0000-0000-0000-00000000000b", code: "2" },
];
// Mock-only list prices (VND/liter); real prices come from the vendor.
const FUELS = [
  { fuel_type: "A95", unit_price: 20_650 },
  { fuel_type: "E5", unit_price: 19_750 },
  { fuel_type: "DO", unit_price: 18_870 },
] as const;

const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];

function makeTransaction() {
  const station = pick(STATIONS);
  const fuel = pick(FUELS);
  // Customers usually buy a round amount of money or fill up a few liters.
  const byMoney = Math.random() < 0.6;
  let volume: number;
  let amount: number;
  if (byMoney) {
    amount = pick([20_000, 30_000, 50_000, 100_000, 150_000, 200_000, 500_000]);
    volume = Math.round((amount / fuel.unit_price) * 1000) / 1000;
  } else {
    volume = Math.round((1 + Math.random() * 59) * 1000) / 1000;
    amount = Math.round(volume * fuel.unit_price);
  }
  const now = new Date();
  return {
    station_id: station.id,
    vendor_pump_id: `P${1 + Math.floor(Math.random() * 8)}`,
    fuel_type: fuel.fuel_type,
    volume: volume.toFixed(3),
    unit_price: fuel.unit_price,
    amount,
    fueled_at: now.toISOString(),
    invoice_no: `HD${station.code}${now.getTime().toString(36).toUpperCase()}${Math.floor(Math.random() * 36 ** 2).toString(36).toUpperCase()}`,
  };
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

async function insert(n: number) {
  const rows = Array.from({ length: n }, makeTransaction);
  const { error } = await supabase.from("mock_vendor_transactions").insert(rows);
  if (error) throw error;
  for (const r of rows) {
    console.log(`${r.invoice_no}  CH${r.station_id.endsWith("a") ? 1 : 2} ${r.vendor_pump_id}  ${r.fuel_type}  ${r.volume} L  ${r.amount.toLocaleString("vi-VN")} đ`);
  }
}

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? Number(args[i + 1]) : undefined;
};

const count = arg("--count");
if (count) {
  await insert(count);
} else {
  const every = arg("--every") ?? 10;
  console.log(`Generating one transaction every ${every} s. Ctrl+C to stop.`);
  await insert(1);
  setInterval(() => insert(1).catch((e) => console.error(e)), every * 1000);
}
