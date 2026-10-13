import { redis } from "../config/redis.js";
import { env } from "../config/env.js";
import { getStore } from "../config/store.js";
import { logger } from "../utils/logger.js";
import { newRoomId } from "../utils/ids.js";
import { selectPairs, type Candidate } from "./matchmaking/pairing.js";
import { getIo, roomChannel } from "../websocket/io.js";
import type { MatchMode, QueueJoinInput } from "../validators/socket.validator.js";

/**
 * Redis-backed matchmaking.
 *
 *   q:video / q:text          → ZSET of waiting userIds (score = joinedAt)
 *   q:pref:{userId}           → JSON queue entry (TTL 10 min)
 *   q:recent:{userId}         → SET of recently-matched partners (anti-rematch)
 *   room:{roomId}             → HASH with live room state (TTL 4 h)
 *   user:room:{userId}        → roomId reverse index for the user's live room
 *
 * A ticker runs every MATCH_TICK_MS, drains compatible pairs and creates
 * sessions. PostgreSQL remains the source of truth for completed sessions.
 */

const PREF_TTL_MS = 10 * 60_000;
const ROOM_TTL_SEC = 4 * 60 * 60;

const queueKey = (mode: MatchMode) => `q:${mode}`;
const prefKey = (userId: string) => `q:pref:${userId}`;
const recentKey = (userId: string) => `q:recent:${userId}`;
const roomKey = (roomId: string) => `room:${roomId}`;
const userRoomKey = (userId: string) => `user:room:${userId}`;

export interface QueueEntry extends Candidate {
  mode: MatchMode;
}

export interface RoomState {
  roomId: string;
  sessionId: string;
  mode: MatchMode;
  status: "live" | "ended";
  userAId: string;
  userBId: string;
  startedAt: string;
}

export async function joinQueue(user: { id: string }, socketId: string, input: QueueJoinInput): Promise<void> {
  // Idempotent rejoin: drop any stale entry first.
  await leaveQueue(user.id);

  const entry: QueueEntry = {
    userId: user.id,
    socketId,
    mode: input.mode,
    language: input.language,
    interests: input.interests,
    joinedAt: Date.now(),
  };
  await redis
    .pipeline()
    .set(prefKey(user.id), JSON.stringify(entry), "PX", PREF_TTL_MS)
    .zadd(queueKey(input.mode), entry.joinedAt, user.id)
    .exec();
}

export async function leaveQueue(userId: string): Promise<void> {
  await redis
    .pipeline()
    .zrem(queueKey("video"), userId)
    .zrem(queueKey("text"), userId)
    .del(prefKey(userId))
    .exec();
}

async function loadCandidates(mode: MatchMode): Promise<QueueEntry[]> {
  const userIds = await redis.zrange(queueKey(mode), 0, 49);
  if (userIds.length === 0) return [];

  const prefJsons = await redis.mget(...userIds.map(prefKey));
  const entries: QueueEntry[] = [];
  const stale: string[] = [];

  userIds.forEach((userId, i) => {
    const raw = prefJsons[i];
    if (!raw) {
      stale.push(userId);
      return;
    }
    try {
      const entry = JSON.parse(raw) as QueueEntry;
      if (entry.mode === mode) entries.push(entry);
      else stale.push(userId); // pref disagrees with queue → stale
    } catch {
      stale.push(userId);
    }
  });

  if (stale.length > 0) {
    logger.debug({ count: stale.length, mode }, "Purging stale queue entries");
    await redis.pipeline().zrem(queueKey(mode), ...stale).exec();
  }
  return entries;
}

/** Prefetch recent-partner sets so exclusion checks during pairing are sync. */
async function loadRecentPartners(entries: QueueEntry[]): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (entries.length === 0) return map;
  const pipeline = redis.pipeline();
  for (const entry of entries) pipeline.smembers(recentKey(entry.userId));
  const results: Array<[Error | null, unknown]> = (await pipeline.exec()) ?? [];
  entries.forEach((entry, i) => {
    const members = (results[i]?.[1] as string[] | undefined) ?? [];
    map.set(entry.userId, new Set(members));
  });
  return map;
}

export async function markRecentPartners(userAId: string, userBId: string): Promise<void> {
  const ttlSec = Math.ceil(env.RECENT_PARTNER_TTL_MS / 1000);
  await redis
    .pipeline()
    .sadd(recentKey(userAId), userBId)
    .sadd(recentKey(userBId), userAId)
    .expire(recentKey(userAId), ttlSec)
    .expire(recentKey(userBId), ttlSec)
    .exec();
}

async function createMatch(a: Candidate, b: Candidate, mode: MatchMode): Promise<void> {
  const io = getIo();

  const [userA, userB] = await Promise.all([
    getStore().findUserById(a.userId),
    getStore().findUserById(b.userId),
  ]);
  if (!userA || !userB) {
    await leaveQueue(a.userId);
    await leaveQueue(b.userId);
    return;
  }

  const roomId = newRoomId();
  const session = await getStore().createSession({
    roomId,
    mode: mode === "video" ? "VIDEO" : "TEXT",
    userAId: userA.id,
    userBId: userB.id,
  });

  const room: RoomState = {
    roomId,
    sessionId: session.id,
    mode,
    status: "live",
    userAId: userA.id,
    userBId: userB.id,
    startedAt: session.startedAt.toISOString(),
  };

  await redis
    .pipeline()
    .hset(roomKey(roomId), "data", JSON.stringify(room))
    .expire(roomKey(roomId), ROOM_TTL_SEC)
    .set(userRoomKey(userA.id), roomId, "EX", ROOM_TTL_SEC)
    .set(userRoomKey(userB.id), roomId, "EX", ROOM_TTL_SEC)
    .exec();

  await markRecentPartners(userA.id, userB.id);
  await leaveQueue(userA.id);
  await leaveQueue(userB.id);

  // Route both sockets into the room channel before notifying.
  io.in(a.socketId).socketsJoin(roomChannel(roomId));
  io.in(b.socketId).socketsJoin(roomChannel(roomId));

  const partnerFor = (self: typeof userA, other: typeof userB) => ({
    id: other.id,
    displayName: other.displayName,
    language: other.language,
    interests: other.interests,
  });

  io.to(a.socketId).emit("match_found", {
    roomId,
    role: "a" as const,
    mode,
    partner: partnerFor(userA, userB),
  });
  io.to(b.socketId).emit("match_found", {
    roomId,
    role: "b" as const,
    mode,
    partner: partnerFor(userB, userA),
  });

  logger.info({ roomId, mode, a: userA.displayName, b: userB.displayName }, "Match created");
}

async function tick(): Promise<void> {
  for (const mode of ["video", "text"] as const) {
    const entries = await loadCandidates(mode);
    if (entries.length < 2) continue;

    const io = getIo();
    // Drop entries whose socket vanished while queued.
    const alive = entries.filter((e) => io.sockets.sockets.has(e.socketId));
    if (alive.length !== entries.length) {
      const dead = entries.filter((e) => !io.sockets.sockets.has(e.socketId));
      await redis.pipeline().zrem(queueKey(mode), ...dead.map((e) => e.userId)).exec();
    }
    if (alive.length < 2) continue;

    const recent = await loadRecentPartners(alive);
    const pairs = selectPairs(alive, {
      now: Date.now(),
      widenMs: env.MATCH_WIDEN_MS,
      isExcluded: (x, y) => recent.get(x)?.has(y) === true || recent.get(y)?.has(x) === true,
    });

    for (const [a, b] of pairs) {
      try {
        await createMatch(a, b, mode);
      } catch (err) {
        logger.error({ err, a: a.userId, b: b.userId }, "Failed to create match");
      }
    }
  }
}

let timer: NodeJS.Timeout | null = null;

export function startMatchmaker(): void {
  if (timer) return;
  timer = setInterval(() => {
    tick().catch((err) => logger.error({ err }, "Matchmaker tick failed"));
  }, env.MATCH_TICK_MS);
  timer.unref();
  logger.info({ tickMs: env.MATCH_TICK_MS }, "Matchmaker started");
}

export function stopMatchmaker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
