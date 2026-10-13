export type MediaPermissionState =
  | "idle"
  | "granted"
  | "denied"
  | "missing"
  | "unsupported"
  | "error";

let cachedStream: MediaStream | null = null;

export function hasBrowserMediaSupport(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * Returns a cached live stream when compatible, otherwise (re)acquires one.
 * The stream is intentionally kept alive across matches so NEXT doesn't
 * re-prompt permissions.
 */
export async function getOrCreateLocalStream(video: boolean, audio: boolean): Promise<MediaStream> {
  if (cachedStream) {
    const videoOk = !video || cachedStream.getVideoTracks().some((t) => t.readyState === "live");
    const audioOk = !audio || cachedStream.getAudioTracks().some((t) => t.readyState === "live");
    if (videoOk && audioOk) return cachedStream;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    video: video ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    audio,
  });
  cachedStream = stream;
  return stream;
}

export function getCachedLocalStream(): MediaStream | null {
  return cachedStream;
}

/** Stops all tracks and drops the cache (logout / leaving the app). */
export function releaseLocalStream(): void {
  cachedStream?.getTracks().forEach((t) => t.stop());
  cachedStream = null;
}

export function describeMediaError(err: unknown): { title: string; hint: string } {
  const name = err instanceof Error ? err.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return {
        title: "Permission denied",
        hint: "Allow camera/microphone access for this site in your browser settings, then retry.",
      };
    case "NotFoundError":
    case "OverconstrainedError":
      return {
        title: "Device not found",
        hint: "We couldn't find a camera or microphone. Connect one and retry.",
      };
    case "NotReadableError":
    case "AbortError":
      return {
        title: "Device busy",
        hint: "Another app seems to be using your camera. Close it and retry.",
      };
    default:
      return {
        title: "Something went wrong",
        hint: err instanceof Error ? err.message : "Unknown media error",
      };
  }
}

export async function deviceSummary(): Promise<{ cameras: number; microphones: number }> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((d) => d.kind === "videoinput").length,
    microphones: devices.filter((d) => d.kind === "audioinput").length,
  };
}
