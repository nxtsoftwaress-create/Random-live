/**
 * Minimal Redis-like interface — the subset of ioredis the app uses.
 * Implemented by the real ioredis client and by MemRedis (in-memory
 * fallback), so services never know or care which one is active.
 */
export interface ExecResult {
  err: Error | null;
  res: unknown;
}

export interface PipelineLike {
  set(key: string, value: string, ...rest: unknown[]): PipelineLike;
  hset(key: string, field: string, value: string): PipelineLike;
  expire(key: string, seconds: number): PipelineLike;
  del(...keys: string[]): PipelineLike;
  zadd(key: string, score: number, member: string): PipelineLike;
  zrem(key: string, ...members: string[]): PipelineLike;
  sadd(key: string, member: string): PipelineLike;
  smembers(key: string): PipelineLike;
  exec(): Promise<Array<[Error | null, unknown]>>;
}

export interface RedisLike {
  get(key: string): Promise<string | null>;
  mget(...keys: string[]): Promise<Array<string | null>>;
  set(key: string, value: string, ...rest: unknown[]): Promise<"OK" | null>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  incr(key: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<number>;
  hget(key: string, field: string): Promise<string | null>;
  zadd(key: string, score: number, member: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  zrange(key: string, start: number, stop: number): Promise<string[]>;
  smembers(key: string): Promise<string[]>;
  pipeline(): PipelineLike;
  ping(): Promise<string>;
  quit(): Promise<string>;
}
