import type { VendorClient, VendorTransaction } from "./types";

// Talks to our in-app mock endpoint over HTTP, the same way the real vendor
// client will, so swapping to HttpVendorClient only changes the base URL.
export class MockVendorClient implements VendorClient {
  constructor(private readonly baseUrl: string) {}

  async listTransactions(stationId: string, since: Date): Promise<VendorTransaction[]> {
    const url = new URL("/api/mock-vendor/transactions", this.baseUrl);
    url.searchParams.set("station_id", stationId);
    url.searchParams.set("since", since.toISOString());
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Mock vendor HTTP ${res.status}`);
    const body = (await res.json()) as { transactions: VendorTransaction[] };
    return body.transactions;
  }
}
