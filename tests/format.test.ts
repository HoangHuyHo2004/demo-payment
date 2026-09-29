import { describe, expect, it } from "vitest";
import { parseVnd } from "@/lib/format";

describe("parseVnd", () => {
  it("accepts plain and thousands-grouped amounts", () => {
    expect(parseVnd("150000")).toBe(150000);
    expect(parseVnd("150.000")).toBe(150000);
    expect(parseVnd("1,042,267")).toBe(1042267);
    expect(parseVnd("100.000 đ")).toBe(100000);
  });
  it("rejects decimals, bad grouping and junk", () => {
    for (const bad of ["1.5", "15.00", "1.0000", "-5", "abc", ""]) expect(parseVnd(bad)).toBeNull();
  });
});
