import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Express 4 does not catch rejected promises from async handlers. Without this
 * wrapper a single failed `await` becomes an unhandled rejection, and Node ≥15
 * turns that into `process.exit(1)` — which on Render means the whole instance
 * (and every connected user) dies. Wrap every async controller with this.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => unknown | Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
