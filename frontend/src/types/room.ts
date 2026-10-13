export interface Partner {
  id: string;
  displayName: string;
  language: string;
  interests: string[];
}

export type RoomPhase =
  | "idle"
  | "searching"
  | "matched"
  | "connecting"
  | "live"
  | "partner_left"
  | "ended";

export type ConnState = RTCPeerConnectionState;

export type IceRoute = "direct" | "relay" | null;
