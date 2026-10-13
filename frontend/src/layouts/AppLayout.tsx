import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Background } from "../components/Background";
import { Logo } from "../components/LogoMark";
import { ToastHost } from "../components/ui/Toast";

export function AppLayout() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Background />
      <header className="relative z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <Logo />
        <div className="hidden items-center gap-1.5 text-xs text-slate-400 sm:flex">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Safe &amp; moderated · 18+
        </div>
      </header>
      <main className="relative z-10 flex flex-1 flex-col">
        <Outlet />
      </main>
      <footer className="relative z-10 px-6 py-6 text-center text-xs text-slate-600 sm:px-10">
        Peer-to-peer by design — your video connects directly, never through our servers.
      </footer>
      <ToastHost />
    </div>
  );
}
