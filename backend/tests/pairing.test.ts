import { describe, expect, it } from "vitest";
import {
  selectPairs,
  languageCompatible,
  interestOverlap,
  type Candidate,
  type PairingContext,
} from "../src/services/matchmaking/pairing.js";

const NOW = 1_000_000_000;

function candidate(overrides: Partial<Candidate> & { userId: string }): Candidate {
  return {
    socketId: `socket_${overrides.userId}`,
    language: "en",
    interests: [],
    joinedAt: NOW,
    ...overrides,
  };
}

const ctx = (overrides: Partial<PairingContext> = {}): PairingContext => ({
  now: NOW + 1000,
  widenMs: 10_000,
  ...overrides,
});

describe("selectPairs", () => {
  it("pairs two users who speak the same language", () => {
    const a = candidate({ userId: "a" });
    const b = candidate({ userId: "b" });
    const pairs = selectPairs([a, b], ctx());
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.map((c) => c.userId).sort()).toEqual(["a", "b"]);
  });

  it("does not pair different languages before the widen window", () => {
    const a = candidate({ userId: "a", language: "en" });
    const b = candidate({ userId: "b", language: "es" });
    expect(selectPairs([a, b], ctx({ now: NOW + 5_000 }))).toHaveLength(0);
  });

  it("pairs different languages once both waited past the widen window", () => {
    const a = candidate({ userId: "a", language: "en", joinedAt: NOW - 11_000 });
    const b = candidate({ userId: "b", language: "es", joinedAt: NOW - 11_000 });
    const pairs = selectPairs([a, b], ctx({ now: NOW }));
    expect(pairs).toHaveLength(1);
  });

  it("treats language 'any' as an immediate wildcard", () => {
    const a = candidate({ userId: "a", language: "any" });
    const b = candidate({ userId: "b", language: "ja" });
    expect(selectPairs([a, b], ctx({ now: NOW + 1 }))).toHaveLength(1);
  });

  it("never pairs excluded users (blocks / recent partners)", () => {
    const a = candidate({ userId: "a" });
    const b = candidate({ userId: "b" });
    const pairs = selectPairs([a, b], ctx({ isExcluded: (x, y) => x === "a" && y === "b" }));
    expect(pairs).toHaveLength(0);
  });

  it("exclusion is checked in both directions", () => {
    const a = candidate({ userId: "a" });
    const b = candidate({ userId: "b" });
    const pairs = selectPairs([a, b], ctx({ isExcluded: (x, y) => x === "b" && y === "a" }));
    expect(pairs).toHaveLength(0);
  });

  it("does not double-pair a user across pairs", () => {
    const users = ["a", "b", "c", "d"].map((id) => candidate({ userId: id }));
    const pairs = selectPairs(users, ctx());
    const seen = pairs.flat().map((c) => c.userId);
    expect(new Set(seen).size).toBe(seen.length);
    expect(pairs).toHaveLength(2);
  });

  it("leaves unmatched users out (odd count)", () => {
    const users = ["a", "b", "c"].map((id) => candidate({ userId: id }));
    const pairs = selectPairs(users, ctx());
    expect(pairs).toHaveLength(1);
  });

  it("returns no pairs for empty or single-candidate queues", () => {
    expect(selectPairs([], ctx())).toHaveLength(0);
    expect(selectPairs([candidate({ userId: "solo" })], ctx())).toHaveLength(0);
  });

  it("prefers shared interests over simply the longest-waiting partner", () => {
    const a = candidate({ userId: "a", interests: ["gaming"], joinedAt: NOW - 20_000 });
    const boring = candidate({ userId: "boring", joinedAt: NOW - 19_000 }); // waited longer
    const gamer = candidate({ userId: "gamer", interests: ["gaming"], joinedAt: NOW - 18_000 });

    const pairs = selectPairs([a, boring, gamer], ctx());
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.map((c) => c.userId).sort()).toEqual(["a", "gamer"]);
  });
});

/** Deterministic PRNG so a randomized test still fails reliably when broken. */
function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("selectPairs with random matching", () => {
  it("still pairs only compatible, unused users", () => {
    const users = ["a", "b", "c", "d", "e"].map((id) => candidate({ userId: id }));
    const pairs = selectPairs(users, ctx({ rng: seededRng(7) }));
    const seen = pairs.flat().map((c) => c.userId);
    expect(new Set(seen).size).toBe(seen.length);
    expect(pairs).toHaveLength(2);
    for (const [x, y] of pairs) expect(languageCompatible(x, y, ctx())).toBe(true);
  });

  it("honours exclusions in random mode", () => {
    const a = candidate({ userId: "a" });
    const b = candidate({ userId: "b" });
    expect(
      selectPairs([a, b], ctx({ rng: seededRng(3), isExcluded: () => true })),
    ).toHaveLength(0);
  });

  it("does not always produce the same pairing", () => {
    const users = ["a", "b", "c", "d"].map((id) => candidate({ userId: id }));
    const layouts = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const pairs = selectPairs(users, ctx({ rng: seededRng(seed) }));
      layouts.add(
        pairs
          .map(([x, y]) => [x.userId, y.userId].sort().join("+"))
          .sort()
          .join("|"),
      );
    }
    expect(layouts.size).toBeGreaterThan(1);
  });

  it("promotes long waiters ahead of the shuffle so nobody starves", () => {
    const starving = candidate({ userId: "starving", joinedAt: NOW - 60_000 });
    const others = ["b", "c", "d", "e"].map((id) => candidate({ userId: id, joinedAt: NOW }));
    for (let seed = 1; seed <= 10; seed++) {
      const pairs = selectPairs([starving, ...others], ctx({ rng: seededRng(seed) }));
      expect(pairs.flat().map((c) => c.userId)).toContain("starving");
    }
  });
});

describe("languageCompatible / interestOverlap", () => {
  it("languageCompatible handles same language immediately", () => {
    const a = candidate({ userId: "a", language: "en", joinedAt: NOW });
    const b = candidate({ userId: "b", language: "en", joinedAt: NOW });
    expect(languageCompatible(a, b, ctx({ now: NOW + 1 }))).toBe(true);
  });

  it("interestOverlap counts shared tags", () => {
    const a = candidate({ userId: "a", interests: ["gaming", "music", "travel"] });
    const b = candidate({ userId: "b", interests: ["music", "travel", "movies"] });
    expect(interestOverlap(a, b)).toBe(2);
    expect(interestOverlap(a, candidate({ userId: "c", interests: [] }))).toBe(0);
  });
});
