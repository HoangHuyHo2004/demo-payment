// Vendor portal integration. Read-only: clients log in, navigate and read. They
// never click, submit or change anything in the portal beyond the login itself.
// The worker depends only on VendorClient; VENDOR_MODE picks the implementation.

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
  close(): Promise<void>;
}

// The portal asked for a CAPTCHA or OTP. We never try to bypass it: the worker
// stops polling that station and reports the problem.
export class PortalChallengeError extends Error {
  constructor(kind: "CAPTCHA" | "OTP") {
    super(`Cổng thông tin yêu cầu ${kind} khi đăng nhập. Cần xử lý thủ công.`);
    this.name = "PortalChallengeError";
  }
}

export class PortalLoginError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortalLoginError";
  }
}

export type PortalAccount = { station_id: string; username: string; password: string };
