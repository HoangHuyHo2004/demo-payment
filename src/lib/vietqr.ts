// VietQR (NAPAS 247, EMVCo MPM) payload for a dynamic transfer-to-account QR.
// Layout: ID(2) + LEN(2) + VALUE, CRC-16/CCITT-FALSE over everything up to "6304".

const NAPAS_GUID = "A000000727";
const SERVICE_TO_ACCOUNT = "QRIBFTTA";
const CURRENCY_VND = "704";

export function tlv(id: string, value: string): string {
  if (!/^\d{2}$/.test(id)) throw new Error(`Invalid EMV id: ${id}`);
  if (value.length > 99) throw new Error(`EMV field ${id} too long`);
  return id + String(value.length).padStart(2, "0") + value;
}

// CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no xorout.
export function crc16(data: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(data)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export type VietQrInput = {
  bankBin: string; // 6-digit NAPAS BIN, e.g. 970436
  accountNo: string;
  amount: number; // VND, positive integer
  description: string; // qr_ref: uppercase alphanumeric, <= 25 chars
};

export function buildVietQrPayload({ bankBin, accountNo, amount, description }: VietQrInput): string {
  if (!/^\d{6}$/.test(bankBin)) throw new Error("bankBin must be 6 digits");
  if (!/^[0-9A-Za-z]{1,19}$/.test(accountNo)) throw new Error("Invalid account number");
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("amount must be a positive integer (VND)");
  if (!/^[A-Z0-9]{1,25}$/.test(description)) throw new Error("description must be A-Z0-9, max 25 chars");

  const merchant = tlv(
    "38",
    tlv("00", NAPAS_GUID) + tlv("01", tlv("00", bankBin) + tlv("01", accountNo)) + tlv("02", SERVICE_TO_ACCOUNT),
  );
  const body =
    tlv("00", "01") + // payload format indicator
    tlv("01", "12") + // point of initiation: dynamic (single use)
    merchant +
    tlv("53", CURRENCY_VND) +
    tlv("54", String(amount)) +
    tlv("58", "VN") +
    tlv("62", tlv("08", description)) + // purpose of transaction = transfer content
    "6304";
  return body + crc16(body);
}

// Parses top-level (or nested) TLV fields. Used by tests and for debugging.
export function parseTlv(payload: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || Number.isNaN(len)) throw new Error(`Bad TLV at ${i}`);
    out.set(id, payload.slice(i + 4, i + 4 + len));
    i += 4 + len;
  }
  return out;
}
