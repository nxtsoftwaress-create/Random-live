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

/** Assembles the full server (REST + Socket.IO). Reused by integration tests. */
export function buildServer(): { httpServer: http.Server; io: ReturnType<typeof createSocketServer> } {
  const app = createApp();
  const httpServer = http.createServer(app);
  const io = createSocketServer(httpServer);
  return { httpServer, io };
}

async function boot(): Promise<void> {
  // Probe Postgres/Redis; falls back to in-memory stores when unreachable.
  const modes = await initStores();

  const { httpServer } = buildServer();
  startMatchmaker();

  await new Promise<void>((resolve) => {
    httpServer.listen(env.PORT, () => resolve());
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

// Run the server unless imported by the test suite.
if (!process.env.VITEST) {
  boot().catch((err) => {
    logger.error({ err }, "Fatal boot error");
    process.exit(1);
  });
}
