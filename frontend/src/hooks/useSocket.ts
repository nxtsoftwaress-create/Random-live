import { useEffect, useRef, useState } from "react";
import { ensureSocket, type ManagedSocket } from "../websocket/socket";
import { useAuthStore } from "../store/auth.store";
import { useSettingsStore } from "../store/settings.store";
import { useRoomStore } from "../store/room.store";
import { tryRefreshAuth } from "../services/auth.api";
import type { SocketErrorPayload } from "../types/socket";

/**
 * Returns the managed socket once the user is authenticated. Handles:
 *  - lazy creation on first authenticated page
 *  - re-auth on "unauthorized" connect errors (token refresh / guest re-entry)
 *  - recovery when the server says the session expired (e.g. a restart wiped
 *    the guest) — re-authenticate and rejoin the queue instead of leaving the
 *    user stuck on "Finding your match"
 *  - a 20s heartbeat that keeps Redis presence alive
 */
export function useSocket(): ManagedSocket | null {
  const hasAuth = useAuthStore((s) => !!s.accessToken);
  const [socket, setSocket] = useState<ManagedSocket | null>(null);
  const healingUntil = useRef(0);

  useEffect(() => {
    if (!hasAuth) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const s = ensureSocket(token);

    /** Re-auth once, then resume searching if that is where the user was. */
    const heal = (): void => {
      const now = Date.now();
      if (now < healingUntil.current) return; // avoid a reconnect storm
      healingUntil.current = now + 5_000;

      void (async () => {
        const ok = await tryRefreshAuth();
        const fresh = useAuthStore.getState().accessToken;
        if (!ok || !fresh) {
          s.disconnect();
          return;
        }
        ensureSocket(fresh);
        if (!s.connected) s.connect();

        if (useRoomStore.getState().phase === "searching") {
          const { mode, language, interests } = useSettingsStore.getState();
          s.emit("queue_join", { mode, language, interests });
        }
      })();
    };

    const onConnectError = (err: Error): void => {
      if (/unauthorized/i.test(err.message)) heal();
    };
    const onSocketError = (payload: SocketErrorPayload): void => {
      if (payload.code === "auth_expired" || payload.code === "unauthorized") heal();
    };

    s.on("connect_error", onConnectError);
    s.on("socket_error", onSocketError);
    setSocket(s);

    return () => {
      s.off("connect_error", onConnectError);
      s.off("socket_error", onSocketError);
    };
  }, [hasAuth]);

  useEffect(() => {
    if (!socket) return;
    const timer = window.setInterval(() => {
      if (socket.connected) socket.emit("heartbeat");
    }, 20_000);
    return () => window.clearInterval(timer);
  }, [socket]);

  return socket;
}
