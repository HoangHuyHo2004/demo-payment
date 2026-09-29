import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { VendorTransaction } from "@/lib/vendor/types";

// Stand-in for the vendor API. Only exists when VENDOR_MODE=mock.
export async function GET(request: NextRequest) {
  if (process.env.VENDOR_MODE !== "mock") return new NextResponse(null, { status: 404 });

  const stationId = request.nextUrl.searchParams.get("station_id");
  const since = request.nextUrl.searchParams.get("since");
  if (!stationId || !since || Number.isNaN(Date.parse(since))) {
    return NextResponse.json({ error: "station_id and since (ISO 8601) are required" }, { status: 400 });
  }

  const { data, error } = await createAdminClient()
    .from("mock_vendor_transactions")
    .select("vendor_pump_id, fuel_type, volume, unit_price, amount, fueled_at, invoice_no")
    .eq("station_id", stationId)
    .gt("fueled_at", new Date(since).toISOString())
    .order("fueled_at")
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const transactions: VendorTransaction[] = data.map((r) => ({ ...r, volume: String(r.volume) }));
  return NextResponse.json({ transactions });
}
