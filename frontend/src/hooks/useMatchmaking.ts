import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Socket } from "socket.io-client";
import { useRoomStore } from "../store/room.store";
import { useSettingsStore } from "../store/settings.store";
import { toast } from "../components/ui/Toast";
import type { MatchFoundPayload, SocketErrorPayload } from "../types/socket";

/**
 * Joins the matchmaking queue for the current settings and routes to
 * /live when a match lands. Cleanup removes listeners (queue entry stays
 * server-side until explicitly cancelled or matched).
 */
export function useMatchmaking(socket: Socket | null): {
  cancel: () => void;
} {
  const navigate = useNavigate();

  useEffect(() => {
    if (!socket) return;
    const { mode, language, interests } = useSettingsStore.getState();

    const onMatch = (payload: MatchFoundPayload): void => {
      useRoomStore.getState().applyMatch(payload);
      navigate("/live");
    };
    const onSocketError = (payload: SocketErrorPayload): void => {
      toast("error", payload.message);
    };

    socket.on("match_found", onMatch);
    socket.on("socket_error", onSocketError);
    return () => {
      socket.off("match_found", onMatch);
      socket.off("socket_error", onSocketError);
    };
  }, [socket, navigate]);

  const cancel = (): void => {
    socket?.emit("queue_leave");
    useRoomStore.getState().setPhase("idle");
    navigate("/preferences");
  };

  return { cancel };
}
