import { io, type Socket } from "socket.io-client";

export type ManagedSocket = Socket;

let socket: Socket | null = null;

/**
 * Returns the app-wide socket, creating it on first use and re-authing when
 * the access token rotates (refresh flow or guest re-entry).
 */
export function ensureSocket(token: string): Socket {
  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL || "/", {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
    });
    return socket;
  }
  const currentAuth = socket.auth as { token?: string } | undefined;
  if (currentAuth?.token !== token) {
    socket.auth = { token };
    if (!socket.connected) socket.connect();
  }
  return socket;
}

/** Fully tears the socket down (logout / leaving the app). */
export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
