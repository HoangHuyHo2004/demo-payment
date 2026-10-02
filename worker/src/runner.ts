import { PortalChallengeError } from "./vendor/types.ts";
import type { SyncResult } from "./sync.ts";

export const POLL_MS = 5_000;
export const BACKOFF_MS = [5_000, 15_000, 60_000];

// Delay before the next run: 5 s after a success; after consecutive failures
// 5 s, then 15 s, then 60 s (and it stays at 60 s).
export function nextDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return POLL_MS;
  return BACKOFF_MS[Math.min(consecutiveFailures, BACKOFF_MS.length) - 1];
}

export type RunnerOptions = {
  stationId: string;
  runOnce: () => Promise<SyncResult>; // one sync; throws on portal/database failure
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  log?: (message: string) => void;
};

const defaultSleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

// Polls one station until aborted. Returns "challenge" if the portal demanded a
// CAPTCHA/OTP: we stop polling that station instead of retrying into it.
export async function runStation(opts: RunnerOptions, signal: AbortSignal): Promise<"aborted" | "challenge"> {
  const sleep = opts.sleep ?? defaultSleep;
  const log = opts.log ?? ((m: string) => console.log(`${new Date().toISOString()} [${opts.stationId}] ${m}`));
  let failures = 0;

  while (!signal.aborted) {
    try {
      const result = await opts.runOnce();
      if (result.ok) {
        if (failures > 0) log("recovered");
        if (result.advanced) log("new transactions synced");
        failures = 0;
      } else {
        failures++;
        log(`incomplete: ${result.error}`);
      }
    } catch (e) {
      if (e instanceof PortalChallengeError) {
        log(`STOPPED: ${e.message}`);
        return "challenge";
      }
      failures++;
      log(`error (${failures}): ${e instanceof Error ? e.message : String(e)}; retry in ${nextDelayMs(failures) / 1000}s`);
    }
    await sleep(nextDelayMs(failures), signal);
  }
  return "aborted";
}
