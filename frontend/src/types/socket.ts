import type { Partner } from "./room";

export type MatchMode = "video" | "text";
export type MatchRole = "a" | "b";
export type PartnerLeftReason = "next" | "ended" | "disconnect";

// ── Server → Client ─────────────────────────────────────────
export interface MatchFoundPayload {
  roomId: string;
  role: MatchRole;
  mode: MatchMode;
  partner: Partner;
}

export interface PartnerLeftPayload {
  reason: PartnerLeftReason;
}

export interface SessionEndedPayload {
  roomId: string;
  reason: "next" | "ended";
}

export interface SearchStartedPayload {
  mode: MatchMode;
  language: string;
}

export interface MediaStatePayload {
  audioMuted: boolean;
  videoMuted: boolean;
}

export interface TypingPayload {
  userId: string;
}

export interface ChatErrorPayload {
  code: string;
  message: string;
}

export interface SocketErrorPayload {
  code: string;
  message: string;
}

export interface SignalPayload {
  from: string;
  sdp: string;
}

export interface IcePayload {
  from: string;
  candidate: RTCIceCandidateInit | null;
}

// ── Ack results ─────────────────────────────────────────────
export interface AckResult {
  ok: boolean;
  error?: { code: string; message: string };
}
