import type { Response } from "express";
import { createGuest, rotateRefreshToken, getUserById } from "../services/auth.service.js";
import { refreshSchema } from "../validators/auth.validator.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { unauthorized } from "../utils/errors.js";

/** POST /api/v1/auth/guest */
export async function postGuest(_req: AuthedRequest, res: Response): Promise<void> {
  const { user, tokens } = await createGuest();
  res.status(201).json({ user, ...tokens });
}

/** POST /api/v1/auth/refresh */
export async function postRefresh(req: AuthedRequest, res: Response): Promise<void> {
  const { refreshToken } = refreshSchema.parse(req.body);
  const { user, tokens } = await rotateRefreshToken(refreshToken);
  res.json({ user, ...tokens });
}

/** GET /api/v1/auth/me */
export async function getMe(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const user = await getUserById(req.user.id);
  if (!user) throw unauthorized("Unknown user");
  res.json({ user });
}
