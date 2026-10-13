import { create } from "zustand";
import type { ChatMessage } from "../types/chat";
import type {
  ConnState,
  IceRoute,
  Partner,
  RoomPhase,
} from "../types/room";
import type {
  MatchFoundPayload,
  MatchMode,
  PartnerLeftReason,
} from "../types/socket";

interface RoomState {
  phase: RoomPhase;
  roomId: string | null;
  role: "a" | "b" | null;
  mode: MatchMode;
  partner: Partner | null;

  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connection: ConnState;
  iceRoute: IceRoute;

  partnerAudioMuted: boolean;
  partnerVideoMuted: boolean;
  partnerTyping: boolean;

  messages: ChatMessage[];
  startedAt: number | null;
  lastPartnerLeftReason: PartnerLeftReason | null;

  applyMatch: (payload: MatchFoundPayload) => void;
  setPhase: (phase: RoomPhase) => void;
  setLocalStream: (stream: MediaStream | null) => void;
  setRemoteStream: (stream: MediaStream | null) => void;
  setConnection: (connection: ConnState) => void;
  setIceRoute: (route: IceRoute) => void;
  setPartnerMedia: (audioMuted: boolean, videoMuted: boolean) => void;
  setPartnerTyping: (typing: boolean) => void;
  setLastPartnerLeftReason: (reason: PartnerLeftReason) => void;
  addMessage: (message: ChatMessage) => void;
  reset: () => void;
}

const initial = {
  phase: "idle" as RoomPhase,
  roomId: null,
  role: null,
  mode: "video" as MatchMode,
  partner: null,
  localStream: null,
  remoteStream: null,
  connection: "new" as ConnState,
  iceRoute: null,
  partnerAudioMuted: false,
  partnerVideoMuted: false,
  partnerTyping: false,
  messages: [],
  startedAt: null,
  lastPartnerLeftReason: null,
};

export const useRoomStore = create<RoomState>((set) => ({
  ...initial,

  applyMatch: (payload) =>
    set({
      phase: "matched",
      roomId: payload.roomId,
      role: payload.role,
      mode: payload.mode,
      partner: payload.partner,
      messages: [],
      connection: "new",
      iceRoute: null,
      partnerAudioMuted: false,
      partnerVideoMuted: false,
      partnerTyping: false,
      startedAt: Date.now(),
      lastPartnerLeftReason: null,
    }),

  setPhase: (phase) => set({ phase }),
  setLocalStream: (localStream) => set({ localStream }),
  setRemoteStream: (remoteStream) => set({ remoteStream }),
  setConnection: (connection) => set({ connection }),
  setIceRoute: (iceRoute) => set({ iceRoute }),
  setPartnerMedia: (partnerAudioMuted, partnerVideoMuted) =>
    set({ partnerAudioMuted, partnerVideoMuted }),
  setPartnerTyping: (partnerTyping) => set({ partnerTyping }),
  setLastPartnerLeftReason: (lastPartnerLeftReason) => set({ lastPartnerLeftReason }),

  addMessage: (message) => set((s) => ({ messages: [...s.messages, message] })),

  reset: () => set({ ...initial }),
}));
