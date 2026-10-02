import { describe, expect, it } from "vitest";
import { isStale, STALE_AFTER_MS } from "@/lib/sync-status";

const now = Date.parse("2026-10-02T03:00:00.000Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("isStale (30 s rule for the 'Mất kết nối dữ liệu trạm' banner)", () => {
  it("is fresh up to 30 s after the last successful sync", () => {
    expect(STALE_AFTER_MS).toBe(30_000);
    expect(isStale(ago(5_000), now)).toBe(false);
    expect(isStale(ago(30_000), now)).toBe(false);
  });
  it("is stale after 30 s, or when there has never been a successful sync", () => {
    expect(isStale(ago(30_001), now)).toBe(true);
    expect(isStale(ago(600_000), now)).toBe(true);
    expect(isStale(null, now)).toBe(true);
  });
});
