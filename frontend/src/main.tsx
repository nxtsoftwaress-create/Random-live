import ReactDOM from "react-dom/client";
import { useEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import App from "./App";
import "./index.css";
import { useAuthStore } from "./store/auth.store";
import { useSettingsStore } from "./store/settings.store";
import { startKeepAlive } from "./services/keepalive";
import { applyRouteSeo } from "./seo/routeMeta";

// Hydrate persisted state before first render.
useAuthStore.getState().hydrate();
useSettingsStore.getState().hydrate();

// Wake the API (free instance sleeps) while the user reads the landing page.
startKeepAlive();

/** Keeps <title>/meta in sync with the active route. Must live inside the router. */
function RouteSeo(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    applyRouteSeo(pathname);
  }, [pathname]);
  return null;
}

// No StrictMode: media + WebRTC effects must not double-invoke in dev.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <RouteSeo />
    <App />
  </BrowserRouter>,
);
