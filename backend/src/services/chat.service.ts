import { getStore } from "../config/store.js";
import { getIo, roomChannel } from "../websocket/io.js";
import { badRequest, forbidden, tooMany } from "../utils/errors.js";
import { validateChatBody } from "../validators/chat.validator.js";
import { consumeRate } from "./rateLimit.service.js";
import { getActiveRoomForUser } from "./session.service.js";
import type { SocketUser } from "../websocket/socket.js";

const CHAT_LIMIT = 5; // messages
const CHAT_WINDOW_SEC = 5;

export interface ChatMessageDTO {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
}

/**
 * Validates, flood-controls, persists and broadcasts a chat message.
 * Throws typed AppErrors that socket handlers translate into chat_error.
 */
export async function handleChatMessage(
  user: SocketUser,
  roomId: string,
  rawBody: string,
): Promise<ChatMessageDTO> {
  const room = await getActiveRoomForUser(user.id);
  if (!room || room.roomId !== roomId) {
    throw forbidden("You are not a participant in this room");
  }

  const body = rawBody.trim();
  const validation = validateChatBody(body);
  if (!validation.ok) {
    if (validation.code === "too_long") throw badRequest(validation.message, "too_long");
    throw badRequest(validation.message, validation.code);
  }

  const rate = await consumeRate(`chat:${user.id}`, CHAT_LIMIT, CHAT_WINDOW_SEC);
  if (!rate.allowed) {
    throw tooMany(`Slow down — try again in ${rate.retryAfterSec}s`);
  }

  const created = await getStore().createMessage({
    sessionId: room.sessionId,
    senderId: user.id,
    body,
  });

  const dto: ChatMessageDTO = {
    id: created.id,
    senderId: user.id,
    body: created.body,
    createdAt: created.createdAt.toISOString(),
  };

  getIo().to(roomChannel(roomId)).emit("chat_message", dto);
  return dto;
}
