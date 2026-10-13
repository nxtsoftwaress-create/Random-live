import type http from "node:http";
import { Server, type Socket } from "socket.io";
import { corsOptions } from "../config/cors.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { logger } from "../utils/logger.js";
import { setIo } from "./io.js";
import { setPresence, clearPresence, refreshPresence } from "../services/presence.service.js";
import { leaveQueue } from "../services/matchmaking.service.js";
import { endSession, getActiveRoomForUser } from "../services/session.service.js";
import { registerMatchmakingHandlers } from "./matchmaking.socket.js";
import { registerWebRtcHandlers } from "./webrtc.socket.js";
import { registerChatHandlers } from "./chat.socket.js";

export interface SocketUser {
  id: string;
  displayName: string;
  isGuest: boolean;
}

declare module "socket.io" {
  interface SocketData {
    user: SocketUser;
  }
}

export function emitError(socket: Socket, code: string, message: string): void {
  socket.emit("socket_error", { code, message });
}

export function errorPayload(err: unknown): { code: string; message: string } {
  if (err instanceof Error && "statusCode" in err && "code" in err) {
    return { code: String((err as { code: unknown }).code), message: err.message };
  }
  return { code: "internal", message: "Something went wrong" };
}

export function createSocketServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    cors: corsOptions,
    path: "/socket.io",
    pingInterval: 20_000,
    pingTimeout: 25_000,
    maxHttpBufferSize: 1e6, // 1 MB hard cap on any single frame
  });

  setIo(io);

  // JWT handshake auth — sockets without a valid access token never connect.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error("unauthorized"));
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = {
        id: payload.sub,
        displayName: payload.displayName,
        isGuest: payload.isGuest,
      };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const user = socket.data.user;
    logger.debug({ userId: user.id, socketId: socket.id }, "socket connected");
    void setPresence(user.id, socket.id);

    socket.on("heartbeat", () => {
      refreshPresence(user.id, socket.id).catch((err) =>
        logger.warn({ err }, "heartbeat presence refresh failed"),
      );
    });

    registerMatchmakingHandlers(socket);
    registerWebRtcHandlers(socket);
    registerChatHandlers(socket);

    socket.on("disconnect", (reason) => {
      void (async () => {
        await clearPresence(user.id, socket.id);
        await leaveQueue(user.id);
        const room = await getActiveRoomForUser(user.id);
        if (room) {
          await endSession(room.roomId, "disconnect", user.id);
        }
      })().catch((err) => logger.error({ err }, "disconnect cleanup failed"));
      logger.debug({ userId: user.id, socketId: socket.id, reason }, "socket disconnected");
    });
  });

  return io;
}
