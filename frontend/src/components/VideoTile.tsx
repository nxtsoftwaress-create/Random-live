import { useEffect, useRef, type ReactNode } from "react";
import { clsx } from "clsx";
import { useAudioLevel } from "../hooks/useAudioLevel";

export interface VideoTileProps {
  stream: MediaStream | null;
  muted?: boolean;
  mirrored?: boolean;
  label?: string;
  className?: string;
  placeholder?: ReactNode;
  showBars?: boolean;
}

export function VideoTile({
  stream,
  muted = false,
  mirrored = false,
  label,
  className,
  placeholder,
  showBars = false,
}: VideoTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const bars = useAudioLevel(showBars ? stream : null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream]);

  return (
    <div className={clsx("glass relative overflow-hidden rounded-2xl bg-black/40", className)}>
      {stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className={clsx("h-full w-full object-cover", mirrored && "scale-x-[-1]")}
        />
      ) : (
        (placeholder ?? (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink to-void">
            <div className="flex flex-col items-center gap-3 text-slate-500">
              <div className="h-12 w-12 animate-pulse rounded-full bg-gradient-to-br from-brand/40 to-white/25 blur-[2px]" />
              <span className="text-sm">Waiting for video…</span>
            </div>
          </div>
        ))
      )}

      {label && (
        <div className="absolute left-3 top-3 rounded-full bg-black/45 px-3 py-1 text-xs font-medium text-slate-200 backdrop-blur">
          {label}
        </div>
      )}

      {showBars && (
        <div className="absolute bottom-3 left-3 flex h-6 items-end gap-1">
          {bars.map((v, i) => (
            <span
              key={i}
              className="w-1 rounded-full bg-brand-light transition-all duration-100"
              style={{ height: `${4 + v * 18}px`, opacity: 0.35 + v * 0.65 }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
