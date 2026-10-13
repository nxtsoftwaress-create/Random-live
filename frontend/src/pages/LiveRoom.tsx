import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Flag,
  Gauge,
  MessageSquare,
  Mic,
  MicOff,
  PhoneOff,
  RefreshCw,
  SkipForward,
  Video as VideoIcon,
  VideoOff,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { LogoMark } from "../components/LogoMark";
import { VideoTile } from "../components/VideoTile";
import { ChatBox } from "../components/ChatBox";
import { ReportModal } from "../components/ReportModal";
import { StatusPill } from "../components/ui/StatusPill";
import { toast } from "../components/ui/Toast";
import { useSocket } from "../hooks/useSocket";
import { useRoomStore } from "../store/room.store";
import { useSettingsStore } from "../store/settings.store";
import { useAuthStore } from "../store/auth.store";
import { describeMediaError, getOrCreateLocalStream } from "../webrtc/media";
import { startCallSession, type CallSession } from "../webrtc/signaling";
import type {
  ChatErrorPayload,
  MediaStatePayload,
  PartnerLeftPayload,
  SessionEndedPayload,
  SocketErrorPayload,
  TypingPayload,
} from "../types/socket";
import type { ChatMessage } from "../types/chat";

function ElapsedTimer({ startedAt }: { startedAt: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  if (!startedAt) return null;
  const s = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <span className="tabular-nums">
      {String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function DockButton({
  active = true,
  danger = false,
  onClick,
  label,
  children,
  disabled = false,
}: {
  active?: boolean;
  danger?: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <motion.button
      whileHover={{ scale: disabled ? 1 : 1.06 }}
      whileTap={{ scale: disabled ? 1 : 0.94 }}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        "flex h-12 w-12 items-center justify-center rounded-full border transition-colors",
        danger
          ? "border-rose-400/30 bg-rose-500/20 text-rose-200 hover:bg-rose-500/35"
          : active
            ? "border-white/10 bg-white/[0.07] text-white hover:bg-white/[0.14]"
            : "border-rose-400/30 bg-rose-500/20 text-rose-200 hover:bg-rose-500/30",
        disabled && "opacity-40",
      )}
    >
      {children}
    </motion.button>
  );
}

export default function LiveRoom() {
  const navigate = useNavigate();
  const socket = useSocket();
  const selfId = useAuthStore((s) => s.user?.id ?? null);

  const {
    phase,
    roomId,
    role,
    mode,
    partner,
    localStream,
    remoteStream,
    connection,
    iceRoute,
    partnerAudioMuted,
    partnerVideoMuted,
    partnerTyping,
    messages,
    startedAt,
  } = useRoomStore();

  const { audioMuted, videoMuted, setAudioMuted, setVideoMuted } = useSettingsStore();

  const [reportOpen, setReportOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => window.innerWidth >= 1024);
  const [seenCount, setSeenCount] = useState(0);

  const sessionRef = useRef<CallSession | null>(null);
  const setupDoneRef = useRef(false);

  // ── Call setup: acquire media, start perfect-negotiation session ─────────
  useEffect(() => {
    if (!socket || !roomId || setupDoneRef.current) return;
    setupDoneRef.current = true;

    // Text-only sessions ride entirely on the socket — no media, no WebRTC.
    if (mode === "text") {
      useRoomStore.getState().setPhase("live");
      useRoomStore.getState().setConnection("connected");
      return;
    }

    let disposed = false;

    void (async () => {
      let stream: MediaStream | null = null;
      try {
        stream = await getOrCreateLocalStream(true, true);
        useRoomStore.getState().setLocalStream(stream);
      } catch (err) {
        const d = describeMediaError(err);
        toast("error", `${d.title} — continuing in text-only mode`);
      }
      if (disposed || !stream) return;

      const session = startCallSession({
        socket,
        roomId,
        polite: role !== "a", // room creator ("a") is the impolite peer
        localStream: stream,
        onRemoteStream: (s) => useRoomStore.getState().setRemoteStream(s),
        onConnectionState: (state) => {
          const store = useRoomStore.getState();
          store.setConnection(state);
          if (state === "connected") store.setPhase("live");
          if (state === "failed") toast("error", "Connection failed — press NEXT to try again");
        },
        onRoute: (route) => useRoomStore.getState().setIceRoute(route),
      });
      sessionRef.current = session;

      socket.emit("media_state", { roomId, audioMuted, videoMuted });
    })();

    return () => {
      disposed = true;
      sessionRef.current?.dispose();
      sessionRef.current = null;
      setupDoneRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, roomId]);

  // ── Partner lifecycle + chat listeners ───────────────────────────────────
  const leaveRoom = useCallback(
    (target: string) => {
      sessionRef.current?.dispose();
      sessionRef.current = null;
      useRoomStore.getState().setRemoteStream(null);
      // Navigate BEFORE resetting the store: resetting first would null roomId
      // and the /live guard would race us to /matchmaking (auto re-joining the
      // queue — wrong after an explicit "End session"). The reset is deferred
      // past the router's navigation commit for the same reason.
      navigate(target);
      window.setTimeout(() => useRoomStore.getState().reset(), 80);
    },
    [navigate],
  );

  useEffect(() => {
    if (!socket || !roomId) return;

    const onPartnerLeft = ({ reason }: PartnerLeftPayload): void => {
      const store = useRoomStore.getState();
      store.setLastPartnerLeftReason(reason);
      store.setRemoteStream(null);
      store.setPartnerTyping(false);
      sessionRef.current?.dispose();
      sessionRef.current = null;
      if (reason === "ended") {
        store.setPhase("ended");
      } else {
        store.setPhase("partner_left");
        window.setTimeout(() => leaveRoom("/matchmaking"), 1800);
      }
    };

    const onSessionEnded = ({ reason }: SessionEndedPayload): void => {
      leaveRoom(reason === "next" ? "/matchmaking" : "/");
    };

    const onChatMessage = (m: ChatMessage): void => {
      useRoomStore.getState().addMessage(m);
      useRoomStore.getState().setPartnerTyping(false);
    };

    const onTypingStart = ({ userId }: TypingPayload): void => {
      if (userId !== selfId) useRoomStore.getState().setPartnerTyping(true);
    };
    const onTypingStop = (): void => useRoomStore.getState().setPartnerTyping(false);

    const onMediaState = (p: MediaStatePayload): void =>
      useRoomStore.getState().setPartnerMedia(p.audioMuted, p.videoMuted);

    const onChatError = (e: ChatErrorPayload): void => toast("error", e.message);
    const onSocketError = (e: SocketErrorPayload): void => toast("error", e.message);

    socket.on("partner_left", onPartnerLeft);
    socket.on("session_ended", onSessionEnded);
    socket.on("chat_message", onChatMessage);
    socket.on("typing_start", onTypingStart);
    socket.on("typing_stop", onTypingStop);
    socket.on("media_state", onMediaState);
    socket.on("chat_error", onChatError);
    socket.on("socket_error", onSocketError);

    return () => {
      socket.off("partner_left", onPartnerLeft);
      socket.off("session_ended", onSessionEnded);
      socket.off("chat_message", onChatMessage);
      socket.off("typing_start", onTypingStart);
      socket.off("typing_stop", onTypingStop);
      socket.off("media_state", onMediaState);
      socket.off("chat_error", onChatError);
      socket.off("socket_error", onSocketError);
    };
  }, [socket, roomId, selfId, leaveRoom]);

  useEffect(() => {
    if (chatOpen) setSeenCount(messages.length);
  }, [chatOpen, messages.length]);
  const unread = chatOpen ? 0 : Math.max(0, messages.length - seenCount);

  // ── Controls ─────────────────────────────────────────────────────────────
  const emitMediaState = (a: boolean, v: boolean): void => {
    if (socket && roomId) socket.emit("media_state", { roomId, audioMuted: a, videoMuted: v });
  };

  const toggleMic = (): void => {
    const next = !audioMuted;
    setAudioMuted(next);
    localStream?.getAudioTracks().forEach((t) => (t.enabled = !next));
    emitMediaState(next, videoMuted);
  };

  const toggleCam = (): void => {
    const next = !videoMuted;
    setVideoMuted(next);
    localStream?.getVideoTracks().forEach((t) => (t.enabled = !next));
    emitMediaState(audioMuted, next);
  };

  const handleNext = (): void => {
    if (socket && roomId) socket.emit("next_user", { roomId });
  };

  const handleEnd = (): void => {
    if (socket && roomId) socket.emit("call_ended", { roomId });
  };

  const handleSend = useCallback(
    (body: string): void => {
      if (socket && roomId) socket.emit("chat_message", { roomId, body });
    },
    [socket, roomId],
  );

  const handleTyping = useCallback(
    (typing: boolean): void => {
      if (socket && roomId) socket.emit(typing ? "typing_start" : "typing_stop", { roomId });
    },
    [socket, roomId],
  );

  const live = phase === "live" && connection === "connected";
  const connecting = !live && phase !== "partner_left" && phase !== "ended";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-black">
      {/* Remote video fills the room */}
      <VideoTile
        stream={remoteStream}
        className="absolute inset-0 h-full w-full !rounded-none !border-0"
        label={
          mode === "video"
            ? undefined
            : `${partner?.displayName ?? "Partner"} · text chat`
        }
        placeholder={
          <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-gradient-to-br from-ink to-void">
            <motion.div
              animate={{ scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] }}
              transition={{ duration: 2.4, repeat: Infinity }}
              className="h-24 w-24 rounded-full bg-gradient-to-br from-brand/50 to-white/25 blur-sm"
            />
            <p className="text-sm text-slate-500">
              {mode === "video" ? "Waiting for your partner's camera…" : "Text chat session"}
            </p>
          </div>
        }
      />

      {/* Partner muted state badges */}
      {mode === "video" && (partnerVideoMuted || partnerAudioMuted) && remoteStream && (
        <div className="absolute left-4 top-4 z-20 flex gap-2">
          {partnerVideoMuted && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs text-rose-200 backdrop-blur">
              <VideoOff className="h-3.5 w-3.5" /> Camera off
            </span>
          )}
          {partnerAudioMuted && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs text-amber-200 backdrop-blur">
              <MicOff className="h-3.5 w-3.5" /> Muted
            </span>
          )}
        </div>
      )}

      {/* Top bar */}
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-3.5 sm:px-6">
        <div className="flex items-center gap-3">
          <LogoMark className="h-7 w-7 rounded-lg" />
          <div className="glass flex items-center gap-2 px-3 py-1.5 text-sm text-white">
            <span className="relative flex h-2 w-2">
              <span
                className={clsx(
                  "absolute inline-flex h-full w-full rounded-full opacity-75",
                  live ? "animate-ping bg-emerald-400" : "bg-amber-400",
                )}
              />
              <span
                className={clsx(
                  "relative inline-flex h-2 w-2 rounded-full",
                  live ? "bg-emerald-400" : "bg-amber-400",
                )}
              />
            </span>
            {partner?.displayName ?? "Partner"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StatusPill tone={live ? "live" : "connecting"} className="hidden sm:inline-flex">
            {live ? "Live" : "Connecting"}
          </StatusPill>
          {iceRoute && (
            <StatusPill tone={iceRoute === "relay" ? "connecting" : "live"} className="hidden md:inline-flex">
              {iceRoute === "relay" ? <Gauge className="h-3 w-3" /> : <Zap className="h-3 w-3" />}
              {iceRoute === "relay" ? "Relay (TURN)" : "Direct P2P"}
            </StatusPill>
          )}
          <span className="glass px-3 py-1.5 text-xs text-slate-200">
            <ElapsedTimer startedAt={startedAt} />
          </span>
          <button
            onClick={() => setReportOpen(true)}
            className="glass flex h-9 items-center gap-1.5 px-3 text-xs text-rose-200 transition hover:bg-rose-500/20"
            title="Report this user"
          >
            <Flag className="h-3.5 w-3.5" />
            Report
          </button>
          <button
            onClick={() => setChatOpen((v) => !v)}
            className="glass relative flex h-9 w-9 items-center justify-center text-slate-200 transition hover:bg-white/10 lg:hidden"
            title="Toggle chat"
          >
            <MessageSquare className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Connecting shimmer */}
      <AnimatePresence>
        {connecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-void/55 backdrop-blur-[3px]"
          >
            <div className="flex flex-col items-center gap-3">
              <span className="shimmer-text font-display text-xl font-semibold">
                Establishing secure connection…
              </span>
              <span className="text-xs text-slate-500">Negotiating the best media route</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Partner-left / ended overlays */}
      <AnimatePresence>
        {(phase === "partner_left" || phase === "ended") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 flex items-center justify-center bg-void/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.92, y: 14 }}
              animate={{ scale: 1, y: 0 }}
              className="glass-strong flex flex-col items-center gap-3 px-10 py-8 text-center"
            >
              <RefreshCw className="h-8 w-8 text-brand-light" />
              <p className="font-display text-xl font-semibold text-white">
                {phase === "ended" ? "Session ended" : "Partner moved on"}
              </p>
              <p className="max-w-xs text-sm text-slate-400">
                {phase === "ended"
                  ? "Your partner ended the call. Nothing is stored except an anonymous session record."
                  : "Finding someone new for you…"}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Self PiP */}
      {mode === "video" && (
        <motion.div
          drag
          dragMomentum={false}
          dragElastic={0.05}
          className="absolute bottom-28 right-4 z-20 w-44 cursor-grab active:cursor-grabbing sm:w-56"
        >
          <VideoTile
            stream={localStream}
            muted
            mirrored
            showBars
            label="You"
            className="aspect-video shadow-glow-lg"
          />
          {videoMuted && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/65">
              <VideoOff className="h-6 w-6 text-slate-300" />
            </div>
          )}
        </motion.div>
      )}

      {/* Chat panel */}
      <AnimatePresence>
        {chatOpen && (
          <motion.div
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: "spring", stiffness: 320, damping: 30 }}
            className="absolute bottom-28 right-4 top-20 z-20 w-[calc(100%-2rem)] max-w-[21rem]"
          >
            <ChatBox
              className="h-full"
              messages={messages}
              selfId={selfId}
              partnerTyping={partnerTyping}
              disabled={phase === "partner_left" || phase === "ended"}
              onSend={handleSend}
              onTyping={handleTyping}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Control dock */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex justify-center bg-gradient-to-t from-black/70 to-transparent pb-5 pt-10">
        <div className="glass-strong flex items-center gap-2 rounded-full px-3 py-2.5 sm:gap-3 sm:px-4">
          <DockButton
            onClick={toggleMic}
            active={!audioMuted}
            disabled={!localStream}
            label={audioMuted ? "Unmute microphone" : "Mute microphone"}
          >
            {audioMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </DockButton>

          <DockButton
            onClick={toggleCam}
            active={!videoMuted}
            disabled={!localStream || !localStream.getVideoTracks().length}
            label={videoMuted ? "Turn camera on" : "Turn camera off"}
          >
            {videoMuted ? <VideoOff className="h-5 w-5" /> : <VideoIcon className="h-5 w-5" />}
          </DockButton>

          <span className="h-8 w-px bg-white/10" />

          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={handleNext}
            disabled={phase === "partner_left" || phase === "ended"}
            className="flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-brand to-brand-dark px-6 font-medium text-white shadow-glow transition hover:brightness-110 disabled:opacity-50"
          >
            <SkipForward className="h-4 w-4" />
            Next
          </motion.button>

          <span className="h-8 w-px bg-white/10" />

          <DockButton onClick={handleEnd} danger label="End session">
            <PhoneOff className="h-5 w-5" />
          </DockButton>
        </div>
      </div>

      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} />
    </div>
  );
}
