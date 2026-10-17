// Zikho (Elo) rating math. Displayed rating IS the Elo rating.
// Pure functions so client + server share identical behaviour.

export const START_RATING = 1000;
export const MIN_RATING = 0;

export type Score = 1 | 0.5 | 0;

/** Expected score for `a` against `b`. */
export function expectedScore(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** K-factor: 40 for the first 30 matches, 24 up to 2000, 16 above. */
export function kFactor(rating: number, games: number): number {
  if (games < 30) return 40;
  if (rating < 2000) return 24;
  return 16;
}

export interface EloResult {
  rating: number;
  delta: number;
  k: number;
  expected: number;
}

/** New rating after a match. `games` = matches played BEFORE this one. */
export function applyElo(rating: number, oppRating: number, score: Score, games: number): EloResult {
  const k = kFactor(rating, games);
  const expected = expectedScore(rating, oppRating);
  const next = Math.round(rating + k * (score - expected));
  const clamped = Math.max(MIN_RATING, next);
  return { rating: clamped, delta: clamped - rating, k, expected };
}

/** Arena unlock thresholds by rating (Mudzi always open). */
export const ARENA_UNLOCKS: { arena: string; rating: number }[] = [
  { arena: 'mudzi', rating: 0 },
  { arena: 'msika', rating: 400 },
  { arena: 'blantyre', rating: 800 },
  { arena: 'nyanja', rating: 1200 },
  { arena: 'tiyi', rating: 1600 },
  { arena: 'nyika', rating: 2000 },
];

export function arenaUnlocked(arena: string, rating: number): boolean {
  const row = ARENA_UNLOCKS.find((r) => r.arena === arena);
  return row ? rating >= row.rating : false;
}
