import { pcConfig } from "./configuration";

export interface PeerEvents {
  onLocalDescription: (description: RTCSessionDescriptionInit) => void;
  onIceCandidate: (candidate: RTCIceCandidateInit | null) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
}

/**
 * RTCPeerConnection wrapper implementing the "perfect negotiation" pattern,
 * which makes offer glare a non-issue regardless of who talks first.
 * The room creator (role "a") is impolite; the joiner (role "b") is polite.
 */
export class Peer {
  readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private readonly events: PeerEvents;

  private makingOffer = false;
  private ignoreOffer = false;
  private settingRemoteAnswerPending = false;

  constructor(polite: boolean, events: PeerEvents) {
    this.polite = polite;
    this.events = events;
    this.pc = new RTCPeerConnection(pcConfig);

    this.pc.onicecandidate = ({ candidate }) => {
      this.events.onIceCandidate(candidate ? candidate.toJSON() : null);
    };

    this.pc.ontrack = ({ streams }) => {
      if (streams[0]) this.events.onRemoteStream(streams[0]);
    };

    this.pc.onconnectionstatechange = () => {
      this.events.onConnectionState(this.pc.connectionState);
    };

    this.pc.onnegotiationneeded = async () => {
      try {
        this.makingOffer = true;
        await this.pc.setLocalDescription();
        if (this.pc.localDescription) {
          this.events.onLocalDescription(this.pc.localDescription.toJSON());
        }
      } catch (err) {
        console.error("[peer] negotiation failed", err);
      } finally {
        this.makingOffer = false;
      }
    };
  }

  addLocalStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      this.pc.addTrack(track, stream);
    }
  }

  async receiveDescription(description: RTCSessionDescriptionInit): Promise<void> {
    const readyForOffer =
      !this.makingOffer &&
      (this.pc.signalingState === "stable" || this.settingRemoteAnswerPending);
    const offerCollision = description.type === "offer" && !readyForOffer;

    this.ignoreOffer = !this.polite && offerCollision;
    if (this.ignoreOffer) return; // impolite peer ignores the incoming offer

    this.settingRemoteAnswerPending = description.type === "answer";
    await this.pc.setRemoteDescription(description);
    this.settingRemoteAnswerPending = false;

    if (description.type === "offer") {
      await this.pc.setLocalDescription();
      if (this.pc.localDescription) {
        this.events.onLocalDescription(this.pc.localDescription.toJSON());
      }
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit | null): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (err) {
      if (!this.ignoreOffer) throw err; // harmless while ignoring offers
    }
  }

  /** After connecting: "direct" P2P or "relay" (TURN). */
  async routeSummary(): Promise<"direct" | "relay" | null> {
    try {
      const stats = await this.pc.getStats();
      interface PairStats {
        type: string;
        state?: string;
        selected?: boolean;
        localCandidateId?: string;
      }
      interface CandidateStats {
        candidateType?: string;
      }
      let route: "direct" | "relay" | null = null;
      stats.forEach((report) => {
        const pair = report as unknown as PairStats;
        if (pair.type === "candidate-pair" && pair.state === "succeeded" && pair.selected && pair.localCandidateId) {
          const local = stats.get(pair.localCandidateId) as unknown as CandidateStats | undefined;
          route = local?.candidateType === "relay" ? "relay" : "direct";
        }
      });
      return route;
    } catch {
      return null;
    }
  }

  close(): void {
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pc.onnegotiationneeded = null;
    // Local tracks are owned by the cached MediaStream — we only close the PC.
    this.pc.close();
  }
}
