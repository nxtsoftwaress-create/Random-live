/**
 * The production API runs on a free Render instance that sleeps after ~15 min
 * idle; waking it can take 20–40s. Without this, the first click of a visit
 * (Continue as Guest) would hang or time out.
 *
 * Strategy:
 *  - ping /health immediately on app load — the wake happens while the user
 *    reads the landing/safety pages instead of on their first action;
 *  - re-ping every 5 min while the tab is visible so the instance never sleeps
 *    during an active session (Render threshold is 15 min);
 *  - pause when hidden, ping immediately on return (a backgrounded tab for
 *    >15 min means the instance likely slept).
 *
 * Failures are irrelevant — even a failed fetch reaches the server and wakes
 * it, so all errors are swallowed.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api/v1";
const PING_INTERVAL_MS = 5 * 60_000; // well under Render's 15-min sleep threshold
const PING_TIMEOUT_MS = 60_000; // cold starts can take up to ~60s

let inFlight = false;

function ping(): void {
  if (inFlight) return;
  inFlight = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PING_TIMEOUT_MS);
  fetch(`${API_BASE}/health`, { signal: controller.signal, cache: "no-store" })
    .catch(() => {
      /* wake-only ping — outcome doesn't matter */
    })
    .finally(() => {
      inFlight = false;
      clearTimeout(timer);
    });
}

let interval: ReturnType<typeof setInterval> | null = null;

function startInterval(): void {
  interval ??= setInterval(ping, PING_INTERVAL_MS);
}

function stopInterval(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

/** Call once at startup. */
export function startKeepAlive(): void {
  if (typeof document === "undefined") return;
  ping();
  startInterval();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopInterval();
    } else {
      ping();
      startInterval();
    }
  });
}
