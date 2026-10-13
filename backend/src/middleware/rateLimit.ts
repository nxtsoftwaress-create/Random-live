import type { NextFunction, Request, Response } from "express";

interface Bucket {
  hits: number[];
}

/**
 * Simple in-process sliding-window limiter — right-sized for the single-node
 * MVP. Horizontal scaling swaps this for the shared Redis limiter (see
 * services/rateLimit.service.ts used for chat).
 */
export function rateLimit(opts: {
  windowMs: number;
  max: number;
  keyFn?: (req: Request) => string;
}) {
  const buckets = new Map<string, Bucket>();

  // periodic cleanup so the map doesn't grow forever
  const sweep = setInterval(() => {
    const cutoff = Date.now() - opts.windowMs;
    for (const [key, bucket] of buckets) {
      bucket.hits = bucket.hits.filter((t) => t > cutoff);
      if (bucket.hits.length === 0) buckets.delete(key);
    }
  }, Math.max(opts.windowMs, 30_000));
  sweep.unref?.();

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = opts.keyFn ? opts.keyFn(req) : (req.ip ?? "unknown");
    const now = Date.now();
    const cutoff = now - opts.windowMs;

    const bucket = buckets.get(key) ?? { hits: [] };
    bucket.hits = bucket.hits.filter((t) => t > cutoff);

    if (bucket.hits.length >= opts.max) {
      res.status(429).json({ error: { code: "rate_limited", message: "Too many requests" } });
      return;
    }
    bucket.hits.push(now);
    buckets.set(key, bucket);
    next();
  };
}
