import http from "node:http";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { createApp } from "./app.js";
import { createSocketServer } from "./websocket/socket.js";
import { startMatchmaker, stopMatchmaker } from "./services/matchmaking.service.js";
import { prisma } from "./config/prisma.js";
import { closeRealRedis, initStores } from "./config/store.js";

export interface RunningServer {
  httpServer: http.Server;
  close: () => Promise<void>;
}

/**
 * Last line of defence against a process exit.
 *
 * Render reports any crash as "Exited with status 1" and every connected user
 * is dropped (memory-mode data goes with them). A single stray rejected promise
 * — an async socket handler, a Redis hiccup, one bad frame — used to be enough
 * to do that. Log loudly and keep serving instead: a degraded instance beats a
 * dead one.
 */
function installProcessGuards(): void {
  process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "Unhandled promise rejection (continuing)");
  });
  process.on("uncaughtException", (err) => {
    logger.error({ err }, "Uncaught exception (continuing)");
  });
}

/** Assembles the full server (REST + Socket.IO). Reused by integration tests. */
export function buildServer(): { httpServer: http.Server; io: ReturnType<typeof createSocketServer> } {
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  return { httpServer, io };
}

async function bootOnce(): Promise<void> {
  // Probe Postgres/Redis; falls back to in-memory stores when unreachable.
  const modes = await initStores();

  const { httpServer } = buildServer();
  startMatchmaker();

  httpServer.on("error", (err) => {
    logger.error({ err }, "HTTP server error");
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(env.PORT, () => {
      httpServer.off("error", reject);
      resolve();
    });
  });

  logger.info(
    `🚀 Random Live backend ready — REST + Socket.IO on :${env.PORT} (${env.NODE_ENV})`,
  );
  logger.info(`   Storage: db=${modes.db} redis=${modes.redis}`);
  logger.info(`   Client origin: ${env.clientOrigins.join(", ")}`);
  logger.info(`   STUN: ${env.stunServers.join(", ")}`);
  logger.info(`   TURN: ${env.turn ? env.turn.url : "not configured (direct P2P + STUN only)"}`);

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received — shutting down gracefully…`);
    stopMatchmaker();
    httpServer.close(() => {
      void (async () => {
        await closeRealRedis();
        try {
          await prisma.$disconnect();
        } catch {
          /* prisma not connected (memory mode) */
        }
        process.exit(0);
      })();
    });
    // Force-exit safety net
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

/** A transient store/blip at boot should not cost a full redeploy. */
async function boot(attempt = 1): Promise<void> {
  try {
    await bootOnce();
  } catch (err) {
    if (attempt >= 3) throw err;
    const delayMs = 1000 * attempt;
    logger.error({ err, attempt }, `Boot failed — retrying in ${delayMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    await boot(attempt + 1);
  }
}

// Run the server unless imported by the test suite.
if (!process.env.VITEST) {
  installProcessGuards();
  boot().catch((err) => {
    logger.error({ err }, "Fatal boot error");
    process.exit(1);
  });
}
