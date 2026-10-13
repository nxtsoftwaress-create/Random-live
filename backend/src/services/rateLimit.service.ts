import { redis } from "../config/redis.js";

export interface RateResult {
  allowed: boolean;
  retryAfterSec: number;
}

/**
 * Fixed-window counter (Redis or in-memory fallback) — used for chat flood
 * control and safe across multiple backend instances when Redis is active.
 */
export async function consumeRate(
  scope: string,
  limit: number,
  windowSec: number,
): Promise<RateResult> {
  const bucketKey = `rl:${scope}`;
  const count = await redis.incr(bucketKey);
  if (count === 1) {
    await redis.expire(bucketKey, windowSec);
  }
  if (count > limit) {
    const ttl = await redis.ttl(bucketKey);
    return { allowed: false, retryAfterSec: ttl > 0 ? ttl : windowSec };
  }
  return { allowed: true, retryAfterSec: 0 };
}
