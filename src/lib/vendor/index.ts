import { MockVendorClient } from "./mock";
import type { VendorClient } from "./types";

export function getVendorClient(): VendorClient {
  const mode = process.env.VENDOR_MODE;
  if (mode === "mock") {
    // On Vercel, use the production domain: per-deployment URLs (VERCEL_URL)
    // sit behind Deployment Protection and would reject the server's own call.
    const base =
      process.env.VENDOR_BASE_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000");
    return new MockVendorClient(base);
  }
  // HttpVendorClient arrives with the real vendor API docs (PLAN.md section 11).
  throw new Error(`Unsupported VENDOR_MODE: ${mode ?? "(unset)"}`);
}
