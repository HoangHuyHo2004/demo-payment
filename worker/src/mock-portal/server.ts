// Mock vendor portal: a small fake website with a login page and a transaction
// table (which, like many real portals, loads its rows from a JSON endpoint).
// Development and tests only. Never deployed alongside real portal access.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { PortalAccount, VendorTransaction } from "../vendor/types.ts";

export type MockPortalOptions = {
  accounts: PortalAccount[];
  // Where the fake portal gets its rows (Supabase table in dev, an array in tests).
  listTransactions: (stationId: string, since: Date) => Promise<VendorTransaction[]>;
};

export type MockPortal = {
  server: Server;
  url: string;
  logins: () => number; // successful logins so far (tests)
  expireSessions: () => void;
  setChallenge: (kind: "captcha" | "otp" | null) => void;
  close: () => Promise<void>;
};

const page = (title: string, body: string) =>
  `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 10_000) req.destroy(); });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

export async function startMockPortal(opts: MockPortalOptions, port = 0): Promise<MockPortal> {
  const sessions = new Map<string, string>(); // session id -> station id
  let challenge: "captcha" | "otp" | null = null;
  let logins = 0;

  const sessionOf = (req: IncomingMessage) => {
    const sid = /(?:^|;\s*)portal_sid=([^;]+)/.exec(req.headers.cookie ?? "")?.[1];
    return sid ? sessions.get(sid) : undefined;
  };
  const send = (res: ServerResponse, status: number, type: string, body: string, headers: Record<string, string> = {}) => {
    res.writeHead(status, { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-store", ...headers });
    res.end(body);
  };
  const redirect = (res: ServerResponse, to: string, headers: Record<string, string> = {}) => {
    res.writeHead(302, { Location: to, ...headers });
    res.end();
  };

  const loginPage = (error = "") =>
    page(
      "Đăng nhập - Cổng quản lý trạm (MOCK)",
      `<h1>Cổng quản lý trạm (MOCK)</h1>
       ${error ? `<p id="login-error" role="alert">${error}</p>` : ""}
       <form method="post" action="/login">
         <label>Tài khoản <input name="username" autocomplete="username"></label>
         <label>Mật khẩu <input name="password" type="password" autocomplete="current-password"></label>
         ${challenge === "captcha" ? `<div id="captcha" class="g-recaptcha" data-sitekey="mock">CAPTCHA</div>` : ""}
         ${challenge === "otp" ? `<label>Mã OTP <input name="otp" inputmode="numeric" autocomplete="one-time-code"></label>` : ""}
         <button type="submit">Đăng nhập</button>
       </form>`,
    );

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://mock");
      const route = `${req.method} ${url.pathname}`;

      if (route === "GET /healthz") return send(res, 200, "text/plain", "ok");
      if (route === "GET /" ) return redirect(res, sessionOf(req) ? "/transactions" : "/login");
      if (route === "GET /login") return send(res, 200, "text/html", loginPage());

      if (route === "POST /login") {
        const form = new URLSearchParams(await readBody(req));
        if (challenge) return send(res, 403, "text/html", loginPage("Vui lòng hoàn thành xác minh."));
        const account = opts.accounts.find(
          (a) => a.username === form.get("username") && a.password === form.get("password"),
        );
        if (!account) return send(res, 401, "text/html", loginPage("Sai tài khoản hoặc mật khẩu."));
        const sid = randomUUID();
        sessions.set(sid, account.station_id);
        logins++;
        return redirect(res, "/transactions", { "Set-Cookie": `portal_sid=${sid}; Path=/; HttpOnly; SameSite=Lax` });
      }

      if (route === "GET /transactions") {
        if (!sessionOf(req)) return redirect(res, "/login");
        return send(
          res, 200, "text/html",
          page(
            "Giao dịch - Cổng quản lý trạm (MOCK)",
            `<h1>Giao dịch bán hàng</h1>
             <table id="transactions"><thead><tr><th>Số HĐ</th><th>Trụ</th><th>Nhiên liệu</th><th>Số lít</th><th>Đơn giá</th><th>Thành tiền</th><th>Thời gian</th></tr></thead><tbody></tbody></table>
             <script>
               fetch("/api/transactions?since=" + encodeURIComponent(new Date(Date.now() - 864e5).toISOString()))
                 .then((r) => r.json()).then(({ transactions }) => {
                   document.querySelector("#transactions tbody").innerHTML = transactions.map((t) =>
                     "<tr>" + [t.invoice_no, t.vendor_pump_id, t.fuel_type, t.volume, t.unit_price, t.amount, t.fueled_at]
                       .map((v) => "<td>" + v + "</td>").join("") + "</tr>").join("");
                 });
             </script>`,
          ),
        );
      }

      if (route === "GET /api/transactions") {
        const stationId = sessionOf(req);
        if (!stationId) return send(res, 401, "application/json", JSON.stringify({ error: "session_expired" }));
        const since = new Date(url.searchParams.get("since") ?? "");
        if (Number.isNaN(since.getTime())) return send(res, 400, "application/json", JSON.stringify({ error: "bad_since" }));
        const transactions = await opts.listTransactions(stationId, since);
        return send(res, 200, "application/json", JSON.stringify({ transactions }));
      }

      // Test-only switches (the real portal obviously has none of these).
      if (route === "POST /__test/expire-sessions") { sessions.clear(); return send(res, 200, "text/plain", "expired"); }
      if (route === "POST /__test/challenge") {
        const kind = url.searchParams.get("kind");
        challenge = kind === "captcha" || kind === "otp" ? kind : null;
        return send(res, 200, "text/plain", String(challenge));
      }

      send(res, 404, "text/plain", "not found");
    } catch (e) {
      send(res, 500, "text/plain", e instanceof Error ? e.message : "error");
    }
  });

  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("mock portal failed to bind");

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    logins: () => logins,
    expireSessions: () => sessions.clear(),
    setChallenge: (kind) => { challenge = kind; },
    close: () => new Promise((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
