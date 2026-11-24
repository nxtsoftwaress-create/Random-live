import { useEffect, useRef, type CSSProperties } from "react";
import { clsx } from "clsx";
import {
  ADSENSE_CLIENT_ID,
  adsEnabled,
  loadAdSense,
  requestAd,
  type AdPlacement,
  ADSENSE_SLOTS,
} from "../ads/adsense";

interface AdSlotProps {
  /** Which configured ad unit to fill. */
  placement: AdPlacement;
  /** AdSense format: "auto" (responsive), "rectangle", "horizontal", … */
  format?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * One labelled Google AdSense unit. Renders nothing until a publisher id and
 * slot id are configured; in dev it shows a dashed placeholder so the layout
 * is visible without a live ad account.
 */
export function AdSlot({ placement, format = "auto", className, style }: AdSlotProps) {
  const slot = ADSENSE_SLOTS[placement];
  const ref = useRef<HTMLModElement | null>(null);

  useEffect(() => {
    if (!adsEnabled || !slot) return;
    let cancelled = false;

    void loadAdSense().then(() => {
      if (cancelled || !ref.current) return;
      requestAd();
    });

    return () => {
      cancelled = true;
    };
  }, [slot]);

  if (!adsEnabled || !slot) {
    if (!import.meta.env.DEV) return null;
    return (
      <div
        className={clsx(
          "flex min-h-[90px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-center text-[11px] leading-relaxed text-slate-600",
          className,
        )}
      >
        Ad slot `{placement}` — set VITE_ADSENSE_CLIENT_ID and
        VITE_ADSENSE_SLOT_{placement.toUpperCase()} in frontend/.env to serve ads.
      </div>
    );
  }

  return (
    <aside className={clsx("w-full", className)} aria-label="Advertisement">
      <span className="mb-1 block text-center text-[10px] uppercase tracking-[0.18em] text-slate-600">
        Advertisement
      </span>
      <ins
        ref={ref}
        className="adsbygoogle block w-full overflow-hidden rounded-2xl"
        style={{ display: "block", ...style }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </aside>
  );
}
