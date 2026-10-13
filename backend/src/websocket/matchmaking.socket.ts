import type { Socket } from "socket.io";
import { queueJoinSchema, roomIdOnlySchema } from "../validators/socket.validator.js";
import { joinQueue, leaveQueue } from "../services/matchmaking.service.js";
import { endSession, getActiveRoomForUser } from "../services/session.service.js";
import { emitError } from "./socket.js";
import { logger } from "../utils/logger.js";

interface Ack {
  ok: boolean;
  error?: { code: string; message: string };
}

function safeAck(ack: unknown, result: Ack): void {
  if (typeof ack === "function") (ack as (r: Ack) => void)(result);
}

export function registerMatchmakingHandlers(socket: Socket): void {
  const user = socket.data.user;

  socket.on("queue_join", (payload: unknown, ack?: unknown) => {
    const parsed = queueJoinSchema.safeParse(payload);
    if (!parsed.success) {
      safeAck(ack, { ok: false, error: { code: "validation_error", message: "Invalid queue_join payload" } });
      return;
    }
    joinQueue(user, socket.id, parsed.data)
      .then(() => {
        socket.emit("search_started", { mode: parsed.data.mode, language: parsed.data.language });
        safeAck(ack, { ok: true });
      })
      .catch((err) => {
        logger.error({ err }, "queue_join failed");
        safeAck(ack, { ok: false, error: { code: "internal", message: "Could not join queue" } });
      });
  });

  socket.on("queue_leave", (ack?: unknown) => {
    leaveQueue(user.id)
      .then(() => {
        socket.emit("search_cancelled");
        safeAck(ack, { ok: true });
      })
      .catch(() => safeAck(ack, { ok: false, error: { code: "internal", message: "Could not leave queue" } }));
  });

  // Skip current partner → session closes, client returns to the queue.
  socket.on("next_user", async (payload: unknown) => {
    const parsed = roomIdOnlySchema.safeParse(payload);
    if (!parsed.success) {
      emitError(socket, "validation_error", "Invalid room id");
      return;
    }
    const room = await getActiveRoomForUser(user.id);
    if (!room || room.roomId !== parsed.data.roomId) {
      emitError(socket, "not_in_room", "You are not in this room");
      return;
    }
    await endSession(room.roomId, "next", user.id);
    socket.emit("session_ended", { roomId: room.roomId, reason: "next" });
  });

  // Explicit end — partner gets a graceful "call ended", no auto requeue.
  socket.on("call_ended", async (payload: unknown) => {
    const parsed = roomIdOnlySchema.safeParse(payload);
    if (!parsed.success) return;
    const room = await getActiveRoomForUser(user.id);
    if (!room || room.roomId !== parsed.data.roomId) return;
    await endSession(room.roomId, "ended", user.id);
    socket.emit("session_ended", { roomId: room.roomId, reason: "ended" });
  });
}
