import type { ExecResult, PipelineLike, RedisLike } from "./redis-like.js";

/** Internal entry: value + optional absolute expiry (epoch ms). */
interface Entry {
  value: string;
  expiresAt: number | null;
}

function isLive(entry: Entry | undefined): entry is Entry {
  if (!entry) return false;
  if (entry.expiresAt === null) return true;
  return entry.expiresAt > Date.now();
}

interface ZSet {
  score: number;
  member: string;
}

/** In-memory pipeline honoring command order — semantics match ioredis. */
class MemPipeline implements PipelineLike {
  private ops: Array<() => ExecResult> = [];

  constructor(private store: MemRedis) {}

  set(key: string, value: string, ...rest: unknown[]): PipelineLike {
    this.ops.push(() => {
      this.store.cmdSet(key, value, rest);
      return { err: null, res: "OK" };
    });
    return this;
  }
  hset(key: string, field: string, value: string): PipelineLike {
    this.ops.push(() => ({ err: null, res: this.store.cmdHset(key, field, value) }));
    return this;
  }
  expire(key: string, seconds: number): PipelineLike {
    this.ops.push(() => ({ err: null, res: this.store.cmdExpire(key, seconds) }));
    return this;
  }
  del(...keys: string[]): PipelineLike {
    this.ops.push(() => ({ err: null, res: this.store.cmdDel(...keys) }));
    return this;
  }
  zadd(key: string, score: number, member: string): PipelineLike {
    this.ops.push(() => ({ err: null, res: this.store.cmdZadd(key, score, member) }));
    return this;
  }
  zrem(key: string, ...members: string[]): PipelineLike {
    this.ops.push(() => ({ err: null, res: this.store.cmdZrem(key, ...members) }));
    return this;
  }
  sadd(key: string, member: string): PipelineLike {
    this.ops.push(() => ({ err: null, res: this.store.cmdSadd(key, member) }));
    return this;
  }
  smembers(key: string): PipelineLike {
    this.ops.push(() => ({ err: null, res: this.store.cmdSmembers(key) }));
    return this;
  }
  async exec(): Promise<Array<[Error | null, unknown]>> {
    const results: Array<[Error | null, unknown]> = this.ops.map((op) => {
      const r = op();
      return [r.err, r.res];
    });
    this.ops = [];
    return results;
  }
}

/**
 * Single-process in-memory Redis replacement — used automatically when the
 * configured REDIS_URL is unreachable (no Docker, sandboxed CI, quick demos).
 * Semantics: TTL via lazy eviction, sorted sets, sets, hashes, pipelines.
 */
export class MemRedis implements RedisLike {
  private strings = new Map<string, Entry>();
  private hashes = new Map<string, Map<string, string>>();
  private zsets = new Map<string, Map<string, number>>();
  private sets = new Map<string, Set<string>>();
  /** Collection TTLs (hashes/sets/zsets). Real Redis expires these too —
   *  without tracking them here, `room:{id}` hashes and `q:recent:{user}`
   *  sets lived for the whole process and slowly OOM'd the instance. */
  private expiries = new Map<string, number>();

  /** Evicts a collection whose TTL has passed. */
  private expired(key: string): boolean {
    const at = this.expiries.get(key);
    if (at === undefined || at > Date.now()) return false;
    this.hashes.delete(key);
    this.zsets.delete(key);
    this.sets.delete(key);
    this.strings.delete(key);
    this.expiries.delete(key);
    return true;
  }

  /** Drops everything past its TTL. Called on a timer by initStores(). */
  sweep(): void {
    for (const [key, at] of this.expiries) {
      if (at <= Date.now()) this.expired(key);
    }
    const now = Date.now();
    for (const [key, entry] of this.strings) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) this.strings.delete(key);
    }
  }

  /** Approximate key count — used for leak diagnostics. */
  size(): number {
    return this.strings.size + this.hashes.size + this.zsets.size + this.sets.size;
  }

  // ── string ────────────────────────────────────────────────
  async get(key: string): Promise<string | null> {
    const e = this.strings.get(key);
    if (!isLive(e)) {
      this.strings.delete(key);
      return null;
    }
    return e.value;
  }

  async mget(...keys: string[]): Promise<Array<string | null>> {
    return keys.map((k) => {
      const e = this.strings.get(k);
      if (!isLive(e)) {
        if (e) this.strings.delete(k);
        return null;
      }
      return e.value;
    });
  }

  async set(key: string, value: string, ...rest: unknown[]): Promise<"OK" | null> {
    this.cmdSet(key, value, rest);
    return "OK";
  }

  cmdSet(key: string, value: string, rest: unknown[]): "OK" | null {
    // supports: SET key val EX s | PX ms | NX
    let expiresAt: number | null = null;
    let nx = false;
    for (let i = 0; i < rest.length; i++) {
      const flag = String(rest[i]).toUpperCase();
      if (flag === "EX") expiresAt = Date.now() + Number(rest[i + 1]) * 1000;
      if (flag === "PX") expiresAt = Date.now() + Number(rest[i + 1]);
      if (flag === "NX") nx = true;
    }
    const existing = this.strings.get(key);
    if (nx && isLive(existing)) return null;
    this.strings.set(key, { value, expiresAt });
    return "OK";
  }

  async del(...keys: string[]): Promise<number> {
    return this.cmdDel(...keys);
  }

  cmdDel(...keys: string[]): number {
    let n = 0;
    for (const k of keys) {
      if (this.strings.delete(k)) n++;
      if (this.hashes.delete(k)) n++;
      if (this.zsets.delete(k)) n++;
      if (this.sets.delete(k)) n++;
      this.expiries.delete(k);
    }
    return n;
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.cmdExpire(key, seconds);
  }

  cmdExpire(key: string, seconds: number): number {
    const at = Date.now() + seconds * 1000;
    const e = this.strings.get(key);
    if (isLive(e)) {
      e.expiresAt = at;
      return 1;
    }
    // Hashes / sets / zsets expire through the side table.
    const exists =
      this.hashes.has(key) || this.sets.has(key) || this.zsets.has(key);
    if (!exists) return 0;
    this.expiries.set(key, at);
    return 1;
  }

  async ttl(key: string): Promise<number> {
    const e = this.strings.get(key);
    if (!isLive(e)) return -2;
    if (e.expiresAt === null) return -1;
    return Math.ceil((e.expiresAt - Date.now()) / 1000);
  }

  async incr(key: string): Promise<number> {
    const e = this.strings.get(key);
    const next = (isLive(e) ? Number(e.value) : 0) + 1;
    this.strings.set(key, { value: String(next), expiresAt: e && isLive(e) ? e.expiresAt : null });
    return next;
  }

  // ── hash ──────────────────────────────────────────────────
  async hset(key: string, field: string, value: string): Promise<number> {
    return this.cmdHset(key, field, value);
  }

  cmdHset(key: string, field: string, value: string): number {
    this.expired(key);
    let h = this.hashes.get(key);
    if (!h) {
      h = new Map();
      this.hashes.set(key, h);
    }
    const added = h.has(field) ? 0 : 1;
    h.set(field, value);
    return added;
  }

  async hget(key: string, field: string): Promise<string | null> {
    if (this.expired(key)) return null;
    return this.hashes.get(key)?.get(field) ?? null;
  }

  // ── sorted set ────────────────────────────────────────────
  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.cmdZadd(key, score, member);
  }

  cmdZadd(key: string, score: number, member: string): number {
    this.expired(key);
    let z = this.zsets.get(key);
    if (!z) {
      z = new Map();
      this.zsets.set(key, z);
    }
    const added = z.has(member) ? 0 : 1;
    z.set(member, score);
    return added;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.cmdZrem(key, ...members);
  }

  cmdZrem(key: string, ...members: string[]): number {
    const z = this.zsets.get(key);
    if (!z) return 0;
    let n = 0;
    for (const m of members) if (z.delete(m)) n++;
    return n;
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    if (this.expired(key)) return [];
    const z = this.zsets.get(key);
    if (!z) return [];
    const sorted = [...z.entries()].sort((a, b) => a[1] - b[1]).map(([m]) => m);
    // Redis semantics: negative stop = from the end; inclusive range.
    const len = sorted.length;
    let s = start < 0 ? Math.max(0, len + start) : start;
    let e = stop < 0 ? len + stop + 1 : Math.min(len, stop + 1);
    if (s > e) s = e;
    return sorted.slice(s, e);
  }

  // ── set ───────────────────────────────────────────────────
  async smembers(key: string): Promise<string[]> {
    return this.cmdSmembers(key);
  }

  cmdSmembers(key: string): string[] {
    if (this.expired(key)) return [];
    return [...(this.sets.get(key) ?? [])];
  }

  cmdSadd(key: string, member: string): number {
    this.expired(key);
    let s = this.sets.get(key);
    if (!s) {
      s = new Set();
      this.sets.set(key, s);
    }
    const added = s.has(member) ? 0 : 1;
    s.add(member);
    return added;
  }

  pipeline(): PipelineLike {
    return new MemPipeline(this);
  }

  async ping(): Promise<string> {
    return "PONG";
  }

  async quit(): Promise<string> {
    return "OK";
  }
}
