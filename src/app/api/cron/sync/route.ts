import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncStation } from "@/lib/sync";
import { getVendorClient } from "@/lib/vendor";

// Vercel Cron (vercel.json): syncs every station so data stays complete
// when no phone has the app open. Vercel sends `Authorization: Bearer $CRON_SECRET`.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 });
  }

  const db = createAdminClient();
  const { data: stations, error } = await db.from("stations").select("id");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const vendor = getVendorClient();
  const results = await Promise.all(
    stations.map(async (s) => ({ station_id: s.id as string, ...(await syncStation(db, vendor, s.id)) })),
  );
  return NextResponse.json({ ok: results.every((r) => r.ok), results });
}
