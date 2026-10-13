import { describe, expect, it } from "vitest";
import {
  validateChatBody,
  containsUrl,
  containsBlockedWord,
  normalizeText,
  MAX_MESSAGE_LENGTH,
} from "../src/validators/chat.validator.js";

describe("validateChatBody", () => {
  it("accepts a normal message", () => {
    expect(validateChatBody("Hello there! 👋")).toEqual({ ok: true });
  });

  it("trims whitespace-only messages to empty", () => {
    expect(validateChatBody("   ")).toMatchObject({ ok: false, code: "empty" });
  });

  it("rejects messages over the length cap", () => {
    const long = "a".repeat(MAX_MESSAGE_LENGTH + 1);
    expect(validateChatBody(long)).toMatchObject({ ok: false, code: "too_long" });
  });

  it("accepts a message at exactly the cap", () => {
    expect(validateChatBody("a".repeat(MAX_MESSAGE_LENGTH))).toEqual({ ok: true });
  });

  it("rejects plain links", () => {
    expect(validateChatBody("check http://evil.example/win")).toMatchObject({
      ok: false,
      code: "blocked_content",
    });
  });

  it("rejects www-style links without a scheme", () => {
    expect(validateChatBody("go to www.scamshop.xyz now")).toMatchObject({
      ok: false,
      code: "blocked_content",
    });
  });

  it("rejects bare domains used to exchange contact info", () => {
    expect(validateChatBody("find me on findme.com or telegram @user")).toMatchObject({
      ok: false,
      code: "blocked_content",
    });
  });

  it("rejects profanity", () => {
    expect(validateChatBody("what the fuck")).toMatchObject({ ok: false, code: "blocked_content" });
  });

  it("catches leetspeak and separator evasion", () => {
    expect(validateChatBody("f u c k you")).toMatchObject({ ok: false, code: "blocked_content" });
    expect(validateChatBody("5h1t")).toMatchObject({ ok: false, code: "blocked_content" });
    expect(containsBlockedWord("B!TCH")).toBe(true);
  });

  it("normalizes text before matching", () => {
    expect(normalizeText("F@ke $tyle 1337")).toBe("fakestyleieet");
  });
});

describe("containsUrl", () => {
  it("detects common link shapes", () => {
    expect(containsUrl("https://a.b/c")).toBe(true);
    expect(containsUrl("see www.foo.io")).toBe(true);
    expect(containsUrl("join me at chatapp.gg/room")).toBe(true);
    expect(containsUrl("just normal words here")).toBe(false);
  });
});
