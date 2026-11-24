import { redis } from "../config/redis.js";

const PRESENCE_TTL_SEC = 60; // refreshed by client heartbeat every ~20s
const key = (userId: string) => `presence:${userId}`;

/**
 * Live sockets per user in this process.
 *
 * A user can have several tabs open (or a phone plus a laptop). Redis presence
 * holds a single socket id — "who do I emit to" — but cleanup must not treat
 * the first tab that closes as the whole user leaving: that used to end an
 * active call and drop the queue entry for the tab that was still connected.
 */
const localSockets = new Map<string, Set<string>>();

export async function setPresence(userId: string, socketId: string): Promise<void> {
  let sockets = localSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    localSockets.set(userId, sockets);
  }
  sockets.add(socketId);
  await redis.set(key(userId), socketId, "EX", PRESENCE_TTL_SEC);
}

export async function getPresence(userId: string): Promise<string | null> {
  return redis.get(key(userId));
}

/** True while at least one socket for this user is still connected. */
export function hasLiveSockets(userId: string): boolean {
  return (localSockets.get(userId)?.size ?? 0) > 0;
}

/** Refresh TTL for a live connection (heartbeat). */
export async function refreshPresence(userId: string, socketId: string): Promise<void> {
  let sockets = localSockets.get(userId);
  if (!sockets) {
    sockets = new Set();
    localSockets.set(userId, sockets);
  }
  sockets.add(socketId);

  const current = await redis.get(key(userId));
  if (current === socketId) {
    await redis.expire(key(userId), PRESENCE_TTL_SEC);
    return;
  }
  // Another tab owns the key and is still alive here — let its own heartbeat
  // keep the TTL fresh rather than flapping the key between tabs.
  if (current && sockets.has(current)) return;

  await setPresence(userId, socketId);
}

/**
 * Remove one socket. Presence is only cleared once the user has no sockets
 * left; otherwise the key is re-pointed at a surviving tab.
 */
export async function clearPresence(userId: string, socketId: string): Promise<void> {
  const sockets = localSockets.get(userId);
  sockets?.delete(socketId);

  const remaining = sockets && sockets.size > 0 ? [...sockets][sockets.size - 1]! : null;
  if (!remaining) {
    localSockets.delete(userId);
  }

  if (remaining) {
    await redis.set(key(userId), remaining, "EX", PRESENCE_TTL_SEC);
    return;
  }

  const current = await redis.get(key(userId));
  if (current === null || current === socketId) {
    await redis.del(key(userId));
  }
}
