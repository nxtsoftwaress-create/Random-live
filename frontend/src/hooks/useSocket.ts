import { useEffect, useState } from "react";
import { ensureSocket, type ManagedSocket } from "../websocket/socket";
import { useAuthStore } from "../store/auth.store";
import { tryRefreshAuth } from "../services/auth.api";

/**
 * Returns the managed socket once the user is authenticated. Handles:
 *  - lazy creation on first authenticated page
 *  - re-auth on "unauthorized" connect errors (token refresh)
 *  - a 20s heartbeat that keeps Redis presence alive
 */
export function useSocket(): ManagedSocket | null {
  const hasAuth = useAuthStore((s) => !!s.accessToken);
  const [socket, setSocket] = useState<ManagedSocket | null>(null);

  useEffect(() => {
    if (!hasAuth) return;
    const token = useAuthStore.getState().accessToken;
    if (!token) return;

    const s = ensureSocket(token);

    const onConnectError = (err: Error): void => {
      if (/unauthorized/i.test(err.message)) {
        void tryRefreshAuth().then((ok) => {
          const fresh = useAuthStore.getState().accessToken;
          if (ok && fresh) {
            ensureSocket(fresh);
          } else {
            s.disconnect();
          }
        });
      }
    };
    s.on("connect_error", onConnectError);
    setSocket(s);

    return () => {
      s.off("connect_error", onConnectError);
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
