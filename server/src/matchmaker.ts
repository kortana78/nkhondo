// Rating-window matchmaking: start at ±50, widen +50 every 5s, cap ±400.
// After 30s with no human partner, the client is offered unranked AI.
export interface QueueEntry {
  userId: string;
  name: string;
  rating: number;
  since: number;
  aiOffered: boolean;
}

export const AI_OFFER_AFTER_MS = 30_000;

/** Rating window half-width for a given queue wait. */
export function matchWindow(waitedMs: number): number {
  return Math.min(400, 50 + 50 * Math.floor(waitedMs / 5000));
}

export class Matchmaker {
  private q: QueueEntry[] = [];
  draining = false;

  enqueue(e: QueueEntry): number {
    this.dequeue(e.userId);
    this.q.push(e);
    return this.q.length;
  }

  dequeue(userId: string): boolean {
    const n = this.q.length;
    this.q = this.q.filter((e) => e.userId !== userId);
    return this.q.length !== n;
  }

  has(userId: string): boolean {
    return this.q.some((e) => e.userId === userId);
  }

  get size(): number {
    return this.q.length;
  }

  position(userId: string): number {
    const i = this.q.findIndex((e) => e.userId === userId);
    return i < 0 ? 0 : i + 1;
  }

  windowFor(userId: string, now: number): number {
    const e = this.q.find((x) => x.userId === userId);
    return e ? matchWindow(now - e.since) : 50;
  }

  /** Entries waiting >= 30s that haven't been offered AI yet. */
  dueAiOffers(now: number): QueueEntry[] {
    const out: QueueEntry[] = [];
    for (const e of this.q) {
      if (!e.aiOffered && now - e.since >= AI_OFFER_AFTER_MS) {
        e.aiOffered = true;
        out.push({ ...e });
      }
    }
    return out;
  }

  /** Greedy longest-wait-first pairing. Calls pair() per match. */
  sweep(now: number, pair: (a: QueueEntry, b: QueueEntry) => void): void {
    if (this.draining || this.q.length < 2) return;
    const order = [...this.q].sort((a, b) => a.since - b.since);
    const used = new Set<string>();
    for (const e of order) {
      if (used.has(e.userId)) continue;
      const w = matchWindow(now - e.since);
      let best: QueueEntry | null = null;
      let bestDiff = Infinity;
      for (const c of order) {
        if (c.userId === e.userId || used.has(c.userId)) continue;
        const d = Math.abs(c.rating - e.rating);
        if (d <= w && d < bestDiff) { best = c; bestDiff = d; }
      }
      if (best) {
        used.add(e.userId);
        used.add(best.userId);
        pair({ ...e }, { ...best });
      }
    }
    if (used.size > 0) this.q = this.q.filter((e) => !used.has(e.userId));
  }
}
