import type { Socket } from "socket.io";
import {
  signalingSchema,
  iceCandidateSchema,
  mediaStateSchema,
} from "../validators/socket.validator.js";
import { getActiveRoomForUser } from "../services/session.service.js";
import { roomChannel } from "./io.js";
import { emitError } from "./socket.js";

/**
 * Pure signaling relay: the server routes SDP/ICE/media-state between the two
 * authorized room participants and never inspects media itself.
 */
export function registerWebRtcHandlers(socket: Socket): void {
  const user = socket.data.user;

  /** Confirms the sender owns a live membership in this room. */
  const guard = async (roomId: string): Promise<boolean> => {
    const room = await getActiveRoomForUser(user.id);
    if (!room || room.roomId !== roomId) {
      emitError(socket, "not_in_room", "You are not in this room");
      return false;
    }
    return true;
  };

  socket.on("webrtc_offer", async (payload: unknown) => {
    const parsed = signalingSchema.safeParse(payload);
    if (!parsed.success || !(await guard(parsed.data.roomId))) return;
    socket.to(roomChannel(parsed.data.roomId)).emit("webrtc_offer", {
      from: user.id,
      sdp: parsed.data.sdp,
    });
  });

  socket.on("webrtc_answer", async (payload: unknown) => {
    const parsed = signalingSchema.safeParse(payload);
    if (!parsed.success || !(await guard(parsed.data.roomId))) return;
    socket.to(roomChannel(parsed.data.roomId)).emit("webrtc_answer", {
      from: user.id,
      sdp: parsed.data.sdp,
    });
  });

  socket.on("webrtc_ice_candidate", async (payload: unknown) => {
    const parsed = iceCandidateSchema.safeParse(payload);
    if (!parsed.success || !(await guard(parsed.data.roomId))) return;
    socket.to(roomChannel(parsed.data.roomId)).emit("webrtc_ice_candidate", {
      from: user.id,
      candidate: parsed.data.candidate,
    });
  });

  socket.on("media_state", async (payload: unknown) => {
    const parsed = mediaStateSchema.safeParse(payload);
    if (!parsed.success || !(await guard(parsed.data.roomId))) return;
    socket.to(roomChannel(parsed.data.roomId)).emit("media_state", {
      audioMuted: parsed.data.audioMuted,
      videoMuted: parsed.data.videoMuted,
    });
  });
}
