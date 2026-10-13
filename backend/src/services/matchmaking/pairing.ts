/**
 * Pure matchmaking pairing logic — no I/O, fully unit-testable.
 * Greedy oldest-first pairing with best-partner selection per candidate.
 */

export interface Candidate {
  userId: string;
  socketId: string;
  language: string;
  interests: string[];
  joinedAt: number; // epoch ms
}

export interface PairingContext {
  now: number;
  /** Wait time after which the language restriction widens to global. */
  widenMs: number;
  /** Returns true when the two users must NOT be matched (blocks / recent partners). */
  isExcluded?: (aUserId: string, bUserId: string) => boolean;
}

export function waitedMs(candidate: Candidate, ctx: PairingContext): number {
  return Math.max(0, ctx.now - candidate.joinedAt);
}

/** Same language, either side opted into "any", or both waited past the widen window. */
export function languageCompatible(a: Candidate, b: Candidate, ctx: PairingContext): boolean {
  if (a.language === b.language) return true;
  if (a.language === "any" || b.language === "any") return true;
  return waitedMs(a, ctx) >= ctx.widenMs && waitedMs(b, ctx) >= ctx.widenMs;
}

export function interestOverlap(a: Candidate, b: Candidate): number {
  if (a.interests.length === 0 || b.interests.length === 0) return 0;
  const setB = new Set(b.interests);
  let shared = 0;
  for (const tag of a.interests) if (setB.has(tag)) shared++;
  return shared;
}

/** Higher is better: shared interests dominate, then longest waiting pair. */
export function pairScore(a: Candidate, b: Candidate, ctx: PairingContext): number {
  return interestOverlap(a, b) * 1000 - (waitedMs(a, ctx) + waitedMs(b, ctx)) / 1000;
}

/**
 * Greedy pairing: iterate candidates oldest-first; for each, pick the best
 * compatible unused partner. Returns matched pairs in order.
 */
export function selectPairs(
  candidates: Candidate[],
  ctx: PairingContext,
): Array<[Candidate, Candidate]> {
  const sorted = [...candidates].sort((x, y) => x.joinedAt - y.joinedAt);
  const used = new Set<string>();
  const pairs: Array<[Candidate, Candidate]> = [];

  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i];
    if (!a || used.has(a.userId)) continue;

    let best: Candidate | null = null;
    let bestScore = -Infinity;

    for (let j = i + 1; j < sorted.length; j++) {
      const b = sorted[j];
      if (!b || used.has(b.userId)) continue;
      if (a.userId === b.userId) continue;
      if (ctx.isExcluded?.(a.userId, b.userId) || ctx.isExcluded?.(b.userId, a.userId)) continue;
      if (!languageCompatible(a, b, ctx)) continue;

      const score = pairScore(a, b, ctx);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }

    if (best) {
      used.add(a.userId);
      used.add(best.userId);
      pairs.push([a, best]);
    }
  }

  return pairs;
}
