/**
 * Pure chat-content validation — no I/O, fully unit-testable.
 * Applies, in order: emptiness, length cap, URL filtering, profanity filter.
 */

export const MAX_MESSAGE_LENGTH = 500;

export type ChatRejection = "empty" | "too_long" | "blocked_content";

const URL_RE = /(https?:\/\/|www\.)\S+/i;
/** Common TLDs people use to sneak contact info past filters. */
const DOMAIN_RE =
  /\b[a-z0-9-]{2,}\.(com|net|org|io|xyz|ru|me|gg|tv|link|to|co|club|online|site|shop)\b/i;

/** MVP blocklist — swap for a proper moderation service in the safety phase. */
const BLOCKED_WORDS = [
  "fuck", "shit", "bitch", "asshole", "cunt", "nigger", "nigga",
  "faggot", "whore", "slut", "rape",
];

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "!": "i",
};

/** lower-case, de-leet, strip everything that isn't a letter */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .split("")
    .map((ch) => LEET[ch] ?? ch)
    .join("")
    .replace(/[^a-z]/g, "");
}

export function containsBlockedWord(input: string): boolean {
  const normalized = normalizeText(input);
  return BLOCKED_WORDS.some((word) => normalized.includes(word));
}

export function containsUrl(input: string): boolean {
  return URL_RE.test(input) || DOMAIN_RE.test(input);
}

export type ChatValidation =
  | { ok: true }
  | { ok: false; code: ChatRejection; message: string };

export function validateChatBody(raw: string): ChatValidation {
  const body = raw.trim();
  if (body.length === 0) {
    return { ok: false, code: "empty", message: "Message is empty" };
  }
  if (body.length > MAX_MESSAGE_LENGTH) {
    return { ok: false, code: "too_long", message: `Message exceeds ${MAX_MESSAGE_LENGTH} characters` };
  }
  if (containsUrl(body)) {
    return { ok: false, code: "blocked_content", message: "Links are not allowed in chat" };
  }
  if (containsBlockedWord(body)) {
    return { ok: false, code: "blocked_content", message: "Message contains blocked content" };
  }
  return { ok: true };
}
