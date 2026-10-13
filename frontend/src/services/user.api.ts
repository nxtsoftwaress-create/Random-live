import { api } from "./api";
import type { PublicUser } from "../types/user";

export async function updateMe(patch: {
  language?: string;
  interests?: string[];
}): Promise<{ user: PublicUser }> {
  const res = await api.patch<{ user: PublicUser }>("/users/me", patch);
  return res.data;
}

export interface SessionHistoryItem {
  id: string;
  roomId: string;
  mode: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  endReason: string | null;
  partner: { id: string; displayName: string };
}

export async function listMySessions(): Promise<SessionHistoryItem[]> {
  const res = await api.get<{ sessions: SessionHistoryItem[] }>("/sessions/me");
  return res.data.sessions;
}
