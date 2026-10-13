import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../utils/jwt.js";
import { unauthorized } from "../utils/errors.js";

export interface AuthedRequest extends Request {
  user?: { id: string; displayName: string; isGuest: boolean };
}

/** Verifies the Bearer access token and attaches the user. */
export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next(unauthorized());
  try {
    const payload = verifyAccessToken(header.slice("Bearer ".length));
    req.user = { id: payload.sub, displayName: payload.displayName, isGuest: payload.isGuest };
    next();
  } catch {
    next(unauthorized("Invalid or expired token"));
  }
}
