import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncStation } from "@/lib/sync";
import { getVendorClient } from "@/lib/vendor";

// Called every 5 s by an open pump screen. Syncs the caller's station
// (admins pass ?station_id=).
export async function POST(request: NextRequest) {
  const { staff } = await getCurrentStaff();
  if (!staff?.active) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const stationId =
    staff.role === "admin" ? request.nextUrl.searchParams.get("station_id") : staff.station_id;
  if (!stationId) return NextResponse.json({ ok: false, error: "station_id required" }, { status: 400 });

  const result = await syncStation(createAdminClient(), getVendorClient(), stationId);
  return NextResponse.json(result);
}
