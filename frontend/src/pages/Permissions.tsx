import { motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Mic,
  RefreshCw,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { StatusPill } from "../components/ui/StatusPill";
import { VideoTile } from "../components/VideoTile";
import { toast } from "../components/ui/Toast";
import { useMediaDevices } from "../hooks/useMediaDevices";
import { useSettingsStore } from "../store/settings.store";
import { useAuthStore } from "../store/auth.store";
import type { MediaPermissionState } from "../webrtc/media";

const statusMeta: Record<MediaPermissionState, { tone: "live" | "connecting" | "offline" | "neutral"; icon: typeof CheckCircle2 | null; label: string }> = {
  granted: { tone: "live", icon: CheckCircle2, label: "Ready" },
  denied: { tone: "offline", icon: XCircle, label: "Blocked" },
  missing: { tone: "offline", icon: TriangleAlert, label: "Not found" },
  unsupported: { tone: "offline", icon: XCircle, label: "Unsupported" },
  error: { tone: "offline", icon: TriangleAlert, label: "Error" },
  idle: { tone: "neutral", icon: null, label: "Not checked" },
};

function DeviceCard({
  icon: Icon,
  name,
  state,
}: {
  icon: typeof Camera;
  name: string;
  state: MediaPermissionState;
}) {
  const meta = statusMeta[state];
  return (
    <div className="glass flex items-center justify-between px-4 py-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand/25 to-white/12">
          <Icon className="h-5 w-5 text-brand-light" />
        </span>
        <div>
          <p className="text-sm font-medium text-white">{name}</p>
          <p className="text-xs text-slate-500">
            {state === "idle" ? "Awaiting check" : meta.label}
          </p>
        </div>
      </div>
      <StatusPill tone={meta.tone}>
        {state === "granted" ? "Allowed" : meta.label}
      </StatusPill>
    </div>
  );
}

export default function Permissions() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { camera, microphone, preview, checking, error, request } = useMediaDevices();
  const setMode = useSettingsStore((s) => s.setMode);

  const canContinue = true; // never hard-block: text mode needs no devices

  const continueToPreferences = (): void => {
    if (camera !== "granted" || microphone !== "granted") {
      setMode("text");
      toast("info", "Starting you in text chat — camera/mic unavailable");
    }
    navigate("/preferences");
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass-strong p-8"
      >
        <h2 className="font-display text-2xl font-semibold text-white">
          Check your camera &amp; mic
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Hi {user?.displayName ?? "there"} — allow access when your browser asks, and we'll
          verify everything works before you meet anyone.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_1fr]">
          <VideoTile
            stream={preview}
            muted
            mirrored
            showBars
            label="You"
            className="aspect-video sm:col-span-2 sm:aspect-[21/9]"
          />
          <DeviceCard icon={Camera} name="Camera" state={camera} />
          <DeviceCard icon={Mic} name="Microphone" state={microphone} />
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        {camera === "denied" && (
          <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Camera blocked — you can still enjoy text chat. To enable it later, use the 🔒
            icon in your browser's address bar.
          </div>
        )}

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" loading={checking} onClick={request} className="sm:flex-1">
            {!checking && <RefreshCw className="h-4 w-4" />}
            {camera === "granted" && microphone === "granted"
              ? "Re-check devices"
              : "Enable camera & microphone"}
          </Button>
          <Button
            onClick={continueToPreferences}
            disabled={!canContinue}
            className="group sm:flex-1"
          >
            Continue
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
