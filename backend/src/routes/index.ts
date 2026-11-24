import { Router } from "express";
import { rateLimit } from "../middleware/rateLimit.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { postGuest, postRefresh, getMe } from "../controllers/auth.controller.js";
import { getProfile, patchProfile } from "../controllers/user.controller.js";
import { listMySessions } from "../controllers/session.controller.js";
import { getHealth } from "../controllers/health.controller.js";

export const apiRouter = Router();

// ── Health ────────────────────────────────────────────────
apiRouter.get("/health", asyncHandler(getHealth));

// ── Auth ──────────────────────────────────────────────────
// Guests are cheap; the old 60/hour/IP cap locked out everyone behind a
// carrier-grade NAT or shared office/mobile IP. 400/hour still stops abuse.
const guestLimiter = rateLimit({ windowMs: 60 * 60_000, max: 400 });
apiRouter.post("/auth/guest", guestLimiter, asyncHandler(postGuest));
apiRouter.post("/auth/refresh", rateLimit({ windowMs: 60_000, max: 60 }), asyncHandler(postRefresh));
apiRouter.get("/auth/me", requireAuth, asyncHandler(getMe));

// ── Users ─────────────────────────────────────────────────
apiRouter.get("/users/me", requireAuth, asyncHandler(getProfile));
apiRouter.patch("/users/me", requireAuth, asyncHandler(patchProfile));

// ── Sessions ──────────────────────────────────────────────
apiRouter.get("/sessions/me", requireAuth, asyncHandler(listMySessions));
