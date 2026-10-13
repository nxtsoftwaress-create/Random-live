import { Router } from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { postGuest, postRefresh, getMe } from "../controllers/auth.controller.js";
import { getProfile, patchProfile } from "../controllers/user.controller.js";
import { listMySessions } from "../controllers/session.controller.js";
import { getHealth } from "../controllers/health.controller.js";

export const apiRouter = Router();

// ── Health ────────────────────────────────────────────────
apiRouter.get("/health", getHealth);

// ── Auth ──────────────────────────────────────────────────
const guestLimiter = rateLimit({ windowMs: 60 * 60_000, max: 60 }); // 60 guests/hour/IP
apiRouter.post("/auth/guest", guestLimiter, postGuest);
apiRouter.post("/auth/refresh", rateLimit({ windowMs: 60_000, max: 30 }), postRefresh);
apiRouter.get("/auth/me", requireAuth, getMe);

// ── Users ─────────────────────────────────────────────────
apiRouter.get("/users/me", requireAuth, getProfile);
apiRouter.patch("/users/me", requireAuth, patchProfile);

// ── Sessions ──────────────────────────────────────────────
apiRouter.get("/sessions/me", requireAuth, listMySessions);
