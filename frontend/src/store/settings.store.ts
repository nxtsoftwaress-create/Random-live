import { create } from "zustand";
import type { MatchMode } from "../types/socket";

const KEY = "rl.settings";

interface Persisted {
  mode: MatchMode;
  language: string;
  interests: string[];
  prefsChosen: boolean;
}

interface SettingsState extends Persisted {
  audioMuted: boolean;
  videoMuted: boolean;
  hydrate: () => void;
  setMode: (mode: MatchMode) => void;
  setLanguage: (language: string) => void;
  toggleInterest: (tag: string) => void;
  setAudioMuted: (v: boolean) => void;
  setVideoMuted: (v: boolean) => void;
  markChosen: () => void;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  mode: "video",
  language: "any",
  interests: [],
  prefsChosen: false,
  audioMuted: false,
  videoMuted: false,

  hydrate: () => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Persisted>;
        set({
          mode: parsed.mode === "text" ? "text" : "video",
          language: parsed.language ?? "any",
          interests: Array.isArray(parsed.interests) ? parsed.interests : [],
          prefsChosen: parsed.prefsChosen === true,
        });
      }
    } catch {
      /* ignore */
    }
  },

  setMode: (mode) => {
    set({ mode });
    persist(get);
  },
  setLanguage: (language) => {
    set({ language });
    persist(get);
  },
  toggleInterest: (tag) => {
    const { interests } = get();
    set({
      interests: interests.includes(tag)
        ? interests.filter((t) => t !== tag)
        : interests.length >= 10
          ? interests
          : [...interests, tag],
    });
    persist(get);
  },
  setAudioMuted: (audioMuted) => set({ audioMuted }),
  setVideoMuted: (videoMuted) => set({ videoMuted }),
  markChosen: () => {
    set({ prefsChosen: true });
    persist(get);
  },
}));

function persist(get: () => SettingsState): void {
  const { mode, language, interests, prefsChosen } = get();
  localStorage.setItem(KEY, JSON.stringify({ mode, language, interests, prefsChosen }));
}
