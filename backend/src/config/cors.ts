import type { CorsOptions } from "cors";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/** Every deployment of this project on Vercel (prod alias + branch previews). */
const VERCEL_PROJECT_ORIGIN = /^https:\/\/random-live[a-z0-9-]*\.vercel\.app$/;

function isAllowed(origin: string): boolean {
  if (env.clientOrigins.includes(origin)) return true;
  if (VERCEL_PROJECT_ORIGIN.test(origin)) return true;
  // Dev convenience: Vite may bump ports and pages may run on either loopback host.
  return /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

/** REST + Socket.IO CORS policy — locked to the app's own origins. */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Non-browser clients (health checks, curl, server-to-server) send no Origin.
    if (!origin) return callback(null, true);
    if (isAllowed(origin)) return callback(null, true);
    // A rejected origin is otherwise invisible in the browser and looks like
    // "the site is down" — log it once so it can be fixed at the source.
    logger.warn({ origin }, "Blocked CORS origin");
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  credentials: true,
};
