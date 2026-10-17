// Authoritative match room: runs the sim, validates every input,
// broadcasts scheduled deploys, checks state hashes, handles
// reconnects/forfeits, settles Elo + DB rows at the end.
import { randomUUID } from 'node:crypto';
import {
  Battle, flipState, hashBattleState, nudgeDeploy,
  type BattleState,
} from '../../shared/sim/battle.js';
import {
  DEPLOY_DELAY_TICKS, HASH_CHECK_EVERY, RECONNECT_WINDOW_S,
  TICK_BROADCAST_EVERY,
  type DeployedMsg, type FoeInfo, type ServerMsg, type TeamId,
} from '../../shared/protocol.js';
import { applyElo } from '../../shared/elo.js';
import type { Db, PlayerRow } from './db.js';

export interface SlotNet {
  send(m: ServerMsg): void;
}

interface Slot {
  userId: string;
  team: TeamId;
  name: string;
  tag: string;
  rating: number;
  games: number;
  conn: SlotNet | null;
  connected: boolean;
  disconnectAt: number;
  invalidStrikes: number;
  lastDeployAt: number;
  /** recent clientSeqs for duplicate suppression (lossy-link resends) */
  seenSeqs: (number | string)[];
}

export interface RoomEndInfo {
  roomId: string;
  winner: TeamId | 2;
  reason: string;
  durationS: number;
}

export class MatchRoom {
  readonly id = randomUUID();
  readonly seed: number;
  readonly battle: Battle;
  readonly createdAt = Date.now();
  readonly decks: [string[], string[]];
  slots: [Slot, Slot];
  pending: DeployedMsg[] = [];
  over = false;
  endReason = '';
  winner: TeamId | 2 = 2;
  rematch = new Set<string>();
  desyncs = 0;

  private seq = 1;
  private timer: NodeJS.Timeout | null = null;
  private acc = 0;
  private lastStep = 0;
  private hashHist = new Map<number, { canon: string; flipped: string }>();
  private stateHist = new Map<number, BattleState>();
  private started = false;

  constructor(
    private db: Db,
    p1: PlayerRow,
    p2: PlayerRow,
    deck1: string[],
    deck2: string[],
    private tickMs: number,
    private opts: {
      onEnd: (room: MatchRoom, info: RoomEndInfo) => void;
      onDesync: (roomId: string, userId: string, tick: number) => void;
      /** fixed seed (tests); defaults to random */
      seed?: number;
    },
  ) {
    this.seed = opts.seed !== undefined ? opts.seed >>> 0 : (Math.floor(Math.random() * 0xffffffff)) >>> 0;
    this.decks = [[...deck1], [...deck2]];
    this.battle = new Battle(this.seed, this.decks[0], this.decks[1]);
    const mk = (row: PlayerRow, team: TeamId): Slot => ({
      userId: row.id, team, name: row.name, tag: row.tag,
      rating: row.rating, games: row.games,
      conn: null, connected: false, disconnectAt: 0,
      invalidStrikes: 0, lastDeployAt: 0, seenSeqs: [],
    });
    this.slots = [mk(p1, 0), mk(p2, 1)];
  }

  foeInfo(team: TeamId): FoeInfo {
    const o = this.slots[team === 0 ? 1 : 0];
    return { name: o.name, tag: o.tag, rating: o.rating };
  }

  attach(userId: string, conn: SlotNet): boolean {
    const s = this.slots.find((x) => x.userId === userId);
    if (!s) return false;
    s.conn = conn;
    s.connected = true;
    s.disconnectAt = 0;
    return true;
  }

  /** countdownMs delay, then the sim starts for real. */
  start(countdownMs: number): void {
    for (const s of this.slots) {
      s.conn?.send({
        type: 'match_found', matchId: this.id, seed: this.seed,
        yourTeam: s.team, deck: [...this.decks[s.team]], foeDeck: [...this.decks[s.team === 0 ? 1 : 0]],
        foe: this.foeInfo(s.team), countdownMs,
      });
    }
    setTimeout(() => {
      if (this.over) return;
      this.started = true;
      this.lastStep = Date.now();
      for (const s of this.slots) s.conn?.send({ type: 'match_start', tick: 0 });
      this.timer = setInterval(() => this.pump(), Math.max(10, Math.floor(this.tickMs / 2)));
    }, countdownMs);
  }

  private pump(): void {
    if (this.over) return;
    const now = Date.now();
    this.acc += now - this.lastStep;
    this.lastStep = now;
    let n = 0;
    while (this.acc >= this.tickMs && n < 10 && !this.battle.over) {
      this.acc -= this.tickMs;
      n++;
      this.applyDue();
      this.battle.step();
      const t = this.battle.tick;
      if (t % TICK_BROADCAST_EVERY === 0) this.broadcast({ type: 'tick', serverTick: t });
      if (t % HASH_CHECK_EVERY === 0) {
        const st = this.battle.getState();
        this.hashHist.set(t, { canon: hashBattleState(st, false), flipped: hashBattleState(flipState(st), true) });
        if (process.env.NKHONDO_DESYNC_DEBUG) {
          this.stateHist.set(t, st);
          if (this.stateHist.size > 6) {
            const oldest = Math.min(...this.stateHist.keys());
            this.stateHist.delete(oldest);
          }
        }
        if (this.hashHist.size > 40) {
          const oldest = Math.min(...this.hashHist.keys());
          this.hashHist.delete(oldest);
        }
      }
    }
    if (this.battle.over && !this.over) {
      void this.finish(this.battle.winner === 2 ? 2 : (this.battle.winner as TeamId), this.endReasonFor(this.battle));
      return;
    }
    // reconnect window / forfeit sweep
    for (const s of this.slots) {
      if (!s.connected && s.disconnectAt > 0 && now - s.disconnectAt > RECONNECT_WINDOW_S * 1000) {
        const other = (s.team === 0 ? 1 : 0) as TeamId;
        void this.finish(other, 'forfeit');
        return;
      }
    }
  }

  private endReasonFor(b: Battle): string {
    const c0 = b.towers.find((t) => t.owner === 0 && t.kind === 'chief');
    const c1 = b.towers.find((t) => t.owner === 1 && t.kind === 'chief');
    if ((c0 && !c0.alive) || (c1 && !c1.alive)) return 'chief';
    if (b.nsanjaLost(0) !== b.nsanjaLost(1)) return 'towers';
    return 'health';
  }

  private applyDue(): void {
    const t = this.battle.tick;
    const due = this.pending.filter((p) => p.executeTick <= t).sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
    if (due.length === 0) return;
    this.pending = this.pending.filter((p) => p.executeTick > t);
    for (const d of due) {
      // execution can still fail (energy spent on an earlier input); both
      // sides run the same due list, so the result stays identical.
      this.battle.deploy(d.player, d.cardId, d.x, d.z);
    }
  }

  private broadcast(m: ServerMsg): void {
    for (const s of this.slots) {
      try { s.conn?.send(m); } catch { /* drop */ }
    }
  }

  /** Validate + schedule a deploy. Returns the ack to send the sender. */
  submitDeploy(userId: string, cardId: string, x: number, z: number, clientSeq: number): ServerMsg {
    const s = this.slots.find((v) => v.userId === userId);
    if (!s || this.over || !this.started) return { type: 'rejected', clientSeq, reason: 'over' };
    // duplicate suppression: lossy links resend; execute each input once.
    // Re-ack without scheduling so the sender still clears its ghost.
    if (s.seenSeqs.includes(clientSeq)) {
      const prev = this.pending.find((p) => p.clientSeq === clientSeq);
      if (prev) return { type: 'deployed', ...prev };
      return { type: 'rejected', clientSeq, reason: 'over' };
    }
    s.seenSeqs.push(clientSeq);
    if (s.seenSeqs.length > 40) s.seenSeqs.shift();
    const now = Date.now();
    if (now - s.lastDeployAt < 200) {
      s.invalidStrikes++;
      return { type: 'rejected', clientSeq, reason: 'rate' };
    }
    if (typeof cardId !== 'string' || !Number.isFinite(x) || !Number.isFinite(z)) {
      s.invalidStrikes++;
      return { type: 'rejected', clientSeq, reason: 'card' };
    }
    // project energy: validation runs against the live sim (scheduled
    // inputs deduct at execution on both sides, identically)
    const spot = nudgeDeploy(this.battle, s.team, cardId, x, z);
    const chk = spot ? { ok: true, reason: '' } : this.battle.canDeploy(s.team, cardId, x, z);
    if (!spot || !chk.ok) {
      s.invalidStrikes++;
      const reason = chk.ok ? 'invalid' : chk.reason;
      return { type: 'rejected', clientSeq, reason };
    }
    s.lastDeployAt = now;
    s.invalidStrikes = 0;
    const executeTick = this.battle.tick + DEPLOY_DELAY_TICKS;
    const d: DeployedMsg = {
      player: s.team, cardId, x: spot.x, z: spot.z,
      executeTick, seq: this.seq++, clientSeq,
    };
    this.pending.push(d);
    this.pending.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
    const out: ServerMsg = { type: 'deployed', ...d };
    this.broadcast(out);
    return out;
  }

  onHash(userId: string, tick: number, hash: string): void {
    const s = this.slots.find((v) => v.userId === userId);
    if (!s || this.over) return;
    const rec = this.hashHist.get(tick);
    if (!rec) return; // too old / too new; ignore
    const expect = s.team === 0 ? rec.canon : rec.flipped;
    if (expect !== hash) {
      this.desyncs++;
      this.opts.onDesync(this.id, userId, tick);
      if (process.env.NKHONDO_DESYNC_DEBUG) {
        const st = this.stateHist.get(tick);
        console.log(`[desync-state] room=${this.id} tick=${tick} team=${s.team} expected=${expect} got=${hash} state=${st ? JSON.stringify(st.units.map((u) => [u.id, u.owner, u.x, u.z, u.hp, u.cooldown, u.swing, u.targetKind, u.targetId])) : 'n/a'}`);
      }
      this.sendSnapshot(userId);
    }
  }

  onDisconnect(userId: string): void {
    const s = this.slots.find((v) => v.userId === userId);
    if (!s || this.over) return;
    s.conn = null;
    s.connected = false;
    s.disconnectAt = Date.now();
  }

  onReconnect(userId: string, conn: SlotNet): boolean {
    if (!this.attach(userId, conn) || this.over) return false;
    this.sendSnapshot(userId);
    return true;
  }

  sendSnapshot(userId: string): void {
    const s = this.slots.find((v) => v.userId === userId);
    if (!s?.conn) return;
    const pending = this.pending
      .filter((p) => p.executeTick > this.battle.tick)
      .map((p) => ({ ...p }));
    s.conn.send({
      type: 'snapshot', state: this.battle.getState(), pending,
      serverTick: this.battle.tick,
    });
  }

  /** Surrender / leave. The leaver forfeits (if the match is live). */
  abandon(userId: string): void {
    const s = this.slots.find((v) => v.userId === userId);
    if (!s || this.over) return;
    const other = (s.team === 0 ? 1 : 0) as TeamId;
    void this.finish(other, 'forfeit');
  }

  async finish(winner: TeamId | 2, reason: string): Promise<void> {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.endReason = reason;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const [a, b] = this.slots;
    const scoreA = winner === 2 ? 0.5 : winner === a.team ? 1 : 0;
    const scoreB = winner === 2 ? 0.5 : winner === b.team ? 1 : 0;
    const ra = await this.db.findPlayerById(a.userId);
    const rb = await this.db.findPlayerById(b.userId);
    const rA = ra?.rating ?? 1000, gA = ra?.games ?? 0;
    const rB = rb?.rating ?? 1000, gB = rb?.games ?? 0;
    const ea = applyElo(rA, rB, scoreA as 0 | 0.5 | 1, gA);
    const eb = applyElo(rB, rA, scoreB as 0 | 0.5 | 1, gB);
    const durationS = Math.round((Date.now() - this.createdAt) / 1000);
    const towersA = this.battle.nsanjaLost(1) + (this.battle.towers.some((t) => t.owner === 1 && t.kind === 'chief' && !t.alive) ? 1 : 0);
    const towersB = this.battle.nsanjaLost(0) + (this.battle.towers.some((t) => t.owner === 0 && t.kind === 'chief' && !t.alive) ? 1 : 0);
    try {
      if (ra) await this.db.updateRating(a.userId, ea.rating, scoreA === 1, winner === 2);
      if (rb) await this.db.updateRating(b.userId, eb.rating, scoreB === 1, winner === 2);
      await this.db.recordMatch({
        id: this.id, p1: a.userId, p2: b.userId,
        winner: winner === 2 ? null : this.slots[winner].userId,
        p1RatingBefore: rA, p2RatingBefore: rB,
        p1Delta: ea.delta, p2Delta: eb.delta,
        towersP1: towersA, towersP2: towersB,
        durationS, endedReason: reason,
      });
      await this.db.addHistory(a.userId, this.id, ea.rating);
      await this.db.addHistory(b.userId, this.id, eb.rating);
    } catch (err) {
      console.error(`[room ${this.id}] db write failed:`, (err as Error).message);
    }
    for (const s of this.slots) {
      const mine = s.team === 0 ? ea : eb;
      const foe = s.team === 0 ? eb : ea;
      try {
        s.conn?.send({
          type: 'match_end', winner, reason: reason as 'chief',
          youDelta: mine.delta, foeDelta: foe.delta,
          youRating: mine.rating, foeRating: foe.rating,
        });
      } catch { /* drop */ }
    }
    this.opts.onEnd(this, { roomId: this.id, winner, reason, durationS });
  }

  destroy(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.pending = [];
  }

  snapshotForTest(): BattleState {
    return this.battle.getState();
  }
}

