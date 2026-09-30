// Creates the dev staff accounts (1 admin, 1 staff per station). Idempotent.
// Usage: npm run seed:users   (reads .env.local; run supabase/seed.sql first)
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.SEED_PASSWORD;
if (!url || !serviceKey || !password) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and SEED_PASSWORD in .env.local");
}

const STATION_1 = "00000000-0000-0000-0000-00000000000a";
const STATION_2 = "00000000-0000-0000-0000-00000000000b";

const users = [
  { email: "admin@petrol.test", full_name: "Quản trị viên", role: "admin", station_id: null },
  { email: "staff1@petrol.test", full_name: "Nhân viên CH1", role: "staff", station_id: STATION_1 },
  { email: "staff2@petrol.test", full_name: "Nhân viên CH2", role: "staff", station_id: STATION_2 },
] as const;

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

const { data: list, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
if (listError) throw listError;

for (const u of users) {
  let id = list.users.find((x) => x.email === u.email)?.id;
  if (!id) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    id = data.user.id;
  } else {
    // Keep dev logins in sync with SEED_PASSWORD when it changes.
    const { error } = await supabase.auth.admin.updateUserById(id, { password });
    if (error) throw error;
  }
  const { error } = await supabase
    .from("staff")
    .upsert({ id, full_name: u.full_name, role: u.role, station_id: u.station_id, active: true });
  if (error) throw error;
  console.log(`ok  ${u.email}  (${u.role})`);
}
