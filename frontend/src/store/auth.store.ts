import { create } from "zustand";
import type { PublicUser } from "../types/user";

const AUTH_KEY = "rl.auth";
const AGREED_KEY = "rl.agreed";

interface AuthState {
  user: PublicUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  agreedToTerms: boolean;
  hydrate: () => void;
  setSession: (user: PublicUser, accessToken: string, refreshToken: string) => void;
  setUser: (user: PublicUser) => void;
  agree: () => void;
  clearTokens: () => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  agreedToTerms: false,

  hydrate: () => {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          user: PublicUser | null;
          accessToken: string | null;
          refreshToken: string | null;
        };
        set({
          user: parsed.user ?? null,
          accessToken: parsed.accessToken ?? null,
          refreshToken: parsed.refreshToken ?? null,
        });
      }
      set({ agreedToTerms: localStorage.getItem(AGREED_KEY) === "true" });
    } catch {
      /* corrupted storage — start fresh */
    }
  },

  setSession: (user, accessToken, refreshToken) => {
    set({ user, accessToken, refreshToken });
    localStorage.setItem(AUTH_KEY, JSON.stringify({ user, accessToken, refreshToken }));
  },

  setUser: (user) => {
    set({ user });
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      try {
        const data = JSON.parse(raw);
        localStorage.setItem(AUTH_KEY, JSON.stringify({ ...data, user }));
      } catch {
        /* ignore */
      }
    }
  },

  agree: () => {
    set({ agreedToTerms: true });
    localStorage.setItem(AGREED_KEY, "true");
  },

  clearTokens: () => {
    set({ user: null, accessToken: null, refreshToken: null });
    localStorage.removeItem(AUTH_KEY);
  },

  logout: () => {
    set({ user: null, accessToken: null, refreshToken: null });
    localStorage.removeItem(AUTH_KEY);
  },
}));
