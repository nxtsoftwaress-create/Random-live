import { getRedis } from "./store.js";

/**
 * Legacy access point — now delegates to the store singleton so the rest of
 * the app keeps working unchanged whether the real Redis or the in-memory
 * fallback is active.
 */
export const redis = {
  get: (key: string) => getRedis().get(key),
  mget: (...keys: string[]) => getRedis().mget(...keys),
  set: (key: string, value: string, ...rest: unknown[]) => getRedis().set(key, value, ...rest),
  del: (...keys: string[]) => getRedis().del(...keys),
  expire: (key: string, seconds: number) => getRedis().expire(key, seconds),
  ttl: (key: string) => getRedis().ttl(key),
  incr: (key: string) => getRedis().incr(key),
  hset: (key: string, field: string, value: string) => getRedis().hset(key, field, value),
  hget: (key: string, field: string) => getRedis().hget(key, field),
  zadd: (key: string, score: number, member: string) => getRedis().zadd(key, score, member),
  zrem: (key: string, ...members: string[]) => getRedis().zrem(key, ...members),
  zrange: (key: string, start: number, stop: number) => getRedis().zrange(key, start, stop),
  smembers: (key: string) => getRedis().smembers(key),
  pipeline: () => getRedis().pipeline(),
  ping: () => getRedis().ping(),
  quit: async () => {
    const { closeRealRedis } = await import("./store.js");
    await closeRealRedis();
    return "OK";
  },
};
