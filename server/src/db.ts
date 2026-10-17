// Storage interface. MemoryDb is the default (dev, tests, single instance
// without Postgres); PgDb implements the same contract on Postgres.
import { randomUUID } from 'node:crypto';

export interface PlayerRow {
  id: string;
  name: string;
  tag: string;
  tokenVersion: number;
  recoveryHash: string | null;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  lastRename: number; // epoch ms, 0 = never
  flags: number; // invalid-input strikes
  createdAt: number;
  lastSeen: number;
}

export interface MatchRow {
  id: string;
  p1: string;
  p2: string;
  winner: string | null;
  p1RatingBefore: number;
  p2RatingBefore: number;
  p1Delta: number;
  p2Delta: number;
  towersP1: number;
  towersP2: number;
  durationS: number;
  endedReason: string;
  createdAt: number;
}

export interface RatingPoint {
  matchId: string;
  rating: number;
  at: number;
}

export interface PlayerCreate {
  name: string;
  tag: string;
  recoveryHash: string;
}

export interface Db {
  kind: string;
  migrate(): Promise<void>;
  close(): Promise<void>;
  createPlayer(p: PlayerCreate): Promise<PlayerRow>;
  findPlayerById(id: string): Promise<PlayerRow | null>;
  findPlayerByName(name: string): Promise<PlayerRow[]>;
  findPlayerByRecoveryHash(check: (hash: string) => Promise<boolean>): Promise<PlayerRow | null>;
  touchSeen(id: string): Promise<void>;
  updateRating(id: string, rating: number, won: boolean, drawn: boolean): Promise<PlayerRow>;
  rename(id: string, name: string, tag: string): Promise<PlayerRow>;
  addFlag(id: string): Promise<number>;
  leaderboard(limit: number): Promise<(PlayerRow & { rank: number })[]>;
  rankOf(id: string): Promise<number>;
  countPlayers(): Promise<number>;
  recordMatch(m: Omit<MatchRow, 'createdAt'>): Promise<void>;
  addHistory(playerId: string, matchId: string, ratingAfter: number): Promise<void>;
  history(playerId: string, limit: number): Promise<RatingPoint[]>;
}

export function newId(): string {
  return randomUUID();
}

export class MemoryDb implements Db {
  kind = 'memory';
  players = new Map<string, PlayerRow>();
  matches: MatchRow[] = [];
  histByPlayer = new Map<string, RatingPoint[]>();

  async migrate(): Promise<void> { /* nothing to do */ }
  async close(): Promise<void> { /* nothing to do */ }

  async createPlayer(p: PlayerCreate): Promise<PlayerRow> {
    const now = Date.now();
    const row: PlayerRow = {
      id: newId(), name: p.name, tag: p.tag, tokenVersion: 0,
      recoveryHash: p.recoveryHash, rating: 1000, games: 0, wins: 0,
      losses: 0, lastRename: 0, flags: 0, createdAt: now, lastSeen: now,
    };
    this.players.set(row.id, row);
    return { ...row };
  }

  async findPlayerById(id: string): Promise<PlayerRow | null> {
    const r = this.players.get(id);
    return r ? { ...r } : null;
  }

  async findPlayerByName(name: string): Promise<PlayerRow[]> {
    const low = name.toLowerCase();
    return [...this.players.values()].filter((p) => p.name.toLowerCase() === low).map((p) => ({ ...p }));
  }

  async findPlayerByRecoveryHash(check: (hash: string) => Promise<boolean>): Promise<PlayerRow | null> {
    for (const p of this.players.values()) {
      if (p.recoveryHash && await check(p.recoveryHash)) return { ...p };
    }
    return null;
  }

  async touchSeen(id: string): Promise<void> {
    const r = this.players.get(id);
    if (r) r.lastSeen = Date.now();
  }

  async updateRating(id: string, rating: number, won: boolean, drawn: boolean): Promise<PlayerRow> {
    const r = this.players.get(id);
    if (!r) throw new Error('no such player');
    r.rating = rating;
    r.games += 1;
    if (won) r.wins += 1;
    else if (!drawn) r.losses += 1;
    r.lastSeen = Date.now();
    return { ...r };
  }

  async rename(id: string, name: string, tag: string): Promise<PlayerRow> {
    const r = this.players.get(id);
    if (!r) throw new Error('no such player');
    r.name = name;
    r.tag = tag;
    r.lastRename = Date.now();
    return { ...r };
  }

  async addFlag(id: string): Promise<number> {
    const r = this.players.get(id);
    if (!r) return 0;
    r.flags += 1;
    return r.flags;
  }

  private sorted(): PlayerRow[] {
    return [...this.players.values()].sort((a, b) => b.rating - a.rating || a.createdAt - b.createdAt);
  }

  async leaderboard(limit: number): Promise<(PlayerRow & { rank: number })[]> {
    return this.sorted().slice(0, limit).map((p, i) => ({ ...p, rank: i + 1 }));
  }

  async rankOf(id: string): Promise<number> {
    const idx = this.sorted().findIndex((p) => p.id === id);
    return idx < 0 ? 0 : idx + 1;
  }

  async countPlayers(): Promise<number> {
    return this.players.size;
  }

  async recordMatch(m: Omit<MatchRow, 'createdAt'>): Promise<void> {
    this.matches.push({ ...m, createdAt: Date.now() });
  }

  async addHistory(playerId: string, matchId: string, ratingAfter: number): Promise<void> {
    const list = this.histByPlayer.get(playerId) ?? [];
    list.push({ matchId, rating: ratingAfter, at: Date.now() });
    this.histByPlayer.set(playerId, list);
  }

  async history(playerId: string, limit: number): Promise<RatingPoint[]> {
    return (this.histByPlayer.get(playerId) ?? []).slice(-limit);
  }
}
