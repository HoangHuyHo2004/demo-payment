import type { Browser, BrowserContext } from "playwright";
import {
  PortalChallengeError,
  PortalLoginError,
  type PortalAccount,
  type VendorClient,
  type VendorTransaction,
} from "./types.ts";

// Selectors that mean "a human must solve something". We never try to get past these.
const CAPTCHA = '#captcha, .g-recaptcha, .h-captcha, [class*="captcha" i], iframe[src*="captcha" i]';
const OTP = 'input[name*="otp" i], input[autocomplete="one-time-code"]';

// Minimum gap between two portal requests for one station, so a retry storm
// can never hammer the vendor's site.
const MIN_REQUEST_GAP_MS = 1000;

type Session = { context: BrowserContext; loggedIn: boolean; lastRequestAt: number };

// VENDOR_MODE=mock: logs in to the mock portal's login form with Playwright,
// then reads the JSON endpoint the portal's own transaction page uses, with
// the session cookie. This is the same shape `portal_http` will have.
export class MockPortalClient implements VendorClient {
  private readonly browser: Browser;
  private readonly baseUrl: string;
  private readonly accounts: Map<string, PortalAccount>;
  private readonly sessions = new Map<string, Session>();

  constructor(browser: Browser, baseUrl: string, accounts: PortalAccount[]) {
    this.browser = browser;
    this.baseUrl = baseUrl;
    this.accounts = new Map(accounts.map((a) => [a.station_id, a]));
  }

  async listTransactions(stationId: string, since: Date): Promise<VendorTransaction[]> {
    const session = await this.session(stationId);
    // At most two attempts: the second one only after a fresh login.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!session.loggedIn) await this.login(stationId, session);
      await this.throttle(session);
      const res = await session.context.request.get(
        `${this.baseUrl}/api/transactions?since=${encodeURIComponent(since.toISOString())}`,
        { maxRedirects: 0, failOnStatusCode: false },
      );
      if (res.status() === 401 || res.status() === 302) {
        session.loggedIn = false; // session expired: log in again automatically
        continue;
      }
      if (!res.ok()) throw new Error(`Portal HTTP ${res.status()}`);
      const body = (await res.json()) as { transactions: VendorTransaction[] };
      return body.transactions;
    }
    throw new PortalLoginError("Phiên đăng nhập cổng thông tin hết hạn ngay sau khi đăng nhập lại.");
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.context.close()));
    this.sessions.clear();
  }

  // One browser context (cookie jar) per station, kept for the worker's lifetime.
  private async session(stationId: string): Promise<Session> {
    let s = this.sessions.get(stationId);
    if (!s) {
      if (!this.accounts.has(stationId)) throw new PortalLoginError(`Chưa cấu hình tài khoản cổng thông tin cho trạm ${stationId}.`);
      s = { context: await this.browser.newContext(), loggedIn: false, lastRequestAt: 0 };
      this.sessions.set(stationId, s);
    }
    return s;
  }

  private async throttle(session: Session) {
    const wait = session.lastRequestAt + MIN_REQUEST_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    session.lastRequestAt = Date.now();
  }

  private async login(stationId: string, session: Session) {
    const account = this.accounts.get(stationId)!;
    await this.throttle(session);
    const page = await session.context.newPage();
    try {
      await page.goto(`${this.baseUrl}/login`, { waitUntil: "domcontentloaded" });
      if (await page.locator(CAPTCHA).count()) throw new PortalChallengeError("CAPTCHA");
      if (await page.locator(OTP).count()) throw new PortalChallengeError("OTP");

      await page.fill('input[name="username"]', account.username);
      await page.fill('input[name="password"]', account.password);
      await Promise.all([
        page.waitForLoadState("domcontentloaded"),
        page.click('button[type="submit"]'), // the only form we ever submit: the login itself
      ]);

      if (new URL(page.url()).pathname.startsWith("/login")) {
        if (await page.locator(CAPTCHA).count()) throw new PortalChallengeError("CAPTCHA");
        if (await page.locator(OTP).count()) throw new PortalChallengeError("OTP");
        const reason = await page.locator("#login-error").textContent().catch(() => null);
        throw new PortalLoginError(`Đăng nhập cổng thông tin thất bại${reason ? `: ${reason.trim()}` : "."}`);
      }
      session.loggedIn = true;
      console.log(`${new Date().toISOString()} [${stationId}] logged in to portal`);
    } finally {
      await page.close();
    }
  }
}
