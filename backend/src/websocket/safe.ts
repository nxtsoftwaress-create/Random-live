import type { Socket } from "socket.io";
import { logger } from "../utils/logger.js";

/**
 * Socket.IO does not await event handlers, so a rejected promise inside an
 * async handler is an unhandled rejection → Node exits with status 1. This
 * registers handlers through a catch-all so a bad frame can only ever fail
 * that one request, never the whole instance.
 *
 * (Local emit of socket_error on purpose: importing socket.ts here would make
 * the websocket module graph circular.)
 */
export function onSafe<Args extends unknown[]>(
  socket: Socket,
  event: string,
  handler: (...args: Args) => unknown,
): void {
  socket.on(event, (...args: Args) => {
    Promise.resolve()
      .then(() => handler(...args))
      .catch((err: unknown) => {
        logger.error({ err, event, userId: socket.data.user?.id }, "socket handler failed");
        try {
          socket.emit("socket_error", {
            code: "internal",
            message: "Something went wrong, please try again",
          });
        } catch {
          /* socket already gone */
        }
      });
  });
}
