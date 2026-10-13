import type { Response } from "express";
import { getStore } from "../config/store.js";
import type { AuthedRequest } from "../middleware/auth.js";
import { unauthorized } from "../utils/errors.js";

/** GET /api/v1/sessions/me — the user's most recent chat sessions. */
export async function listMySessions(req: AuthedRequest, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();

  const sessions = await getStore().listUserSessions(req.user.id, 20);

  res.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      roomId: s.roomId,
      mode: s.mode.toLowerCase(),
      startedAt: s.startedAt.toISOString(),
      endedAt: s.endedAt?.toISOString() ?? null,
      durationSec: s.durationSec,
      endReason: s.endReason?.toLowerCase() ?? null,
      partner: s.partner,
    })),
  });
}
