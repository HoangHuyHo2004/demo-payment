// PLAN.md §10 Phase 7: log in → pump → cash pay → QR pay → confirm → export.
// Seeds two mock vendor transactions (service role, from .env.local) so the
// run is independent of existing data, and removes everything it created.
import { config } from "dotenv";
import ExcelJS from "exceljs";
import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const email = process.env.E2E_EMAIL ?? "staff1@petrol.test";
const password = process.env.E2E_PASSWORD ?? process.env.SEED_PASSWORD;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

const STATION_1 = "00000000-0000-0000-0000-00000000000a";
const PUMP = "P3";
const PREFIX = `E2E${Date.now().toString(36).toUpperCase()}`;
const CASH_INV = `${PREFIX}C`;
const QR_INV = `${PREFIX}Q`;

test.skip(!password || !url || !service, "needs .env.local with SEED_PASSWORD and Supabase keys");

const db = () => createClient(url!, service!, { auth: { persistSession: false } });

test.beforeAll(async () => {
  const now = Date.now();
  const { error } = await db().from("mock_vendor_transactions").insert([
    { station_id: STATION_1, vendor_pump_id: PUMP, fuel_type: "A95", volume: "2.421", unit_price: 20650, amount: 50000, fueled_at: new Date(now - 2000).toISOString(), invoice_no: CASH_INV },
    { station_id: STATION_1, vendor_pump_id: PUMP, fuel_type: "E5", volume: "5.063", unit_price: 19750, amount: 100000, fueled_at: new Date(now - 1000).toISOString(), invoice_no: QR_INV },
  ]);
  if (error) throw error;
});

test.afterAll(async () => {
  const c = db();
  const { data: txs } = await c.from("transactions").select("id").in("invoice_no", [CASH_INV, QR_INV]);
  const ids = (txs ?? []).map((t) => t.id);
  if (ids.length) {
    await c.from("payments").delete().in("transaction_id", ids);
    await c.from("transactions").delete().in("id", ids);
  }
  await c.from("mock_vendor_transactions").delete().in("invoice_no", [CASH_INV, QR_INV]);
});

test("staff: log in → pump → cash → QR → confirm → export", async ({ page }) => {
  // Log in
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mật khẩu").fill(password!);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
  await expect(page.getByRole("heading", { name: "Cửa hàng xăng dầu số 1" })).toBeVisible();

  // Pump screen: the seeded vendor transactions sync in (≤ 5 s poll)
  await page.getByRole("link", { name: /^Trụ 3/ }).click();
  const cashRow = page.getByRole("link", { name: new RegExp(CASH_INV) });
  const qrRow = page.getByRole("link", { name: new RegExp(QR_INV) });
  await expect(cashRow).toContainText("Chưa thanh toán", { timeout: 20_000 });
  await expect(qrRow).toContainText("Chưa thanh toán");

  // Cash payment, prefilled with the amount due
  await cashRow.click();
  await page.getByRole("button", { name: "Tiền mặt" }).click();
  await expect(page.getByLabel("Tiền mặt đã nhận (đ)")).toHaveValue("50.000");
  await page.getByRole("button", { name: "Xác nhận đã nhận tiền mặt" }).click();
  await expect(cashRow).toContainText("Tiền mặt");

  // QR payment: full-screen VietQR for the exact amount, then manual confirmation
  await qrRow.click();
  await page.getByRole("button", { name: "QR", exact: true }).click();
  await expect(page.getByRole("img", { name: /Mã VietQR 100\.000/ })).toBeVisible();
  await expect(page.getByText(/^XDS1[0-9A-Z]+$/)).toBeVisible();
  await page.getByRole("button", { name: "Đã nhận tiền" }).click();
  await expect(qrRow).toContainText("QR – đã xác nhận");

  // Export today's report and check both payments are in it
  await page.goto("/reports");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Tải báo cáo Excel" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^BaoCao_S1_\d{4}-\d{2}-\d{2}\.xlsx$/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(await download.path());
  const detail = wb.getWorksheet("Chi tiết")!;
  const byInvoice = new Map<string, ExcelJS.Row>();
  detail.eachRow((row) => byInvoice.set(String(row.getCell(3).value), row));
  expect(byInvoice.get(CASH_INV)?.getCell(10).value).toBe("Tiền mặt");
  expect(byInvoice.get(CASH_INV)?.getCell(9).value).toBe(50000);
  expect(byInvoice.get(QR_INV)?.getCell(10).value).toBe("QR – đã xác nhận");
  expect(wb.getWorksheet("Tổng hợp")!.getCell("A9").value).toBe("Tổng");
});
