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

const CLIENT_ID = (import.meta.env.VITE_ADSENSE_CLIENT_ID ?? "").trim();

/** Publisher ids are `ca-pub-` followed by 16 digits. */
export const ADSENSE_CLIENT_ID = /^ca-pub-\d{16}$/.test(CLIENT_ID) ? CLIENT_ID : "";

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
    const existing = document.querySelector<HTMLScriptElement>("script[data-adsense-loader]");
    if (existing) {
      if (existing.dataset.loaded === "true") resolve();
      else existing.addEventListener("load", () => resolve(), { once: true });
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
