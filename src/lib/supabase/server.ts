import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

// Supabase client bound to the logged-in user's session (RLS applies).
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component: cookies are read-only there.
            // The proxy refreshes the session instead.
          }
        },
      },
    },
  );
}

export type StaffProfile = {
  id: string;
  full_name: string;
  role: "staff" | "admin";
  station_id: string | null;
  active: boolean;
};

// Current user + staff row, or null when not logged in / no staff row.
export async function getCurrentStaff() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, staff: null };
  const { data: staff } = await supabase
    .from("staff")
    .select("id, full_name, role, station_id, active")
    .eq("id", user.id)
    .maybeSingle<StaffProfile>();
  return { supabase, staff };
}
