import type { Socket } from "socket.io";
import { chatMessageSchema } from "../validators/socket.validator.js";
import { handleChatMessage } from "../services/chat.service.js";
import { getActiveRoomForUser } from "../services/session.service.js";
import { roomChannel } from "./io.js";
import { emitError, errorPayload } from "./socket.js";

export function registerChatHandlers(socket: Socket): void {
  const user = socket.data.user;

  socket.on("chat_message", async (payload: unknown, ack?: unknown) => {
    const parsed = chatMessageSchema.safeParse(payload);
    if (!parsed.success) {
      socket.emit("chat_error", { code: "validation_error", message: "Invalid chat payload" });
      if (typeof ack === "function") {
        (ack as (r: unknown) => void)({ ok: false, error: { code: "validation_error", message: "Invalid chat payload" } });
      }
      return;
    }

    try {
      const message = await handleChatMessage(user, parsed.data.roomId, parsed.data.body);
      if (typeof ack === "function") {
        (ack as (r: unknown) => void)({ ok: true, message });
      }
    } catch (err) {
      const { code, message } = errorPayload(err);
      socket.emit("chat_error", { code, message });
      if (typeof ack === "function") {
        (ack as (r: unknown) => void)({ ok: false, error: { code, message } });
      }
    }
  });

  // Typing indicators are fire-and-forget relays (no persistence).
  const typingRelay = (event: "typing_start" | "typing_stop") => async (payload: unknown) => {
    const parsed = chatMessageSchema.pick({ roomId: true }).safeParse(payload);
    if (!parsed.success) return;
    const room = await getActiveRoomForUser(user.id);
    if (!room || room.roomId !== parsed.data.roomId) return;
    socket.to(roomChannel(room.roomId)).emit(event, { userId: user.id });
  };

  socket.on("typing_start", typingRelay("typing_start"));
  socket.on("typing_stop", typingRelay("typing_stop"));
}
