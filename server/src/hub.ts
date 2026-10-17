// Hub: owns sockets, rooms, matchmaking glue, stats and rematch pairing.
// Single instance (documented scale path: Redis + sticky routing).
import type { WebSocket } from 'ws';
import { STARTER_DECK, ALL_CARD_IDS } from '../../shared/sim/cards.js';
import type { ServerMsg } from '../../shared/protocol.js';
import type { Config } from './config.js';
import type { Db, PlayerRow } from './db.js';
import { MatchRoom } from './rooms.js';
import { Matchmaker, type QueueEntry } from './matchmaker.js';

export interface Conn {
  ws: WebSocket;
  userId: string;
  row: PlayerRow;
  roomId: string | null;
  msgTimes: number[];
  strikes: number;
  lastPong: number;
  alive: boolean;
  send(m: ServerMsg): void;
}

function validDeck(deck: unknown): string[] {
  if (Array.isArray(deck) && deck.length === 8 && deck.every((c) => typeof c === 'string' && ALL_CARD_IDS.includes(c))) {
    return [...deck] as string[];
  }
  return [...STARTER_DECK];
}

export class Hub {
  readonly mm = new Matchmaker();
  readonly rooms = new Map<string, MatchRoom>();
  readonly conns = new Map<string, Set<Conn>>(); // userId -> sockets
  desyncs = 0;
  matchesPlayed = 0;
  readonly startedAt = Date.now();
  draining = false;

  constructor(
    readonly config: Config,
    readonly db: Db,
  ) {}

  private log(...a: unknown[]): void {
    console.log('[hub]', ...a);
  }

  addConn(c: Conn): void {
    let set = this.conns.get(c.userId);
    if (!set) { set = new Set(); this.conns.set(c.userId, set); }
    set.add(c);
  }

  removeConn(c: Conn): void {
    const set = this.conns.get(c.userId);
    if (set) {
      set.delete(c);
      if (set.size === 0) this.conns.delete(c.userId);
    }
  }

  socketsOf(userId: string): Conn[] {
    return [...(this.conns.get(userId) ?? [])];
  }

  onlineSockets(): number {
    let n = 0;
    for (const set of this.conns.values()) n += set.size;
    return n;
  }

  inBattle(): number {
    let n = 0;
    for (const r of this.rooms.values()) if (!r.over) n += 2;
    return n;
  }

  stats() {
    return {
      online: this.onlineSockets(),
      inQueue: this.mm.size,
      inBattle: this.inBattle(),
    };
  }

  broadcastStats(registered: number): void {
    const s = { ...this.stats(), registered };
    for (const set of this.conns.values()) {
      for (const c of set) {
        try { c.send({ type: 'stats', ...s }); } catch { /* drop */ }
      }
    }
  }

  roomOfUser(userId: string): MatchRoom | null {
    for (const r of this.rooms.values()) {
      if (!r.over && r.slots.some((s) => s.userId === userId)) return r;
    }
    return null;
  }

  enqueue(userId: string, row: PlayerRow, deck: unknown): { position: number; window: number } | { error: string } {
    if (this.draining) return { error: 'Server update — queue paused, try again shortly.' };
    if (this.roomOfUser(userId)) return { error: 'Already in a match.' };
    const position = this.mm.enqueue({
      userId, name: row.name, rating: row.rating, since: Date.now(), aiOffered: false,
    });
    // stash the deck on the queue entry via a side map
    this.decks.set(userId, validDeck(deck));
    return { position, window: this.mm.windowFor(userId, Date.now()) };
  }

  private decks = new Map<string, string[]>();

  dequeue(userId: string): void {
    this.mm.dequeue(userId);
    this.decks.delete(userId);
  }

  sweep(): void {
    const now = Date.now();
    this.mm.sweep(now, (a, b) => this.createRoom(a, b));
    for (const e of this.mm.dueAiOffers(now)) {
      for (const c of this.socketsOf(e.userId)) {
        try { c.send({ type: 'ai_offer' }); } catch { /* drop */ }
      }
    }
  }

  private createRoom(a: QueueEntry, b: QueueEntry): void {
    if (this.draining) {
      // put them back; queue is paused during deploys
      this.mm.enqueue(a);
      this.mm.enqueue(b);
      return;
    }
    void this.db.findPlayerById(a.userId).then(async (ra) => {
      const rb = await this.db.findPlayerById(b.userId);
      if (!ra || !rb) return;
      // both must still be around (socket or not — rooms tolerate reconnects)
      const room = new MatchRoom(
        this.db, ra, rb,
        this.decks.get(a.userId) ?? [...STARTER_DECK],
        this.decks.get(b.userId) ?? [...STARTER_DECK],
        this.config.tickMs,
        {
          onEnd: (r) => this.onRoomEnd(r),
          onDesync: (roomId, userId, tick) => {
            this.desyncs++;
            console.log(`[desync] room=${roomId} user=${userId} tick=${tick}`);
          },
        },
      );
      this.decks.delete(a.userId);
      this.decks.delete(b.userId);
      this.rooms.set(room.id, room);
      this.matchesPlayed++;
      for (const s of room.slots) {
        const conns = this.socketsOf(s.userId);
        if (conns.length > 0) {
          room.attach(s.userId, conns[0]);
          for (const c of conns) c.roomId = room.id;
        }
      }
      this.log(`match ${room.id} seed=${room.seed} ${ra.name}#${ra.tag} (${ra.rating}) vs ${rb.name}#${rb.tag} (${rb.rating})`);
      room.start(3000);
    }).catch((err) => console.error('[hub] createRoom failed:', (err as Error).message));
  }

  private onRoomEnd(room: MatchRoom): void {
    // keep the ended room briefly so rematch_accept can find it
    setTimeout(() => {
      if (room.over) {
        room.destroy();
        this.rooms.delete(room.id);
      }
    }, 60_000).unref?.();
  }

  rematch(userId: string): void {
    const room = [...this.rooms.values()].find((r) => r.slots.some((s) => s.userId === userId));
    if (!room) return;
    room.rematch.add(userId);
    const [a, b] = room.slots;
    const other = a.userId === userId ? b : a;
    for (const c of this.socketsOf(other.userId)) {
      try { c.send({ type: 'rematch_asked' }); } catch { /* drop */ }
    }
    if (room.rematch.has(a.userId) && room.rematch.has(b.userId) && room.over) {
      this.startRematch(room);
    }
  }

  private startRematch(old: MatchRoom): void {
    void (async () => {
      const ra = await this.db.findPlayerById(old.slots[0].userId);
      const rb = await this.db.findPlayerById(old.slots[1].userId);
      if (!ra || !rb) return;
      old.rematch.clear();
      const room = new MatchRoom(this.db, ra, rb, [...old.decks[0]], [...old.decks[1]], this.config.tickMs, {
        onEnd: (r) => this.onRoomEnd(r),
        onDesync: (roomId, userId, tick) => {
          this.desyncs++;
          console.log(`[desync] room=${roomId} user=${userId} tick=${tick}`);
        },
      });
      this.rooms.set(room.id, room);
      this.matchesPlayed++;
      for (const s of room.slots) {
        const conns = this.socketsOf(s.userId);
        if (conns.length > 0) {
          room.attach(s.userId, conns[0]);
          for (const c of conns) c.roomId = room.id;
        }
      }
      room.start(3000);
    })().catch((err) => console.error('[hub] rematch failed:', (err as Error).message));
  }

  /** Graceful deploy: stop queueing, tell clients, wait for rooms. */
  async drainAndWait(maxMs: number): Promise<void> {
    this.draining = true;
    this.mm.draining = true;
    for (const set of this.conns.values()) {
      for (const c of set) {
        try { c.send({ type: 'update', text: 'Server update — finishing current matches' }); } catch { /* drop */ }
      }
    }
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const live = [...this.rooms.values()].filter((r) => !r.over);
      if (live.length === 0) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

