import { motion } from "framer-motion";
import { MessageSquareText, Search, Video } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { clsx } from "clsx";
import { Button } from "../components/ui/Button";
import { useSettingsStore } from "../store/settings.store";
import { updateMe } from "../services/user.api";
import { INTERESTS, LANGUAGES, MAX_INTERESTS } from "../utils/constants";

export default function Preferences() {
  const navigate = useNavigate();
  const { mode, language, interests, setMode, setLanguage, toggleInterest, markChosen } =
    useSettingsStore();

  const findSomeone = async (): Promise<void> => {
    markChosen();
    // Best-effort persistence to the profile — local state already holds it.
    void updateMe({ language, interests }).catch(() => {});
    navigate("/matchmaking");
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
          Who do you want to meet?
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Optional — leave everything untouched for pure random matching.
        </p>

        {/* Mode */}
        <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Connection
        </p>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setMode("video")}
            className={clsx("glass flex flex-col items-center gap-2 py-5", mode === "video" && "chip-active")}
          >
            <Video className="h-6 w-6 text-brand-light" />
            <span className="text-sm font-medium text-white">Video chat</span>
            <span className="text-xs text-slate-500">Face-to-face + text</span>
          </button>
          <button
            onClick={() => setMode("text")}
            className={clsx("glass flex flex-col items-center gap-2 py-5", mode === "text" && "chip-active")}
          >
            <MessageSquareText className="h-6 w-6 text-white/90" />
            <span className="text-sm font-medium text-white">Text chat</span>
            <span className="text-xs text-slate-500">Typing only</span>
          </button>
        </div>

        {/* Interests */}
        <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Interests {interests.length > 0 && <span className="text-brand-light">· {interests.length}/{MAX_INTERESTS}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          {INTERESTS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleInterest(tag)}
              className={clsx("chip", interests.includes(tag) && "chip-active")}
            >
              {tag}
            </button>
          ))}
        </div>

        {/* Language */}
        <p className="mt-6 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Language
        </p>
        <select
          className="input-dark appearance-none"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.value} value={l.value} className="bg-panel">
              {l.label}
            </option>
          ))}
        </select>

        <Button size="lg" onClick={findSomeone} className="group mt-8 w-full">
          <Search className="h-4 w-4" />
          Find Someone
        </Button>
      </motion.div>
    </div>
  );
}
