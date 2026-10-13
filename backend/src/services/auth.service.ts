import { getStore } from "../config/store.js";
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
    refreshToken: signRefreshToken({ sub: user.id }),
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

/** Rotates a refresh token into a fresh access+refresh pair. */
export async function rotateRefreshToken(refreshToken: string): Promise<{
  user: PublicUser;
  tokens: AuthTokens;
}> {
  let userId: string;
  try {
    ({ sub: userId } = verifyRefreshToken(refreshToken));
  } catch {
    throw unauthorized("Invalid refresh token");
  }

  const user = await getStore().findUserById(userId);
  if (!user) throw unauthorized("Unknown user");
  if (user.status !== "ACTIVE") throw forbidden("Account is not active");

  return { user: toPublicUser(user), tokens: issueTokens(user) };
}

export async function getUserById(id: string): Promise<PublicUser | null> {
  const user = await getStore().findUserById(id);
  return user ? toPublicUser(user) : null;
}
