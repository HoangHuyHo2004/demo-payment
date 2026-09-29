import { NextResponse, type NextRequest } from "next/server";
import { getCurrentStaff } from "@/lib/supabase/server";
import { buildDailyReport, isIsoDate } from "@/lib/report";
import { fetchReportRows } from "@/lib/report-data";

// GET /api/reports/daily?station_id=...&date=YYYY-MM-DD -> BaoCao_<code>_<date>.xlsx
export async function GET(request: NextRequest) {
  const { supabase, staff } = await getCurrentStaff();
  if (!staff?.active) return new NextResponse("Unauthorized", { status: 401 });

  const date = request.nextUrl.searchParams.get("date") ?? "";
  const stationId = request.nextUrl.searchParams.get("station_id") ?? staff.station_id ?? "";
  if (!isIsoDate(date) || !stationId) return new NextResponse("date (YYYY-MM-DD) and station_id are required", { status: 400 });

  // RLS: staff only see their own station; another station reads as not found.
  const { data: station } = await supabase.from("stations").select("name, code").eq("id", stationId).maybeSingle();
  if (!station) return new NextResponse("Not found", { status: 404 });

  const rows = await fetchReportRows(supabase, stationId, date);
  const file = await buildDailyReport({ stationName: station.name, date, rows });

  return new NextResponse(new Uint8Array(file), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="BaoCao_${station.code}_${date}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
