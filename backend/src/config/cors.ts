import type { CorsOptions } from "cors";
import { env } from "./env.js";

/** REST + Socket.IO CORS policy — locked to configured client origins. */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser clients (health checks, curl) and configured origins.
    // Dev convenience: Vite may bump ports (5174…) and pages may run on either
    // loopback host (localhost or 127.0.0.1).
    const devOrigin = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin ?? "");
    if (!origin || devOrigin || env.clientOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PATCH", "DELETE"],
  credentials: true,
};
