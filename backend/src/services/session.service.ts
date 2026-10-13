import { getStore } from "../config/store.js";
import { redis } from "../config/redis.js";
import { logger } from "../utils/logger.js";
import { getIo, roomChannel } from "../websocket/io.js";
import { getPresence } from "./presence.service.js";
import type { RoomState } from "./matchmaking.service.js";
import type { MatchMode } from "../validators/socket.validator.js";

const roomKey = (roomId: string) => `room:${roomId}`;
const userRoomKey = (userId: string) => `user:room:${userId}`;
const END_LOCK_TTL_SEC = 10;

export type EndReasonKind = "next" | "disconnect" | "ended";

export async function getActiveRoomForUser(userId: string): Promise<RoomState | null> {
  const roomId = await redis.get(userRoomKey(userId));
  if (!roomId) return null;
  const raw = await redis.hget(roomKey(roomId), "data");
  if (!raw) return null;
  try {
    const room = JSON.parse(raw) as RoomState;
    return room.status === "live" ? room : null;
  } catch {
    return null;
  }
}

export async function getRoomById(roomId: string): Promise<RoomState | null> {
  const raw = await redis.hget(roomKey(roomId), "data");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RoomState;
  } catch {
    return null;
  }
}

/**
 * Ends a live room exactly once (SETNX lock guards against double-ends like
 * next_user racing a disconnect), persists the outcome to PostgreSQL, cleans
 * Redis state and notifies the remaining partner.
 */
export async function endSession(
  roomId: string,
  reason: EndReasonKind,
  byUserId?: string,
): Promise<{ partnerUserId: string | null } | null> {
  const lock = await redis.set(`room:ended:${roomId}`, "1", "EX", END_LOCK_TTL_SEC, "NX");
  if (lock !== "OK") return null; // someone else already ended it

  const room = await getRoomById(roomId);
  if (!room) return null;

  const endedAt = new Date();
  const durationSec = Math.max(
    0,
    Math.round((endedAt.getTime() - new Date(room.startedAt).getTime()) / 1000),
  );

  try {
    await getStore().updateSessionEnd(room.sessionId, {
      endedAt,
      durationSec,
      endReason: reason === "next" ? "NEXT" : reason === "disconnect" ? "DISCONNECT" : "ENDED",
    });
  } catch (err) {
    // Session row may already be gone (e.g. pruned) — room teardown still proceeds.
    logger.warn({ err, roomId }, "Session row update failed during endSession");
  }

  await redis
    .pipeline()
    .del(roomKey(roomId))
    .del(userRoomKey(room.userAId))
    .del(userRoomKey(room.userBId))
    .exec();

  const io = getIo();
  io.in(roomChannel(roomId)).socketsLeave(roomChannel(roomId));

  let partnerUserId: string | null = null;
  if (byUserId) {
    partnerUserId = byUserId === room.userAId ? room.userBId : room.userAId;
    const partnerSocket = await getPresence(partnerUserId);
    if (partnerSocket) {
      io.to(partnerSocket).emit("partner_left", { reason });
    }
  } else {
    // No actor (server shutdown edge) — treat as disconnect for whoever is left.
    for (const uid of [room.userAId, room.userBId]) {
      const socketId = await getPresence(uid);
      if (socketId) io.to(socketId).emit("partner_left", { reason: "disconnect" });
    }
  }

  logger.info({ roomId, reason, durationSec }, "Session ended");
  return { partnerUserId };
}

export function sessionModeToDb(mode: MatchMode): "VIDEO" | "TEXT" {
  return mode === "video" ? "VIDEO" : "TEXT";
}
