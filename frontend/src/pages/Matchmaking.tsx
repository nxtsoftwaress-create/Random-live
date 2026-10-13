import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { Button } from "../components/ui/Button";
import { useSocket } from "../hooks/useSocket";
import { useMatchmaking } from "../hooks/useMatchmaking";
import { useSettingsStore } from "../store/settings.store";
import { useRoomStore } from "../store/room.store";
import { LANGUAGES } from "../utils/constants";

const phrases = [
  "Looking for someone interesting…",
  "Checking languages…",
  "Comparing interests…",
  "Scanning the room…",
  "Almost there…",
];

export default function Matchmaking() {
  const socket = useSocket();
  const { cancel } = useMatchmaking(socket);
  const { mode, language, interests } = useSettingsStore();
  const phase = useRoomStore((s) => s.phase);

  const [elapsed, setElapsed] = useState(0);
  const [phraseIndex, setPhraseIndex] = useState(0);

  // Join the queue when the page becomes the active search.
  useEffect(() => {
    if (!socket) return;
    useRoomStore.getState().setPhase("searching");
    socket.emit("queue_join", { mode, language, interests });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, mode, language, interests]);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    const phrases_timer = window.setInterval(
      () => setPhraseIndex((i) => (i + 1) % phrases.length),
      2400,
    );
    return () => {
      window.clearInterval(timer);
      window.clearInterval(phrases_timer);
    };
  }, []);

  const languageLabel =
    LANGUAGES.find((l) => l.value === language)?.label.replace(" language", "") ?? language;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
        className="flex flex-col items-center"
      >
        {/* Radar */}
        <div className="relative h-48 w-48">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="absolute inset-0 rounded-full border border-brand/50 animate-ping"
              style={{ animationDelay: `${i * 0.9}s`, animationDuration: "2.7s" }}
            />
          ))}
          <span className="absolute inset-7 rounded-full bg-gradient-to-br from-brand to-brand-dark opacity-30 blur-md" />
          <span className="glass absolute inset-10 flex items-center justify-center rounded-full">
            <span className="h-3 w-3 rounded-full bg-gradient-to-br from-brand to-white shadow-glow" />
          </span>
        </div>

        <h2 className="mt-8 font-display text-2xl font-semibold text-white">
          {phase === "searching" ? "Finding your match" : "Getting ready…"}
        </h2>
        <p className="mt-2 h-5 text-sm text-slate-400">{phrases[phraseIndex]}</p>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="glass rounded-full px-3 py-1.5 text-slate-300">
            {mode === "video" ? "Video chat" : "Text chat"}
          </span>
          <span className="glass rounded-full px-3 py-1.5 text-slate-300">{languageLabel}</span>
          {interests.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-brand/50 bg-brand/20 px-3 py-1.5 text-brand-light"
            >
              {tag}
            </span>
          ))}
        </div>

        <p className="mt-8 font-display text-sm tabular-nums text-slate-500">
          Searching · {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
          {String(elapsed % 60).padStart(2, "0")}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Language matching widens after 10 seconds so you're never stuck waiting.
        </p>

        <Button variant="ghost" onClick={cancel} className="mt-8">
          <X className="h-4 w-4" />
          Cancel search
        </Button>
      </motion.div>
    </div>
  );
}
