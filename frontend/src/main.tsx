import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { useAuthStore } from "./store/auth.store";
import { useSettingsStore } from "./store/settings.store";
import { startKeepAlive } from "./services/keepalive";

// Hydrate persisted state before first render.
useAuthStore.getState().hydrate();
useSettingsStore.getState().hydrate();

// Wake the API (free instance sleeps) while the user reads the landing page.
startKeepAlive();

// No StrictMode: media + WebRTC effects must not double-invoke in dev.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
