import type { Socket } from "socket.io-client";
import { Peer } from "./peer";
import type { IcePayload, SignalPayload } from "../types/socket";

export interface CallSession {
  peer: Peer;
  dispose: () => void;
}

/**
 * Wires a Peer to the signaling socket for one room and returns a handle.
 * The server relays offers/answers/ICE; media flows peer-to-peer.
 */
export function startCallSession(opts: {
  socket: Socket;
  roomId: string;
  polite: boolean;
  localStream: MediaStream;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
  onRoute: (route: "direct" | "relay" | null) => void;
}): CallSession {
  const { socket, roomId } = opts;

  const peer = new Peer(opts.polite, {
    onLocalDescription: (description) => {
      socket.emit(
        description.type === "offer" ? "webrtc_offer" : "webrtc_answer",
        { roomId, sdp: JSON.stringify(description) },
      );
    },
    onIceCandidate: (candidate) => {
      socket.emit("webrtc_ice_candidate", { roomId, candidate });
    },
    onRemoteStream: opts.onRemoteStream,
    onConnectionState: (state) => {
      opts.onConnectionState(state);
      if (state === "connected") {
        // Give ICE a moment to settle, then report the route for the UI badge.
        window.setTimeout(() => {
          void peer.routeSummary().then((route) => opts.onRoute(route));
        }, 2500);
      }
    },
  });

  peer.addLocalStream(opts.localStream);

  const onOffer = ({ sdp }: SignalPayload): void => {
    void peer.receiveDescription(JSON.parse(sdp)).catch((err) => console.error("[webrtc] offer", err));
  };
  const onAnswer = ({ sdp }: SignalPayload): void => {
    void peer.receiveDescription(JSON.parse(sdp)).catch((err) => console.error("[webrtc] answer", err));
  };
  const onIce = ({ candidate }: IcePayload): void => {
    void peer.addIceCandidate(candidate).catch(() => {});
  };

  socket.on("webrtc_offer", onOffer);
  socket.on("webrtc_answer", onAnswer);
  socket.on("webrtc_ice_candidate", onIce);

  return {
    peer,
    dispose() {
      socket.off("webrtc_offer", onOffer);
      socket.off("webrtc_answer", onAnswer);
      socket.off("webrtc_ice_candidate", onIce);
      peer.close();
    },
  };
}
