import { clsx } from "clsx";

type Tone = "live" | "connecting" | "offline" | "neutral";

const tones: Record<Tone, { wrap: string; dot: string; pulse?: boolean }> = {
  live: {
    wrap: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    dot: "bg-emerald-400",
  },
  connecting: {
    wrap: "border-amber-400/30 bg-amber-400/10 text-amber-300",
    dot: "bg-amber-400",
    pulse: true,
  },
  offline: {
    wrap: "border-rose-400/30 bg-rose-400/10 text-rose-300",
    dot: "bg-rose-400",
  },
  neutral: {
    wrap: "border-white/10 bg-white/5 text-slate-300",
    dot: "bg-slate-400",
  },
};

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const t = tones[tone];
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        t.wrap,
        className,
      )}
    >
      <span className={clsx("h-1.5 w-1.5 rounded-full", t.dot, t.pulse && "animate-pulse")} />
      {children}
    </span>
  );
}
