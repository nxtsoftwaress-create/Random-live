/** Builds the RTCConfiguration from Vite env vars with sane public defaults. */
export function iceServers(): RTCIceServer[] {
  const stun = (
    import.meta.env.VITE_STUN_SERVERS ||
    "stun:stun.cloudflare.com:3478,stun:stun.l.google.com:19302"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const servers: RTCIceServer[] = stun.map((urls) => ({ urls }));

  const turnUrl = import.meta.env.VITE_TURN_URL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl.split(",").map((s) => s.trim()).filter(Boolean),
      username: import.meta.env.VITE_TURN_USERNAME,
      credential: import.meta.env.VITE_TURN_PASSWORD,
    });
  }
  return servers;
}

export const pcConfig: RTCConfiguration = {
  iceServers: iceServers(),
  iceCandidatePoolSize: 4,
};
