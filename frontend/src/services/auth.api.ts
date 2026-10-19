import axios from "axios";
import type { PublicUser } from "../types/user";
import { useAuthStore } from "../store/auth.store";

/** Raw client (no interceptors) — used for the refresh call itself. */
const raw = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  // Generous: the first call of a visit may be waking a sleeping instance
  // (cold start 20–40s); keepAlive covers the common case, this covers the rest.
  timeout: 30_000,
});

export interface TokenResponse {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export async function createGuest(): Promise<TokenResponse> {
  try {
    const res = await raw.post<TokenResponse>("/auth/guest");
    return res.data;
  } catch (err) {
    // One retry on network/timeout errors (no response): the first attempt may
    // have hit a cold instance mid-wake. Guest creation is safe to repeat.
    if (axios.isAxiosError(err) && !err.response) {
      const res = await raw.post<TokenResponse>("/auth/guest");
      return res.data;
    }
    throw err;
  }
}

export async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const res = await raw.post<TokenResponse>("/auth/refresh", { refreshToken });
  return res.data;
}

/** Attempts a token refresh; logs out on failure. Safe to call concurrently. */
export async function tryRefreshAuth(): Promise<boolean> {
  const { refreshToken, setSession, logout } = useAuthStore.getState();
  if (!refreshToken) return false;
  try {
    const res = await refreshTokens(refreshToken);
    setSession(res.user, res.accessToken, res.refreshToken);
    return true;
  } catch {
    logout();
    return false;
  }
}
