import { redis } from "../config/redis.js";

const PRESENCE_TTL_SEC = 60; // refreshed by client heartbeat every ~20s
const key = (userId: string) => `presence:${userId}`;

export async function setPresence(userId: string, socketId: string): Promise<void> {
  await redis.set(key(userId), socketId, "EX", PRESENCE_TTL_SEC);
}

export async function getPresence(userId: string): Promise<string | null> {
  return redis.get(key(userId));
}

/** Refresh TTL for a live connection (heartbeat). */
export async function refreshPresence(userId: string, socketId: string): Promise<void> {
  const current = await redis.get(key(userId));
  if (current === socketId) {
    await redis.expire(key(userId), PRESENCE_TTL_SEC);
  } else {
    // another tab took over presence — claim it
    await setPresence(userId, socketId);
  }
}

/** Remove presence only if this socket still owns it (idempotent disconnect). */
export async function clearPresence(userId: string, socketId: string): Promise<void> {
  const current = await redis.get(key(userId));
  if (current === socketId) {
    await redis.del(key(userId));
  }
}
