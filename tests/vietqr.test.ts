import { describe, expect, it } from "vitest";
import { buildVietQrPayload, crc16, parseTlv, tlv } from "@/lib/vietqr";

const input = { bankBin: "970436", accountNo: "0011001234567", amount: 150000, description: "XDS11A" };

describe("crc16 (CCITT-FALSE)", () => {
  it("matches the standard check value", () => {
    expect(crc16("123456789")).toBe("29B1");
  });
  it("pads to 4 uppercase hex digits", () => {
    expect(crc16("")).toBe("FFFF");
    expect(crc16("A")).toMatch(/^[0-9A-F]{4}$/);
  });
});

describe("tlv", () => {
  it("encodes id + 2-digit length + value", () => {
    expect(tlv("54", "150000")).toBe("5406150000");
    expect(tlv("58", "VN")).toBe("5802VN");
  });
  it("rejects values over 99 chars", () => {
    expect(() => tlv("62", "x".repeat(100))).toThrow();
  });
});

describe("buildVietQrPayload", () => {
  const payload = buildVietQrPayload(input);
  const top = parseTlv(payload);

  it("has the EMVCo/NAPAS field layout in order", () => {
    expect([...top.keys()]).toEqual(["00", "01", "38", "53", "54", "58", "62", "63"]);
    expect(top.get("00")!).toBe("01");
    expect(top.get("01")!).toBe("12"); // dynamic
    expect(top.get("53")!).toBe("704"); // VND
    expect(top.get("58")!).toBe("VN");
  });

  it("puts bank BIN, account and service code in field 38", () => {
    const merchant = parseTlv(top.get("38")!);
    expect(merchant.get("00")!).toBe("A000000727");
    expect(merchant.get("02")!).toBe("QRIBFTTA");
    expect(Object.fromEntries(parseTlv(merchant.get("01")!))).toEqual({ "00": "970436", "01": "0011001234567" });
  });

  it("carries the exact amount and qr_ref description", () => {
    expect(top.get("54")!).toBe("150000");
    expect(Object.fromEntries(parseTlv(top.get("62")!))).toEqual({ "08": "XDS11A" });
  });

  it("ends with a valid CRC over everything up to 6304", () => {
    expect(payload.slice(-8, -4)).toBe("6304");
    expect(payload.slice(-4)).toBe(crc16(payload.slice(0, -4)));
  });

  it("matches a fixed reference payload (CRC cross-checked with Python binascii.crc_hqx)", () => {
    expect(payload).toBe(
      "00020101021238570010A00000072701270006970436011300110012345670208QRIBFTTA530370454061500005802VN62100806XDS11A63048E17",
    );
  });

  it("rejects invalid input", () => {
    expect(() => buildVietQrPayload({ ...input, amount: 0 })).toThrow();
    expect(() => buildVietQrPayload({ ...input, amount: 1.5 })).toThrow();
    expect(() => buildVietQrPayload({ ...input, bankBin: "97043" })).toThrow();
    expect(() => buildVietQrPayload({ ...input, description: "xd-1" })).toThrow();
    expect(() => buildVietQrPayload({ ...input, description: "X".repeat(26) })).toThrow();
  });
});
