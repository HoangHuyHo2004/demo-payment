// Vendor (station management system) integration. Read-only for us.
// Business code depends only on VendorClient; the concrete client is picked
// by VENDOR_MODE (see ./index.ts).

export type FuelType = "A95" | "E5" | "DO";

export type VendorTransaction = {
  vendor_pump_id: string;
  fuel_type: FuelType;
  volume: string; // liters, decimal string (up to 3 dp)
  unit_price: number; // VND per liter, integer
  amount: number; // VND, integer
  fueled_at: string; // ISO 8601 with offset
  invoice_no: string;
};

export interface VendorClient {
  // Transactions whose fueled_at is strictly after `since`.
  listTransactions(stationId: string, since: Date): Promise<VendorTransaction[]>;
}
