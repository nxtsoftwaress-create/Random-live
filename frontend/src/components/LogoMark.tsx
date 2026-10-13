import { Link } from "react-router-dom";
import { clsx } from "clsx";

export function LogoMark({ className }: { className?: string }) {
  return (
    <div
      className={clsx(
        "h-8 w-8 rounded-xl bg-gradient-to-br from-brand via-brand-light to-white shadow-glow",
        className,
      )}
    />
  );
}

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link to={to} className="flex items-center gap-2.5">
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight text-white">
        Random<span className="text-gradient">Live</span>
      </span>
    </Link>
  );
}
