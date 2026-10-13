import { Redis } from "ioredis";
import type {
  User,
  Session,
  Message,
  SessionMode,
  EndReason,
} from "@prisma/client";
import { prisma } from "./prisma.js";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";
import { MemRedis } from "./mem-redis.js";
import type { RedisLike } from "./redis-like.js";

/**
 * Data-store abstraction with automatic fallback.
 *
 *   PostgreSQL (Prisma)  ← used when DATABASE_URL answers (production / docker)
 *   MemoryStore          ← automatic fallback (sandbox / no-docker demos)
 *
 *   Redis (ioredis)      ← used when REDIS_URL answers
 *   MemRedis             ← automatic fallback
 *
 * Services call getStore() / getRedis() and never know which is active.
 */

export interface StoreUser {
  id: string;
  isGuest: boolean;
  displayName: string;
  language: string;
  interests: string[];
  status: "ACTIVE" | "BANNED" | "DELETED";
  createdAt: Date;
  updatedAt: Date;
}

export interface StoreSession {
  id: string;
  roomId: string;
  mode: SessionMode;
  userAId: string;
  userBId: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSec: number | null;
  endReason: EndReason | null;
}

export interface StoreMessage {
  id: string;
  sessionId: string;
  senderId: string;
  body: string;
  createdAt: Date;
}

export interface DataStore {
  createUser(data: { displayName: string; isGuest?: boolean }): Promise<StoreUser>;
  findUserById(id: string): Promise<StoreUser | null>;
  updateUser(
    id: string,
    data: { language?: string; interests?: string[]; displayName?: string },
  ): Promise<StoreUser>;

  createSession(data: {
    roomId: string;
    mode: SessionMode;
    userAId: string;
    userBId: string;
  }): Promise<StoreSession>;
  updateSessionEnd(
    id: string,
    data: { endedAt: Date; durationSec: number; endReason: EndReason },
  ): Promise<void>;
  listUserSessions(
    userId: string,
    take: number,
  ): Promise<Array<StoreSession & { partner: { id: string; displayName: string } }>>;

  createMessage(data: { sessionId: string; senderId: string; body: string }): Promise<StoreMessage>;
}

// ── Prisma implementation ────────────────────────────────────────────────

type PrismaTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export class PrismaStore implements DataStore {
  async createUser(data: { displayName: string; isGuest?: boolean }): Promise<StoreUser> {
    return prisma.user.create({ data: { displayName: data.displayName, isGuest: data.isGuest ?? true } });
  }

  async findUserById(id: string): Promise<StoreUser | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  async updateUser(
    id: string,
    data: { language?: string; interests?: string[]; displayName?: string },
  ): Promise<StoreUser> {
    return prisma.user.update({ where: { id }, data });
  }

  async createSession(data: {
    roomId: string;
    mode: SessionMode;
    userAId: string;
    userBId: string;
  }): Promise<StoreSession> {
    return prisma.session.create({ data });
  }

  async updateSessionEnd(
    id: string,
    data: { endedAt: Date; durationSec: number; endReason: EndReason },
  ): Promise<void> {
    await prisma.session.update({ where: { id }, data });
  }

  async listUserSessions(
    userId: string,
    take: number,
  ): Promise<Array<StoreSession & { partner: { id: string; displayName: string } }>> {
    const rows = await prisma.session.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      orderBy: { startedAt: "desc" },
      take,
      include: {
        userA: { select: { id: true, displayName: true } },
        userB: { select: { id: true, displayName: true } },
      },
    });
    return rows.map((s) => ({
      ...s,
      partner:
        s.userA.id === userId
          ? { id: s.userB.id, displayName: s.userB.displayName }
          : { id: s.userA.id, displayName: s.userA.displayName },
    }));
  }

  async createMessage(data: { sessionId: string; senderId: string; body: string }): Promise<StoreMessage> {
    return prisma.message.create({ data });
  }
}

// ── In-memory implementation ─────────────────────────────────────────────

let seq = 0;
function memId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export class MemoryStore implements DataStore {
  private users = new Map<string, StoreUser>();
  private sessions = new Map<string, StoreSession>();
  private messages = new Map<string, StoreMessage>();

  async createUser(data: { displayName: string; isGuest?: boolean }): Promise<StoreUser> {
    const now = new Date();
    const user: StoreUser = {
      id: memId("usr"),
      isGuest: data.isGuest ?? true,
      displayName: data.displayName,
      language: "en",
      interests: [],
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async findUserById(id: string): Promise<StoreUser | null> {
    return this.users.get(id) ?? null;
  }

  async updateUser(
    id: string,
    data: { language?: string; interests?: string[]; displayName?: string },
  ): Promise<StoreUser> {
    const user = this.users.get(id);
    if (!user) throw new Error(`Unknown user ${id}`);
    const updated: StoreUser = { ...user, ...data, updatedAt: new Date() };
    this.users.set(id, updated);
    return updated;
  }

  async createSession(data: {
    roomId: string;
    mode: SessionMode;
    userAId: string;
    userBId: string;
  }): Promise<StoreSession> {
    const session: StoreSession = {
      id: memId("ses"),
      roomId: data.roomId,
      mode: data.mode,
      userAId: data.userAId,
      userBId: data.userBId,
      startedAt: new Date(),
      endedAt: null,
      durationSec: null,
      endReason: null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async updateSessionEnd(
    id: string,
    data: { endedAt: Date; durationSec: number; endReason: EndReason },
  ): Promise<void> {
    const s = this.sessions.get(id);
    if (!s) return; // matches prisma P2025 tolerance in endSession
    this.sessions.set(id, { ...s, ...data });
  }

  async listUserSessions(
    userId: string,
    take: number,
  ): Promise<Array<StoreSession & { partner: { id: string; displayName: string } }>> {
    const rows = [...this.sessions.values()]
      .filter((s) => s.userAId === userId || s.userBId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .slice(0, take);
    return rows.map((s) => {
      const partnerId = s.userAId === userId ? s.userBId : s.userAId;
      const partner = this.users.get(partnerId);
      return {
        ...s,
        partner: { id: partnerId, displayName: partner?.displayName ?? "Unknown" },
      };
    });
  }

  async createMessage(data: { sessionId: string; senderId: string; body: string }): Promise<StoreMessage> {
    const message: StoreMessage = {
      id: memId("msg"),
      sessionId: data.sessionId,
      senderId: data.senderId,
      body: data.body,
      createdAt: new Date(),
    };
    this.messages.set(message.id, message);
    return message;
  }
}

// ── Detection + singletons ───────────────────────────────────────────────

export type RedisState = "connecting" | "redis" | "memory";

let redis: RedisLike = new MemRedis();
let redisState: RedisState = "connecting";
let realRedis: Redis | null = null;

async function probeRealRedis(url: string, timeoutMs = 1200): Promise<Redis | null> {
  const candidate = new Redis(url, {
    lazyConnect: true,
    connectTimeout: timeoutMs,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null, // never auto-reconnect — fallback stays put
  });
  try {
    await candidate.connect();
    await candidate.ping();
    return candidate;
  } catch {
    try {
      candidate.disconnect();
    } catch {
      /* noop */
    }
    return null;
  }
}

export async function initStores(): Promise<{ redis: RedisState; db: "postgres" | "memory" }> {
  if (env.PERSISTENCE === "memory") {
    redis = new MemRedis();
    redisState = "memory";
    store = new MemoryStore();
    logger.info("Storage: db=memory redis=memory (PERSISTENCE=memory)");
    return { redis: redisState, db: "memory" };
  }

  // Redis first: if reachable, use the real client.
  const probe = await probeRealRedis(env.REDIS_URL);
  if (probe) {
    realRedis = probe;
    redis = probe as unknown as RedisLike;
    redisState = "redis";
  } else if (env.PERSISTENCE === "real") {
    throw new Error(`PERSISTENCE=real but REDIS_URL (${env.REDIS_URL}) is unreachable`);
  } else {
    redis = new MemRedis();
    redisState = "memory";
  }

  // Postgres probe: cheap SELECT 1 with a short connect window.
  let db: "postgres" | "memory" = "memory";
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
    ]);
    db = "postgres";
  } catch {
    if (env.PERSISTENCE === "real") {
      throw new Error("PERSISTENCE=real but DATABASE_URL is unreachable");
    }
    db = "memory";
  }

  store = db === "postgres" ? new PrismaStore() : new MemoryStore();

  if (redisState === "memory" || db === "memory") {
    logger.warn(
      `⚠️  Falling back to in-memory stores — redis: ${redisState}, db: ${db}. ` +
        `Data resets on restart. Set DATABASE_URL / REDIS_URL to a live service for persistence.`,
    );
  }

  return { redis: redisState, db };
}

let store: DataStore = new MemoryStore();

export function getStore(): DataStore {
  return store;
}

export function getRedis(): RedisLike {
  return redis;
}

export function getRedisState(): RedisState {
  return redisState;
}

/** Test hook — swap the active store. */
export function setStore(s: DataStore): void {
  store = s;
}

/** Close the real redis client if one is connected. */
export async function closeRealRedis(): Promise<void> {
  if (realRedis) {
    try {
      await realRedis.quit();
    } catch {
      realRedis?.disconnect();
    }
    realRedis = null;
  }
}

export type { User, Session, Message, SessionMode, EndReason };
