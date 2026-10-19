import axios from "axios";
import { useAuthStore } from "../store/auth.store";
import { tryRefreshAuth } from "./auth.api";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api/v1",
  // Safety margin for a cold instance (free Render sleeps after 15 min idle).
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshInFlight: Promise<boolean> | null = null;

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshInFlight ??= tryRefreshAuth().finally(() => {
        refreshInFlight = null;
      });
      const ok = await refreshInFlight;
      if (ok) return api(original);
    }
    return Promise.reject(error);
  },
);

/** Extracts a human-readable message from an API error. */
export function apiErrorMessage(err: unknown, fallback = "Something went wrong"): string {
  if (axios.isAxiosError(err)) {
    const payload = err.response?.data as { error?: { message?: string } } | undefined;
    return payload?.error?.message ?? err.message ?? fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
