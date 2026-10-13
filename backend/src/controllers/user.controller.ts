import type { Response } from "express";
import { getStore } from "../config/store.js";
import { patchMeSchema } from "../validators/auth.validator.js";
import { toPublicUser } from "../services/auth.service.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { unauthorized } from "../utils/errors.js";

/** GET /api/v1/users/me */
export async function getProfile(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const user = await getStore().findUserById(req.user.id);
  if (!user) throw unauthorized("Unknown user");
  res.json({ user: toPublicUser(user) });
}

/** PATCH /api/v1/users/me — persist preferences (language, interests, name). */
export async function patchProfile(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const data = patchMeSchema.parse(req.body);
  const user = await getStore().updateUser(req.user.id, data);
  res.json({ user: toPublicUser(user) });
}
