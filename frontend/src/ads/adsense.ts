/**
 * Google AdSense — one loader, one place that knows the publisher id.
 *
 * Configure with build-time env vars (see frontend/.env.example):
 *   VITE_ADSENSE_CLIENT_ID      ca-pub-XXXXXXXXXXXXXXXX
 *   VITE_ADSENSE_SLOT_LANDING   numeric ad-unit slot id
 *   VITE_ADSENSE_SLOT_MATCH...  numeric ad-unit slot id
 *
 * With no client id, ads simply do not render — the app is otherwise unchanged,
 * so a fork or a local checkout never shows broken ad frames.
 */

/** Publisher ids are `ca-pub-` followed by 16 digits. */
const PUBLISHER_RE = /ca-pub-\d{16}/;

/**
 * The publisher id comes from the build env, or — when the site already ships
 * one in index.html (the account meta tag / adsbygoogle script) — from there.
 * index.html stays the single place that authorizes this site, so ads and the
 * generated ads.txt can never point at different accounts.
 */
function resolveClientId(): string {
  const fromEnv = (import.meta.env.VITE_ADSENSE_CLIENT_ID ?? "").trim();
  if (PUBLISHER_RE.test(fromEnv)) return fromEnv;
  if (typeof document === "undefined") return "";

  const meta = document.querySelector('meta[name="google-adsense-account"]')?.getAttribute("content");
  if (meta) {
    const match = meta.match(PUBLISHER_RE);
    if (match) return match[0];
  }

  for (const script of Array.from(document.querySelectorAll<HTMLScriptElement>("script[src]"))) {
    const match = script.src.match(PUBLISHER_RE);
    if (match) return match[0];
  }

  return "";
}

export const ADSENSE_CLIENT_ID = resolveClientId();

export const adsEnabled = ADSENSE_CLIENT_ID !== "";

export const ADSENSE_SLOTS = {
  landing: (import.meta.env.VITE_ADSENSE_SLOT_LANDING ?? "").trim(),
  matchmaking: (import.meta.env.VITE_ADSENSE_SLOT_MATCHMAKING ?? "").trim(),
} as const;

export type AdPlacement = keyof typeof ADSENSE_SLOTS;

let loader: Promise<void> | null = null;

/**
 * Injects adsbygoogle.js once. Resolves even on failure — a blocked ad script
 * (ad blocker, offline) must never surface as an app error.
 */
export function loadAdSense(): Promise<void> {
  if (!adsEnabled) return Promise.resolve();
  if (loader) return loader;

  loader = new Promise<void>((resolve) => {
    // index.html may already load adsbygoogle.js for this publisher — reuse it
    // instead of adding a second copy of the script.
    const existing = document.querySelector<HTMLScriptElement>(
      "script[data-adsense-loader], script[src*=\"adsbygoogle.js\"]",
    );
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => resolve(), { once: true });
        // Already-executed scripts never fire load again.
        if (existing.dataset.adsenseLoader !== "true") resolve();
      }
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(
      ADSENSE_CLIENT_ID,
    )}`;
    script.dataset.adsenseLoader = "true";
    script.addEventListener(
      "load",
      () => {
        script.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    // Ad blockers reject the request; treat it as "no ads", not an error.
    script.addEventListener("error", () => resolve(), { once: true });
    document.head.appendChild(script);
  });

  return loader;
}

/** Fills one <ins class="adsbygoogle"> element. Safe to call repeatedly. */
export function requestAd(): void {
  if (!adsEnabled) return;
  try {
    const w = window as typeof window & { adsbygoogle?: unknown[] };
    w.adsbygoogle = w.adsbygoogle || [];
    w.adsbygoogle.push({});
  } catch {
    /* AdSense throws if the unit is filled twice or the script is blocked. */
  }
}
