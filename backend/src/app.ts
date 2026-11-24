import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsOptions } from "./config/cors.js";
import { rateLimit } from "./middleware/rateLimit.js";
import { apiRouter } from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler.js";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: "100kb" }));
  // Global API cap per IP. Generous on purpose: the health-check ping, keep-alive
  // and mobile/CGNAT users can share one address — a tight cap looks like an outage.
  app.use(rateLimit({ windowMs: 60_000, max: 1200 }));

  app.use("/api/v1", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
