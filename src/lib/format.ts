const TZ = "Asia/Ho_Chi_Minh";

export const formatVnd = (amount: number) => `${new Intl.NumberFormat("vi-VN").format(amount)} đ`;

export const formatLiters = (volume: string | number) =>
  `${new Intl.NumberFormat("vi-VN", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(Number(volume))} L`;

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat("vi-VN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(iso));

type PaymentLike = { method: "cash" | "qr"; status: "pending" | "confirmed" } | null;

export function paymentStatusLabel(p: PaymentLike): string {
  if (!p) return "Chưa thanh toán";
  if (p.method === "cash") return "Tiền mặt";
  return p.status === "confirmed" ? "QR – đã xác nhận" : "QR – chờ xác nhận";
}

// "150.000" / "150,000" / "150000 đ" -> 150000; null if not a whole VND amount.
export function parseVnd(raw: unknown): number | null {
  const s = String(raw ?? "").replace(/[\sđ]/g, "");
  // Plain digits, or thousands grouped by "." / "," ("1.5" is rejected, not read as 15).
  if (!/^\d{1,12}$/.test(s) && !/^\d{1,3}([.,]\d{3}){1,3}$/.test(s)) return null;
  return Number(s.replace(/[.,]/g, ""));
}
