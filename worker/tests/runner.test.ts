import { describe, expect, it } from "vitest";
import { nextDelayMs, runStation } from "../src/runner.ts";
import type { SyncResult } from "../src/sync.ts";
import { PortalChallengeError } from "../src/vendor/types.ts";

describe("nextDelayMs", () => {
  it("polls every 5 s; backs off 5 s, 15 s, 60 s on consecutive errors", () => {
    expect([0, 1, 2, 3, 4, 10].map(nextDelayMs)).toEqual([5000, 5000, 15000, 60000, 60000, 60000]);
  });
});

// Drives runStation with scripted outcomes and records the delays it asks for.
async function drive(script: (SyncResult | Error)[]) {
  const delays: number[] = [];
  const logs: string[] = [];
  const abort = new AbortController();
  let i = 0;
  const outcome = await runStation(
    {
      stationId: "st",
      runOnce: async () => {
        const step = script[i++];
        if (step instanceof Error) throw step;
        return step;
      },
      sleep: async (ms) => {
        delays.push(ms);
        if (i >= script.length) abort.abort();
      },
      log: (m) => logs.push(m),
    },
    abort.signal,
  );
  return { delays, logs, outcome, runs: i };
}

const ok: SyncResult = { ok: true, fetched: 0, advanced: false };

describe("runStation", () => {
  it("backs off on errors and returns to 5 s after a success", async () => {
    const { delays, logs } = await drive([ok, new Error("down"), new Error("down"), new Error("down"), new Error("down"), ok, ok]);
    expect(delays).toEqual([5000, 5000, 15000, 60000, 60000, 5000, 5000]);
    expect(logs).toContain("recovered");
  });

  it("treats an incomplete sync (unmapped pump) as a failure for backoff", async () => {
    const { delays } = await drive([{ ok: false, error: "Trụ chưa được ánh xạ: P9" }, ok]);
    expect(delays).toEqual([5000, 5000]);
  });

  it("stops immediately on a CAPTCHA/OTP instead of retrying", async () => {
    const { outcome, runs, delays, logs } = await drive([ok, new PortalChallengeError("CAPTCHA"), ok, ok]);
    expect(outcome).toBe("challenge");
    expect(runs).toBe(2); // never ran again after the challenge
    expect(delays).toEqual([5000]);
    expect(logs.at(-1)).toMatch(/^STOPPED: .*CAPTCHA/);
  });
});
