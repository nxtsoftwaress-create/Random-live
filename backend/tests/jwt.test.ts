import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";
import {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  tokenTtls,
} from "../src/utils/jwt.js";
import { generateDisplayName } from "../src/services/auth.service.js";
import { env } from "../src/config/env.js";

const user = { id: "user_123", displayName: "TestUser001", isGuest: true };
const accessPayload = { sub: user.id, displayName: user.displayName, isGuest: true };

describe("access tokens", () => {
  it("round-trips the payload", () => {
    const token = signAccessToken(accessPayload);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(user.id);
    expect(payload.displayName).toBe(user.displayName);
    expect(payload.isGuest).toBe(true);
  });

  it("rejects tampered tokens", () => {
    const token = signAccessToken(accessPayload);
    const [head, body] = token.split(".");
    expect(() => verifyAccessToken(`${head}.${body}x.sig`)).toThrow();
  });

  it("rejects expired tokens", () => {
    const expired = jwt.sign(accessPayload, env.JWT_ACCESS_SECRET, { expiresIn: "-1s" });
    expect(() => verifyAccessToken(expired)).toThrow(/expired/i);
  });
});

describe("refresh tokens", () => {
  it("round-trips and only exposes the subject", () => {
    const token = signRefreshToken({ sub: user.id });
    const payload = verifyRefreshToken(token);
    expect(payload.sub).toBe(user.id);
    expect((payload as unknown as Record<string, unknown>).displayName).toBeUndefined();
  });

  it("cannot be verified as an access token (different secret)", () => {
    const refresh = signRefreshToken({ sub: user.id });
    expect(() => verifyAccessToken(refresh)).toThrow();
    expect(tokenTtls.access).not.toBe(tokenTtls.refresh);
  });
});

describe("generateDisplayName", () => {
  it("produces Adjective+Noun+3-digits handles", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateDisplayName()).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{3}$/);
    }
  });
});
