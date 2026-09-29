import { notFound } from "next/navigation";
import { getCurrentStaff } from "./supabase/server";

// For admin pages and server actions. Non-admins get a 404 (the pages don't exist for them).
// RLS enforces the same rules in the database; this just keeps the UI honest.
export async function requireAdmin() {
  const { supabase, staff } = await getCurrentStaff();
  if (!staff?.active || staff.role !== "admin") notFound();
  return { supabase, staff };
}
