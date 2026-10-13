import type { Response } from "express";
import { getRedis, getRedisState, getStore } from "../config/store.js";

async function probe(check: () => Promise<unknown>, timeoutMs = 1500): Promise<"up" | "down"> {
  try {
    await Promise.race([
      check(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    return "up";
  } catch {
    return "down";
  }
}

/** GET /api/v1/health */
export async function getHealth(_req: unknown, res: Response): Promise<void> {
  const [redisUp, dbUp] = await Promise.all([
    probe(() => getRedis().ping()),
    probe(() => getStore().findUserById("__health_probe__")),
  ]);

  const ok = redisUp === "up" && dbUp === "up";
  res.status(ok ? 200 : 503).json({
    ok,
    uptimeSec: Math.round(process.uptime()),
    services: {
      db: dbUp,
      redis: redisUp,
      dbMode: dbUp === "up" ? (getStore().constructor.name === "PrismaStore" ? "postgres" : "memory") : "down",
      redisMode: getRedisState(),
    },
    version: "0.1.0",
  });
}
