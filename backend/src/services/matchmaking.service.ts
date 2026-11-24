import { redis } from "../config/redis.js";
import { env } from "../config/env.js";
import { getStore } from "../config/store.js";
import { logger } from "../utils/logger.js";
import { newRoomId } from "../utils/ids.js";
import { selectPairs, type Candidate } from "./matchmaking/pairing.js";
import { getActiveRoomForUser } from "./session.service.js";
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
/** Safety expiry for a pairing claim: long enough for a session insert, short
 *  enough that a crashed instance cannot park a user out of the queue. */
const CLAIM_TTL_SEC = 20;

const queueKey = (mode: MatchMode) => `q:${mode}`;
const prefKey = (userId: string) => `q:pref:${userId}`;
const recentKey = (userId: string) => `q:recent:${userId}`;
const roomKey = (roomId: string) => `room:${roomId}`;
const userRoomKey = (userId: string) => `user:room:${userId}`;
const claimKey = (userId: string) => `q:claim:${userId}`;

/**
 * Atomically reserves both users for one pairing pass.
 *
 * Without this, two overlapping ticks (or two instances sharing Redis) could
 * read the same queue snapshot and match the same person into two rooms: the
 * client then received two match_found frames, joined two room channels and
 * the server wrote two sessions — which is what made the app look like it was
 * crashing under load.
 */
async function claimPair(a: Candidate, b: Candidate): Promise<boolean> {
  const first = await redis.set(claimKey(a.userId), "1", "EX", CLAIM_TTL_SEC, "NX");
  if (first !== "OK") return false;
  const second = await redis.set(claimKey(b.userId), "1", "EX", CLAIM_TTL_SEC, "NX");
  if (second !== "OK") {
    await redis.del(claimKey(a.userId));
    return false;
  }
  return true;
}

async function releaseClaims(...userIds: string[]): Promise<void> {
  if (userIds.length > 0) await redis.del(...userIds.map(claimKey));
}

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
  // Oldest-first window of the waiting queue. Configurable so a large queue is
  // not silently capped at a handful of matches per tick.
  const userIds = await redis.zrange(queueKey(mode), 0, env.QUEUE_SCAN_LIMIT - 1);
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

  // One pairing pass owns these two users until it finishes.
  if (!(await claimPair(a, b))) return;
  try {
    await createClaimedMatch(a, b, mode, io);
  } finally {
    await releaseClaims(a.userId, b.userId).catch((err) =>
      logger.warn({ err }, "Failed to release pairing claims"),
    );
  }
}

async function createClaimedMatch(
  a: Candidate,
  b: Candidate,
  mode: MatchMode,
  io: ReturnType<typeof getIo>,
): Promise<void> {
  const [userA, userB] = await Promise.all([
    getStore().findUserById(a.userId),
    getStore().findUserById(b.userId),
  ]);
  if (!userA || !userB) {
    // A user row vanished while queued (in-memory restart). Drop only the dead
    // participant and ask their client to re-authenticate — the survivor keeps
    // their queue place instead of being silently unmatched forever.
    for (const [user, candidate] of [
      [userA, a],
      [userB, b],
    ] as const) {
      if (user) continue;
      await leaveQueue(candidate.userId);
      io.to(candidate.socketId).emit("socket_error", {
        code: "auth_expired",
        message: "Your session expired — reconnecting…",
      });
    }
    return;
  }

  // A stale queue entry (a rejoin, a missed cleanup) must never put someone
  // who is already talking into a second room.
  const [liveA, liveB] = await Promise.all([
    getActiveRoomForUser(a.userId),
    getActiveRoomForUser(b.userId),
  ]);
  if (liveA || liveB) {
    await leaveQueue(liveA ? a.userId : b.userId);
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
      // Random strangers each time, not the same two people at the head of the
      // queue. Fairness comes from the wait-weighted picks in selectPairs.
      rng: Math.random,
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
let running = false;
let stopped = true;

/**
 * Schedules the next pass only after the current one settles.
 *
 * The old `setInterval` fired a new tick every 300 ms whether or not the
 * previous one had finished. With a busy queue (and a Postgres insert per
 * match) ticks piled up: the same candidates were paired repeatedly, sessions
 * were created twice, and the growing promise backlog is what buckled the
 * instance once more than a handful of users were waiting.
 */
function scheduleNext(): void {
  if (stopped) return;
  timer = setTimeout(() => void runTick(), env.MATCH_TICK_MS);
  timer.unref?.();
}

async function runTick(): Promise<void> {
  timer = null;
  if (running) {
    scheduleNext();
    return;
  }
  running = true;
  try {
    await tick();
  } catch (err) {
    logger.error({ err }, "Matchmaker tick failed");
  } finally {
    running = false;
    scheduleNext();
  }
}

export function startMatchmaker(): void {
  if (!stopped) return;
  stopped = false;
  logger.info({ tickMs: env.MATCH_TICK_MS, scanLimit: env.QUEUE_SCAN_LIMIT }, "Matchmaker started");
  void runTick();
}

export function stopMatchmaker(): void {
  stopped = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
