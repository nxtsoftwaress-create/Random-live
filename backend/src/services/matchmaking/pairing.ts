/**
 * Pure matchmaking pairing logic — no I/O, fully unit-testable.
 *
 * Two modes:
 *  - deterministic (no `rng`): greedy oldest-first, best score. Used by tests.
 *  - random (`rng` supplied): every tick shuffles the queue and picks partners
 *    at random, weighted by wait time and shared interests. Two people who are
 *    both waiting should meet a random stranger, not always the same neighbour
 *    at the head of the queue — but nobody may starve, so users who have waited
 *    twice the widen window are promoted ahead of the shuffle.
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
  /** Uniform [0,1) source. When present, pairing is randomized. */
  rng?: () => number;
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

/** In-place Fisher–Yates shuffle; returns a new array. */
function shuffled<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/**
 * Random option pick, weighted so people who have been waiting longer are more
 * likely to be chosen. Zero/negative weights fall back to a uniform pick.
 */
function pickWeighted(options: Candidate[], weights: number[], rng: () => number): Candidate {
  const total = weights.reduce((sum, w) => sum + (w > 0 ? w : 0), 0);
  if (total <= 0) return options[Math.floor(rng() * options.length)]!;

  let ticket = rng() * total;
  for (let i = 0; i < options.length; i++) {
    ticket -= weights[i]! > 0 ? weights[i]! : 0;
    if (ticket <= 0) return options[i]!;
  }
  return options[options.length - 1]!;
}

/**
 * Greedy pairing over the candidate order; for each unmatched user, pick a
 * partner. Deterministic mode uses the best score, random mode a weighted
 * random pick. Returns matched pairs in order.
 */
export function selectPairs(
  candidates: Candidate[],
  ctx: PairingContext,
): Array<[Candidate, Candidate]> {
  let order = [...candidates].sort((x, y) => x.joinedAt - y.joinedAt);

  if (ctx.rng) {
    // Starvation guard: the longest waiters are placed first, and only they
    // keep their wait-based priority. Everyone else is shuffled every tick so
    // the same two people don't keep meeting.
    const starvingAfter = ctx.widenMs * 2;
    const starving = order.filter((c) => waitedMs(c, ctx) >= starvingAfter);
    const rest = order.filter((c) => waitedMs(c, ctx) < starvingAfter);
    order = [...shuffled(starving, ctx.rng), ...shuffled(rest, ctx.rng)];
  }

  const used = new Set<string>();
  const pairs: Array<[Candidate, Candidate]> = [];

  for (let i = 0; i < order.length; i++) {
    const a = order[i];
    if (!a || used.has(a.userId)) continue;

    const compatible: Candidate[] = [];
    for (let j = 0; j < order.length; j++) {
      const b = order[j];
      if (!b || b.userId === a.userId || used.has(b.userId)) continue;
      if (ctx.isExcluded?.(a.userId, b.userId) || ctx.isExcluded?.(b.userId, a.userId)) continue;
      if (!languageCompatible(a, b, ctx)) continue;
      compatible.push(b);
    }
    if (compatible.length === 0) continue;

    let partner: Candidate;
    if (ctx.rng) {
      const weights = compatible.map((b) => {
        // 1 + seconds waited + a strong nudge for shared interests.
        const base = 1 + waitedMs(b, ctx) / 1000;
        return base * (1 + interestOverlap(a, b) * 3);
      });
      partner = pickWeighted(compatible, weights, ctx.rng);
    } else {
      partner = compatible[0]!;
      let bestScore = -Infinity;
      for (const b of compatible) {
        const score = pairScore(a, b, ctx);
        if (score > bestScore) {
          bestScore = score;
          partner = b;
        }
      }
    }

    used.add(a.userId);
    used.add(partner.userId);
    pairs.push([a, partner]);
  }

  return pairs;
}
