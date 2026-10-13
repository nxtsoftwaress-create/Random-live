import { useCallback, useState } from "react";
import {
  describeMediaError,
  deviceSummary,
  getOrCreateLocalStream,
  hasBrowserMediaSupport,
  type MediaPermissionState,
} from "../webrtc/media";

export interface DeviceCheckState {
  camera: MediaPermissionState;
  microphone: MediaPermissionState;
  preview: MediaStream | null;
  checking: boolean;
  error: string | null;
}

/**
 * Requests camera + microphone once, then classifies the outcome per device:
 * granted / denied / missing / unsupported / error — every failure state from
 * the product spec surfaces here.
 */
export function useMediaDevices() {
  const [state, setState] = useState<DeviceCheckState>({
    camera: "idle",
    microphone: "idle",
    preview: null,
    checking: false,
    error: null,
  });

  const request = useCallback(async () => {
    if (!hasBrowserMediaSupport()) {
      setState((s) => ({
        ...s,
        camera: "unsupported",
        microphone: "unsupported",
        checking: false,
        error: "This browser doesn't support camera/microphone access. Try a modern browser.",
      }));
      return;
    }

    setState((s) => ({ ...s, checking: true, error: null }));
    try {
      const stream = await getOrCreateLocalStream(true, true);
      const summary = await deviceSummary();
      const hasVideo = stream.getVideoTracks().length > 0 && summary.cameras > 0;
      const hasAudio = stream.getAudioTracks().length > 0 && summary.microphones > 0;
      setState({
        camera: hasVideo ? "granted" : "missing",
        microphone: hasAudio ? "granted" : "missing",
        preview: stream,
        checking: false,
        error: null,
      });
    } catch (err) {
      const described = describeMediaError(err);
      const denied = err instanceof Error && (err.name === "NotAllowedError" || err.name === "SecurityError");
      setState((s) => ({
        ...s,
        checking: false,
        error: `${described.title} — ${described.hint}`,
        camera: denied ? "denied" : "error",
        microphone: denied ? "denied" : "error",
      }));
    }
  }, []);

  return { ...state, request };
}
