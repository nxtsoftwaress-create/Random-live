import { getStore } from "../config/store.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessPayload,
} from "../utils/jwt.js";
import { forbidden, unauthorized } from "../utils/errors.js";

// ── Anonymous display names: adjective + noun + digits ────────────────────
const ADJECTIVES = [
  "Cosmic", "Silent", "Neon", "Lucky", "Wild", "Mellow", "Rapid", "Golden",
  "Hidden", "Electric", "Crimson", "Frosty", "Solar", "Lunar", "Vivid", "Nova",
];
const NOUNS = [
  "Falcon", "Tiger", "Comet", "Panda", "Otter", "Raven", "Phoenix", "Wolf",
  "Dolphin", "Lynx", "Fox", "Orca", "Puma", "Heron", "Gecko", "Bison",
];

export function generateDisplayName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(100 + Math.random() * 900);
  return `${adj}${noun}${num}`;
}

export interface PublicUser {
  id: string;
  displayName: string;
  isGuest: boolean;
  language: string;
  interests: string[];
  createdAt: string;
}

export function toPublicUser(user: {
  id: string;
  displayName: string;
  isGuest: boolean;
  language: string;
  interests: string[];
  createdAt: Date;
}): PublicUser {
  return {
    id: user.id,
    displayName: user.displayName,
    isGuest: user.isGuest,
    language: user.language,
    interests: user.interests,
    createdAt: user.createdAt.toISOString(),
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
}

export function issueTokens(user: { id: string; displayName: string; isGuest: boolean }): AuthTokens {
  const payload: AccessPayload = {
    sub: user.id,
    displayName: user.displayName,
    isGuest: user.isGuest,
  };
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken({
      sub: user.id,
      displayName: user.displayName,
      isGuest: user.isGuest,
    }),
    expiresIn: 2 * 60 * 60, // 2h in seconds
  };
}

export async function createGuest(): Promise<{ user: PublicUser; tokens: AuthTokens }> {
  const user = await getStore().createUser({
    displayName: generateDisplayName(),
    isGuest: true,
  });
  return { user: toPublicUser(user), tokens: issueTokens(user) };
}

/**
 * Returns the user behind a valid token, re-creating the row when it is gone.
 *
 * In memory mode a crash, restart or redeploy wipes every user while clients
 * keep a 30-day refresh token in localStorage. Without this, those users hit
 * "Unknown user": the socket connected but could never be matched, so they sat
 * on "Finding your match" forever — exactly what a restart looked like to them.
 */
export async function ensureUser(
  payload: { id: string; displayName?: string; isGuest?: boolean },
): Promise<PublicUser> {
  const existing = await getStore().findUserById(payload.id);
  if (existing) {
    if (existing.status === "ACTIVE") return toPublicUser(existing);
    throw forbidden("Account is not active");
  }

  if (payload.isGuest === false) {
    // Registered accounts live in durable storage; a missing row means deleted.
    throw unauthorized("Unknown user");
  }

  logger.warn({ userId: payload.id }, "User row missing (restart?) — re-creating guest");
  try {
    const recreated = await getStore().createUser({
      id: payload.id,
      displayName: payload.displayName || generateDisplayName(),
      isGuest: true,
    });
    return toPublicUser(recreated);
  } catch (err) {
    // Concurrent heal (two tabs) — the other one won the insert.
    if (env.PERSISTENCE === "real") {
      const raced = await getStore().findUserById(payload.id);
      if (raced) return toPublicUser(raced);
    }
    throw err;
  }
}

/** Reads optional identity fields without failing on tokens issued before them. */
function verifyRefreshPayload(token: string): {
  sub: string;
  displayName?: string;
  isGuest?: boolean;
} {
  try {
    return verifyRefreshToken(token) as { sub: string; displayName?: string; isGuest?: boolean };
  } catch {
    throw unauthorized("Invalid refresh token");
  }
}

/** Rotates a refresh token into a fresh access+refresh pair. */
export async function rotateRefreshToken(refreshToken: string): Promise<{
  user: PublicUser;
  tokens: AuthTokens;
}> {
  // Refresh tokens carry the display name so a wiped guest row can be rebuilt
  // with the same identity instead of bouncing the user back to the landing page.
  const { sub, displayName, isGuest } = verifyRefreshPayload(refreshToken);
  const user = await ensureUser({ id: sub, displayName, isGuest });

  return { user, tokens: issueTokens(user) };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await getStore().findUserById(id);
  return user ? toPublicUser(user) : null;
}
