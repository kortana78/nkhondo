// Deterministic fixed-tick battle simulation. 20 ticks/s. Pure TS — no Three.js imports.
// Rendering only reads state; interpolation happens in render layer.

import {
  BALANCE, CARDS, MFITI_OWL, MFITI_SUMMON_PERIOD, MFITI_SUMMON_COUNT,
  MFITI_CURSE_RADIUS, MFITI_CURSE_MULT, MFITI_SYNERGY_RADIUS, MFITI_SYNERGY_SPEED,
  NJUCHI_STING_SLOW, MPHEZI_TOWER_FACTOR,
} from './cards.js';
import type { CanTarget, Layer } from './cards.js';
import { mulberry32 } from './rng.js';

export const TICKS_PER_SEC = 20;
// ---- fixed-point geometry: all stored positions are INTEGER milli-tiles.
// The public API (deploy/canDeploy/events) still speaks tiles; conversion
// happens at the boundary. Integer math makes the z-mirrored client sim
// bit-exact (32000 - z is exact), so strict comparisons can never flip.
export const ARENA_W = 18;
export const ARENA_H = 32;
export const RIVER_Z0 = 15;
export const RIVER_Z1 = 17;
const M_RIVER_Z0 = 15000;
const M_RIVER_Z1 = 17000;
const M_ARENA_W = 18000;
const M_ARENA_H = 32000;
const M_MIRROR = 32000;
const M_BRIDGES = [
  { x0: 2600, x1: 5600, cx: 4100 },
  { x0: 12400, x1: 15400, cx: 13900 },
];
/** tiles -> integer milli-tiles (storage). Exported for AI/render/tests. */
export function toM(v: number): number { return Math.round(v * 1000); }
/** milli-tiles -> tiles (events, render, tests). Exported for AI/render/tests. */
export function toT(m: number): number { return m / 1000; }
export const BRIDGES = [
  { x0: 2.6, x1: 5.6, cx: 4.1 },
  { x0: 12.4, x1: 15.4, cx: 13.9 },
];
export type Team = 0 | 1;

/** blast spells deal this fraction of their damage to towers */
export const TOWER_SPELL_FACTOR = 0.4;

export interface Unit {
  id: number;
  owner: Team;
  card: string;
  sub: string;
  /** MILLI-tiles */
  x: number; z: number;
  hp: number; maxHp: number;
  shield: number; maxShield: number;
  dmg: number;
  intervalTicks: number;
  /** MILLI-tiles */
  range: number;
  /** MILLI-tiles/sec */
  speed: number;
  /** MILLI-tiles */
  aggro: number;
  buildingsOnly: boolean;
  ranged: boolean;
  layer: Layer;
  canTarget: CanTarget;
  isGoat: boolean;
  cooldown: number;
  /** attack anim clock: -1 idle, else ticks since swing start */
  swing: number;
  /** njuchi sting: tick until which attack interval is slowed */
  stingUntil: number;
  /** mfiti witch: ticks until next owl summon */
  summonCd: number;
  whistleCd: number; // woweta herder retarget timer
  targetKind: 0 | 1 | 2 | 3; // 0 none, 1 unit, 2 tower, 3 obstacle
  targetId: number;
  alive: boolean;
  lifeTicks: number; // for lifetime cards (watchtower bldg)
  expiresTick: number; // -1 none
  walkPhase: number;
  spawnTick: number;
}

export interface Tower {
  id: number; // 0..5
  owner: Team;
  kind: 'nsanja' | 'chief';
  lane: 0 | 1 | 2; // 0 left, 1 right, 2 center(chief)
  /** MILLI-tiles */
  x: number; z: number;
  hp: number; maxHp: number;
  alive: boolean;
  active: boolean; // chief dormant until hit / nsanja falls
  cooldown: number;
  swing: number;
  targetKind: 0 | 1;
  targetId: number;
}

export interface Obstacle {
  id: number;
  owner: Team;
  card: string;
  /** MILLI-tiles */
  x: number; z: number;
  /** MILLI-tiles half-extents */
  hw: number; hd: number;
  hp: number; maxHp: number;
  alive: boolean;
  expiresTick: number;
}

/** MILLI-tiles throughout. slow = percent from the card (Mvula 40). */
export interface RainZone { x: number; z: number; r: number; slow: number; expiresTick: number; }
/** MILLI-tiles throughout. */
export interface Puddle { x: number; z: number; r: number; expiresTick: number; }

/** One pending Mphezi lightning sequence (3 strikes, 0.3s apart). Targets MILLI-tiles. */
export interface MpheziStrike {
  team: Team;
  tgts: { kind: 'unit' | 'tower'; id: number; x: number; z: number }[];
  idx: number;
  nextTick: number;
}

/** NOTE: event x/z are always TILES (render/test boundary). */
export interface BattleEvent {
  t: number;
  kind:
    | 'deploy' | 'hit' | 'miss' | 'death' | 'towerFall' | 'chiefActive'
    | 'knock' | 'rain' | 'wall' | 'gameOver' | 'bark'
    | 'surge' | 'harvest' | 'blaze' | 'gust' | 'ladder'
    | 'whistle' | 'shield' | 'puddle'
    | 'summon' | 'sting' | 'sweep' | 'bolt' | 'curse';
  a?: number; b?: number; // entity ids
  team?: Team;
  card?: string;
  x?: number; z?: number;
  dmg?: number;
  text?: string;
}

export interface DeployCheck { ok: boolean; reason: string }

function towerPos(owner: Team, lane: 0 | 1 | 2): { x: number; z: number } {
  const z = owner === 0 ? (lane === 2 ? 3400 : 10200) : lane === 2 ? 28600 : 21800;
  const x = lane === 0 ? 4100 : lane === 1 ? 13900 : 9000;
  return { x, z };
}

export class Battle {
  tick = 0;
  seed: number;
  /** PRNG state, kept explicit (not a closure) so snapshots stay exact. */
  randA: number;
  units: Unit[] = [];
  towers: Tower[] = [];
  obstacles: Obstacle[] = [];
  rains: RainZone[] = [];
  puddles: Puddle[] = [];
  strikes: MpheziStrike[] = [];
  /** tick until which each team's troops ford the river anywhere (Makwerero) */
  fordUntil: [number, number] = [-1, -1];
  energy: [number, number] = [BALANCE.startEnergy, BALANCE.startEnergy];
  energyFrac: [number, number] = [0, 0];
  decks: [string[], string[]];
  hands: [string[], string[]] = [[], []];
  queues: [string[], string[]] = [[], []];
  over = false;
  winner: -1 | 0 | 1 | 2 = -1; // 2 = draw
  /** True when this sim runs the z-mirrored board (slot-1 clients).
   *  Only affects mirrored-frame cosmetics of rand z-offsets (owl
   *  summons); all gameplay math is untouched. Never hashed, never
   *  sent — instance config, preserved across setState. */
  mirrorZ = false;
  suddenDeath = false;
  slowmoUntil = -1;
  nextId = 1;
  events: BattleEvent[] = [];
  overTick = -1;

  constructor(seed: number | string, deck0: string[], deck1: string[]) {
    this.seed = typeof seed === 'string' ? seedStr(seed) : seed >>> 0;
    this.randA = this.seed;
    this.decks = [[...deck0], [...deck1]];
    // Hands shuffle with a stream keyed by (seed, deck contents), NOT by
    // team order — so every sim shuffling the same deck (server, either
    // client's mirror, snapshots) gets the identical hand either way round.
    // The main randA stream is never consumed by construction.
    const mk = (deck: string[]) => {
      const order = [...deck];
      const r = mulberry32((this.seed ^ seedStr(deck.join(','))) >>> 0);
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      return { hand: order.slice(0, 4), queue: order.slice(4) };
    };
    const p0 = mk(deck0);
    const p1 = mk(deck1);
    this.hands = [p0.hand, p1.hand];
    this.queues = [p0.queue, p1.queue];
    let id = 100;
    for (const owner of [0, 1] as Team[]) {
      for (const lane of [0, 1, 2] as (0 | 1 | 2)[]) {
        const p = towerPos(owner, lane);
        const chief = lane === 2;
        this.towers.push({
          id: id++, owner, kind: chief ? 'chief' : 'nsanja', lane,
          x: p.x, z: p.z,
          hp: chief ? BALANCE.chiefHp : BALANCE.nsanjaHp,
          maxHp: chief ? BALANCE.chiefHp : BALANCE.nsanjaHp,
          alive: true, active: !chief,
          cooldown: 0, swing: -1, targetKind: 0, targetId: -1,
        });
      }
    }
  }

  get time(): number { return this.tick / TICKS_PER_SEC; }
  /** mulberry32 step, identical sequence to the old closure version. */
  rand(): number {
    let a = this.randA | 0;
    a = (a + 0x6d2b79f5) | 0;
    this.randA = a;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }  get doubleEnergy(): boolean {
    return this.suddenDeath || this.time >= BALANCE.regTime - 60;
  }

  drainEvents(): BattleEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  emit(ev: BattleEvent) {
    if (this.events.length < 256) this.events.push(ev);
  }

  // ---------- deploy (public API speaks tiles; storage is milli-tiles) ----------
  inArena(x: number, z: number): boolean {
    const mx = toM(x), mz = toM(z);
    return mx >= 500 && mx <= M_ARENA_W - 500 && mz >= 500 && mz <= M_ARENA_H - 500;
  }
  inRiver(z: number): boolean { return toM(z) >= M_RIVER_Z0 && toM(z) <= M_RIVER_Z1; }
  onBridge(x: number): boolean {
    const mx = toM(x);
    return BRIDGES.some((b) => mx >= toM(b.x0) && mx <= toM(b.x1));
  }
  ownHalf(team: Team, z: number): boolean {
    const mz = toM(z);
    return team === 0 ? mz < M_RIVER_Z0 : mz > M_RIVER_Z1;
  }
  /** milli-tile internals (exact; mirror-symmetric) */
  mOnBridge(mx: number): boolean {
    return M_BRIDGES.some((b) => mx >= b.x0 && mx <= b.x1);
  }
  mInRiver(mz: number): boolean { return mz >= M_RIVER_Z0 && mz <= M_RIVER_Z1; }

  canDeploy(team: Team, cardId: string, x: number, z: number): DeployCheck {
    if (this.over) return { ok: false, reason: 'over' };
    const card = CARDS[cardId];
    if (!card) return { ok: false, reason: 'card' };
    if (!this.hands[team].includes(cardId)) return { ok: false, reason: 'hand' };
    if (this.energy[team] < card.cost) return { ok: false, reason: 'energy' };
    if (!this.inArena(x, z)) return { ok: false, reason: 'arena' };
    if (card.type === 'spell') {
      if (cardId === 'roadblock' && this.inRiver(z) && !this.onBridge(x))
        return { ok: false, reason: 'river' };
      return { ok: true, reason: '' };
    }
    // troops + buildings: own half, not river
    if (!this.ownHalf(team, z)) return { ok: false, reason: 'half' };
    if (this.inRiver(z)) return { ok: false, reason: 'river' };
    return { ok: true, reason: '' };
  }

  deploy(team: Team, cardId: string, x: number, z: number, mirrorZ: false | Team = false): boolean {
    const chk = this.canDeploy(team, cardId, x, z);
    if (!chk.ok) return false;
    const card = CARDS[cardId];
    this.energy[team] -= card.cost;
    // cycle hand
    const hi = this.hands[team].indexOf(cardId);
    const q = this.queues[team];
    const played = this.hands[team][hi];
    const nxt = q.length > 0 ? q.shift()! : played;
    if (q.length > 0 || this.hands[team].length === 4) {
      this.hands[team][hi] = nxt;
      q.push(played);
    }
    const t = this.time;
    this.emit({ t, kind: 'deploy', team, card: cardId, x, z });
    this.emit({ t, kind: 'bark', team, card: cardId, text: card.barkCh });
    const mx = toM(x), mz = toM(z);

    if (cardId === 'rain') {
      this.rains.push({ x: mx, z: mz, r: toM(card.spell!.radius), slow: card.spell!.slowPct ?? 35, expiresTick: this.tick + Math.round(card.spell!.duration * TICKS_PER_SEC) });
      this.emit({ t, kind: 'rain', team, x, z });
      return true;
    }
    if (cardId === 'roadblock') {
      this.obstacles.push({
        id: this.nextId++, owner: team, card: cardId, x: mx, z: mz,
        hw: toM(1.6), hd: toM(0.7), hp: card.spell!.obstacleHp!, maxHp: card.spell!.obstacleHp!,
        alive: true, expiresTick: this.tick + Math.round(card.spell!.duration * TICKS_PER_SEC),
      });
      this.emit({ t, kind: 'wall', team, x, z });
      return true;
    }
    if (cardId === 'harvest') {
      this.energy[team] = Math.min(BALANCE.energyMax, this.energy[team] + (card.spell!.energyGain ?? 0));
      this.emit({ t, kind: 'harvest', team, x, z });
      return true;
    }
    if (cardId === 'mafunde') {
      // radial wave: push 2 tiles + light damage, hits ground + air
      const r = toM(card.spell!.radius), push = toM(card.spell!.push ?? 0), dmg = card.spell!.damage ?? 0;
      const enemy: Team = team === 0 ? 1 : 0;
      for (const e of this.units) {
        if (!e.alive || e.owner !== enemy) continue;
        const dx = e.x - mx, dz = e.z - mz;
        const d = Math.hypot(dx, dz);
        if (d > r) continue;
        const dd = Math.max(1, d);
        // integer-exact displacement (mirror-safe: mround is sign-symmetric,
        // then int+int is exact, so flipped sims stay bit-identical)
        e.x = clamp(e.x + mround((dx / dd) * push), 600, M_ARENA_W - 600);
        e.z = clamp(e.z + mround((dz / dd) * push), 600, M_ARENA_H - 600);
        e.swing = -1; // surge cancels wind-ups
        e.cooldown = Math.max(e.cooldown, 12);
        this.damageUnit(e, dmg, team);
      }
      this.damageTowersInBlast(team, mx, mz, r, dmg);
      this.emit({ t, kind: 'surge', team, x, z });
      return true;
    }
    if (cardId === 'moto') {
      const r = toM(card.spell!.radius), dmg = card.spell!.damage ?? 0;
      const enemy: Team = team === 0 ? 1 : 0;
      for (const e of this.units) {
        if (!e.alive || e.owner !== enemy) continue;
        const dx = e.x - mx, dz = e.z - mz;
        if (Math.hypot(dx, dz) > r) continue;
        e.swing = -1; // blast interrupts wind-ups
        e.cooldown = Math.max(e.cooldown, 12);
        this.damageUnit(e, dmg, team);
      }
      this.damageTowersInBlast(team, mx, mz, r, dmg);
      this.emit({ t, kind: 'blaze', team, x, z });
      return true;
    }
    if (cardId === 'mphepo') {
      // 3-tile-wide line forward: width 3 (x), length 6 forward from cast point
      const push = toM(card.spell!.push ?? 2), dmg = card.spell!.damage ?? 0;
      const width = toM(card.spell!.width ?? 3);
      const len = 6000;
      const enemy: Team = team === 0 ? 1 : 0;
      const dir = team === 0 ? 1 : -1;
      for (const e of this.units) {
        if (!e.alive || e.owner !== enemy) continue;
        const dx = Math.abs(e.x - mx);
        const dz = (e.z - mz) * dir; // forward distance
        if (dx > width / 2 || dz < -500 || dz > len) continue;
        e.z = clamp(e.z + dir * push, 600, M_ARENA_H - 600);
        e.swing = -1;
        e.cooldown = Math.max(e.cooldown, 12);
        this.damageUnit(e, dmg, team);
      }
      // towers in the swept line also chip
      for (const tw of this.towers) {
        if (!tw.alive || tw.owner !== enemy) continue;
        const dx = Math.abs(tw.x - mx);
        const dz = (tw.z - mz) * dir;
        if (dx > width / 2 + 1100 || dz < -1000 || dz > len) continue;
        const tdmg = Math.round(dmg * TOWER_SPELL_FACTOR);
        if (tdmg > 0) {
          this.damageTower(tw, tdmg, team);
          this.emit({ t, kind: 'hit', a: -1, b: tw.id, dmg: tdmg, team, x: toT(tw.x), z: toT(tw.z) });
        }
      }
      this.emit({ t, kind: 'gust', team, x, z });
      return true;
    }
    if (cardId === 'mphezi') {
      // pick the 3 highest-HP enemy units/towers in radius, strike 0.3s apart
      const r = toM(card.spell!.radius), dmg = card.spell!.damage ?? 650;
      const enemy: Team = team === 0 ? 1 : 0;
      const cands: { kind: 'unit' | 'tower'; id: number; x: number; z: number; hp: number }[] = [];
      for (const e of this.units) {
        if (!e.alive || e.owner !== enemy) continue;
        if (Math.hypot(e.x - mx, e.z - mz) > r) continue;
        cands.push({ kind: 'unit', id: e.id, x: e.x, z: e.z, hp: e.hp + e.shield });
      }
      for (const tw of this.towers) {
        if (!tw.alive || tw.owner !== enemy) continue;
        if (Math.hypot(tw.x - mx, tw.z - mz) > r + 1100) continue;
        cands.push({ kind: 'tower', id: tw.id, x: tw.x, z: tw.z, hp: tw.hp });
      }
      cands.sort((a, b) => b.hp - a.hp);
      const tgts = cands.slice(0, card.spell!.strikes ?? 3)
        .map((c) => ({ kind: c.kind, id: c.id, x: c.x, z: c.z }));
      if (tgts.length > 0) {
        this.strikes.push({ team, tgts, idx: 0, nextTick: this.tick });
      }
      void dmg;
      return true;
    }
    if (cardId === 'makwerero') {
      this.fordUntil[team] = this.tick + Math.round((card.spell!.duration || 15) * TICKS_PER_SEC);
      this.emit({ t, kind: 'ladder', team, x, z });
      return true;
    }
    // troops / buildings: spawn sub-units in small formation
    // woweta: goats run in from behind the herder (own-side offset)
    const totalSubs = card.subs.reduce((n, s) => n + s.count, 0);
    const offs = formationOffsets(totalSubs);
    let k = 0;
    for (const s of card.subs) {
      for (let i = 0; i < s.count; i++) {
        const o = offs[k++] ?? { x: 0, z: 0 };
        let ox = toM(o.x), oz = toM(o.z);
        if (cardId === 'woweta' && s.key === 'goat') {
          // goats start 2 tiles behind herder (own side) then charge in.
          // Mirrored boards use the ORIGIN team's side, then negate.
          const baseTeam = mirrorZ === false ? team : mirrorZ;
          oz = (baseTeam === 0 ? -2000 : 2000) + Math.round(o.z * 500);
          ox = Math.round(o.x * 1200);
        }
        // netcode only: slot-1 clients simulate the z-mirrored board, so
        // remote deploys negate the final offset to land mirrored exactly.
        if (mirrorZ !== false) oz = -oz;
        const px = clamp(mx + ox, 600, M_ARENA_W - 600);
        const pz = clamp(mz + oz, 600, M_ARENA_H - 600);
        const isBldg = card.type === 'building';
        this.units.push({
          id: this.nextId++, owner: team, card: cardId, sub: s.key,
          x: px, z: pz, hp: s.hp, maxHp: s.hp,
          shield: s.shield ?? 0, maxShield: s.shield ?? 0,
          dmg: s.damage,
          intervalTicks: Math.max(4, Math.round(s.interval * TICKS_PER_SEC)),
          range: toM(s.range), speed: toM(s.speed), aggro: toM(s.aggro),
          buildingsOnly: s.targets === 'buildings', ranged: s.ranged,
          layer: s.layer, canTarget: s.canTarget,
          isGoat: s.key === 'goat',
          cooldown: 20, swing: -1, stingUntil: -1,
          summonCd: s.key === 'witch' ? Math.round(MFITI_SUMMON_PERIOD * TICKS_PER_SEC) : 0,
          whistleCd: s.key === 'herder' ? Math.round(6 * TICKS_PER_SEC) : 0,
          targetKind: 0, targetId: -1, alive: true, lifeTicks: 0,
          expiresTick: isBldg ? this.tick + 40 * TICKS_PER_SEC : -1,
          walkPhase: this.rand() * 6.28, spawnTick: this.tick,
        });
      }
    }
    return true;
  }

  // ---------- per-tick ----------
  step(): void {
    if (this.over) return;
    this.tick++;
    const t = this.time;
    // energy
    const period = this.doubleEnergy ? BALANCE.energyPeriod / 2 : BALANCE.energyPeriod;
    for (const team of [0, 1] as Team[]) {
      if (this.energy[team] < BALANCE.energyMax) {
        this.energyFrac[team] += 1 / (period * TICKS_PER_SEC);
        while (this.energyFrac[team] >= 1 && this.energy[team] < BALANCE.energyMax) {
          this.energyFrac[team] -= 1;
          this.energy[team]++;
        }
      }
    }
    // expiry: rains leave puddles 4s (10% slow)
    const expiring = this.rains.filter((r) => r.expiresTick <= this.tick);
    for (const r of expiring) {
      this.puddles.push({ x: r.x, z: r.z, r: r.r, expiresTick: this.tick + Math.round(4 * TICKS_PER_SEC) });
      this.emit({ t, kind: 'puddle', team: undefined, x: toT(r.x), z: toT(r.z) });
    }
    this.rains = this.rains.filter((r) => r.expiresTick > this.tick);
    this.puddles = this.puddles.filter((p) => p.expiresTick > this.tick);
    for (const o of this.obstacles) {
      if (o.alive && o.expiresTick <= this.tick) {
        o.alive = false;
        this.emit({ t, kind: 'death', a: o.id, x: toT(o.x), z: toT(o.z) });
      }
    }
    this.obstacles = this.obstacles.filter((o) => o.alive);
    // mphezi sequential strikes (0.3s apart)
    if (this.strikes.length > 0) {
      const pending: MpheziStrike[] = [];
      for (const s of this.strikes) {
        if (this.tick >= s.nextTick && s.idx < s.tgts.length) {
          this.fireMpheziStrike(s);
          s.idx++;
          s.nextTick = this.tick + Math.round(0.3 * TICKS_PER_SEC);
        }
        if (s.idx < s.tgts.length) pending.push(s);
      }
      this.strikes = pending;
    }
    for (const u of this.units) {
      if (u.alive && u.expiresTick > 0 && u.expiresTick <= this.tick) {
        u.alive = false;
        this.emit({ t, kind: 'death', a: u.id, team: u.owner, x: toT(u.x), z: toT(u.z) });
      }
      // watchtower HP decays over 40s (gradual, not sudden)
      if (u.alive && u.card === 'watchtower') {
        const decay = u.maxHp / (40 * TICKS_PER_SEC);
        u.hp -= decay;
        if (u.hp <= 0) {
          u.hp = 0; u.alive = false;
          this.emit({ t, kind: 'death', a: u.id, team: u.owner, card: u.card, x: toT(u.x), z: toT(u.z) });
        }
      }
    }
    // mfiti summons: every 6s each living witch births 2 owls
    for (const u of this.units) {
      if (!u.alive || u.sub !== 'witch') continue;
      if (u.summonCd > 0) u.summonCd--;
      if (u.summonCd <= 0) {
        u.summonCd = Math.round(MFITI_SUMMON_PERIOD * TICKS_PER_SEC);
        for (let i = 0; i < MFITI_SUMMON_COUNT; i++) {
          const a = this.rand() * Math.PI * 2;
          // Mirror-frame sims (slot-1 clients) negate the z-offset so owls
          // land mirrored exactly — same fix class as woweta goat offsets
          // in deploy(). Without this, every mfiti summon desyncs mirrors.
          const zo = Math.sin(a) * (this.mirrorZ ? -800 : 800);
          const px = clamp(mround(u.x + Math.cos(a) * 800), 600, M_ARENA_W - 600);
          const pz = clamp(mround(u.z + zo), 600, M_ARENA_H - 600);
          this.units.push({
            id: this.nextId++, owner: u.owner, card: 'mfiti', sub: MFITI_OWL.key,
            x: px, z: pz, hp: MFITI_OWL.hp, maxHp: MFITI_OWL.hp,
            shield: 0, maxShield: 0, dmg: MFITI_OWL.damage,
            intervalTicks: Math.max(4, Math.round(MFITI_OWL.interval * TICKS_PER_SEC)),
            range: toM(MFITI_OWL.range), speed: toM(MFITI_OWL.speed), aggro: toM(MFITI_OWL.aggro),
            buildingsOnly: false, ranged: false,
            layer: MFITI_OWL.layer, canTarget: MFITI_OWL.canTarget,
            isGoat: false, cooldown: 10, swing: -1, stingUntil: -1,
            summonCd: 0, whistleCd: 0,
            targetKind: 0, targetId: -1, alive: true, lifeTicks: 0,
            expiresTick: -1, walkPhase: this.rand() * 6.28, spawnTick: this.tick,
          });
        }
        this.emit({ t, kind: 'summon', a: u.id, team: u.owner, card: 'mfiti', x: toT(u.x), z: toT(u.z) });
      }
    }
    // units
    for (const u of this.units) {
      if (!u.alive) continue;
      u.lifeTicks++;
      if (u.cooldown > 0) u.cooldown--;
      // woweta herder whistles every 6s: retarget goats
      if (u.sub === 'herder') {
        if (u.whistleCd > 0) u.whistleCd--;
        if (u.whistleCd <= 0) {
          u.whistleCd = Math.round(6 * TICKS_PER_SEC);
          this.emit({ t, kind: 'whistle', a: u.id, team: u.owner, card: 'woweta', x: toT(u.x), z: toT(u.z) });
          for (const g of this.units) {
            if (!g.alive || !g.isGoat || g.owner !== u.owner) continue;
            if (Math.hypot(g.x - u.x, g.z - u.z) > 8000) continue;
            g.targetKind = 0; g.targetId = -1; // force retarget to nearest troop
          }
        }
      }
      const atkMult = 1; // no attack-speed auras in the current roster
      // validate target
      if (!this.validTarget(u)) this.acquireTarget(u);
      const tgt = this.resolveTarget(u);
      if (tgt) {
        const d = distM(u.x, u.z, tgt.x, tgt.z);
        if (d <= u.range + targetRadiusM(tgt)) {
          // attack cycle: anticipation 5 ticks -> strike -> follow 5 ticks
          if (u.swing < 0 && u.cooldown <= 0) u.swing = 0;
          if (u.swing >= 0) {
            u.swing++;
            if (u.swing === 5) this.strikeUnit(u, tgt, atkMult);
            const total = 10;
            if (u.swing >= total) {
              u.swing = -1;
              let cd = Math.max(4, Math.round(u.intervalTicks / atkMult));
              if (this.tick < u.stingUntil) cd = Math.round(cd * NJUCHI_STING_SLOW);
              u.cooldown = cd;
            }
          }
        } else {
          if (u.swing >= 0 && u.swing < 5) { /* committed anticipation: hold */ }
          else {
            u.swing = -1;
            this.moveUnit(u, tgt.x, tgt.z, 1);
          }
        }
      } else {
        u.swing = -1;
        // march toward enemy side bridge / tower line
        const dir = u.owner === 0 ? 1 : -1;
        this.moveUnit(u, u.x, u.z + dir * 3000, 1);
      }
    }
    // separation steering: no stacking/overlap (ground separates hard,
    // air separates softly). Deterministic id-ordered pass, integer math.
    this.separate();
    // towers (hit ground + air)
    for (const tw of this.towers) {
      if (!tw.alive) continue;
      if (tw.cooldown > 0) tw.cooldown--;
      if (!tw.active) continue;
      if (!this.validTowerTarget(tw)) this.acquireTowerTarget(tw);
      const tgt = this.resolveTowerTarget(tw);
      if (!tgt) { tw.swing = -1; continue; }
      const range = toM(tw.kind === 'chief' ? BALANCE.chiefRange : BALANCE.nsanjaRange);
      const d = distM(tw.x, tw.z, tgt.x, tgt.z);
      if (d <= range) {
        if (tw.swing < 0 && tw.cooldown <= 0) tw.swing = 0;
        if (tw.swing >= 0) {
          tw.swing++;
          if (tw.swing === 6) {
            const dmg = tw.kind === 'chief' ? BALANCE.chiefDamage : BALANCE.nsanjaDamage;
            this.damageUnit(tgt, dmg, tw.owner);
            this.emit({ t, kind: 'hit', a: tw.id, b: tgt.id, dmg, x: toT(tgt.x), z: toT(tgt.z) });
          }
          if (tw.swing >= 12) {
            tw.swing = -1;
            tw.cooldown = Math.round((tw.kind === 'chief' ? BALANCE.chiefInterval : BALANCE.nsanjaInterval) * TICKS_PER_SEC);
          }
        }
      } else { tw.swing = -1; }
    }
    // cleanup dead
    this.units = this.units.filter((u) => u.alive);
    this.checkEnd();
  }

  private fireMpheziStrike(s: MpheziStrike) {
    const t = this.time;
    const g = s.tgts[s.idx];
    if (!g) return;
    const card = CARDS['mphezi'];
    const dmg = card.spell!.damage ?? 650;
    const stunTicks = Math.round((card.spell!.stun ?? 0.5) * TICKS_PER_SEC);
    if (g.kind === 'unit') {
      const e = this.units.find((v) => v.id === g.id && v.alive);
      const x = e ? e.x : g.x, z = e ? e.z : g.z;
      if (e) {
        e.swing = -1; // stun resets wind-ups
        e.cooldown = Math.max(e.cooldown, stunTicks);
        this.damageUnit(e, dmg, s.team);
      }
      this.emit({ t, kind: 'bolt', a: -1, b: g.id, dmg, team: s.team, x: toT(x), z: toT(z) });
    } else {
      const tw = this.towers.find((v) => v.id === g.id && v.alive);
      const x = tw ? tw.x : g.x, z = tw ? tw.z : g.z;
      if (tw) {
        const tdmg = Math.round(dmg * MPHEZI_TOWER_FACTOR);
        this.damageTower(tw, tdmg, s.team);
        this.emit({ t, kind: 'bolt', a: -1, b: tw.id, dmg: tdmg, team: s.team, x: toT(x), z: toT(z) });
      } else {
        this.emit({ t, kind: 'bolt', a: -1, b: g.id, team: s.team, x: toT(x), z: toT(z) });
      }
    }
  }

  /** Mfiti curse: attacker deals -20% inside 3 tiles of an enemy witch. (milli) */
  private curseMult(u: Unit): number {
    const enemy: Team = u.owner === 0 ? 1 : 0;
    const r2 = toM(MFITI_CURSE_RADIUS) * toM(MFITI_CURSE_RADIUS);
    for (const w of this.units) {
      if (!w.alive || w.sub !== 'witch' || w.owner !== enemy) continue;
      const dx = w.x - u.x, dz = w.z - u.z;
      if (dx * dx + dz * dz <= r2) return MFITI_CURSE_MULT;
    }
    return 1;
  }

  /** Mfiti synergy: allied Afisi within 4 tiles move +15%. (milli) */
  private synergyMult(u: Unit): number {
    if (u.card !== 'fisi') return 1;
    const r2 = toM(MFITI_SYNERGY_RADIUS) * toM(MFITI_SYNERGY_RADIUS);
    for (const w of this.units) {
      if (!w.alive || w.sub !== 'witch' || w.owner !== u.owner) continue;
      const dx = w.x - u.x, dz = w.z - u.z;
      if (dx * dx + dz * dz <= r2) return MFITI_SYNERGY_SPEED;
    }
    return 1;
  }

  private strikeUnit(u: Unit, tgt: { kind: number; x: number; z: number; id: number }, atkMult: number) {
    void atkMult;
    const t = this.time;
    const curse = this.curseMult(u);
    let dmg = Math.round(u.dmg * curse);
    if (curse < 1) this.emit({ t, kind: 'curse', a: u.id, team: u.owner, x: toT(u.x), z: toT(u.z) });
    // rain accuracy: ranged attacker or target in rain -> 30% miss
    if (u.ranged && (this.inRain(u.x, u.z) || this.inRain(tgt.x, tgt.z))) {
      if (this.rand() < 0.3) {
        this.emit({ t, kind: 'miss', a: u.id, b: tgt.id, x: toT(tgt.x), z: toT(tgt.z) });
        return;
      }
    }
    // Zikwanje cone splash: arc in front hits all ground enemies, never air
    if (u.sub === 'panga') {
      const def = CARDS['zikwanje'];
      const splash = def.subs[0].splash!;
      const splashR = toM(splash.radius);
      const dx = tgt.x - u.x, dz = tgt.z - u.z;
      const facing = Math.atan2(dx, dz);
      const halfArc = ((splash.arcDeg / 2) * Math.PI) / 180;
      const enemy: Team = u.owner === 0 ? 1 : 0;
      let hits = 0;
      for (const e of [...this.units]) {
        if (!e.alive || e.owner !== enemy) continue;
        if (e.layer !== 'ground') continue; // never air
        const ex = e.x - u.x, ez = e.z - u.z;
        const d = Math.hypot(ex, ez);
        if (d > splashR + 250) continue;
        let ang = Math.atan2(ex, ez) - facing;
        while (ang > Math.PI) ang -= Math.PI * 2;
        while (ang < -Math.PI) ang += Math.PI * 2;
        if (Math.abs(ang) > halfArc && d > 400) continue;
        this.damageUnit(e, dmg, u.owner);
        this.emit({ t, kind: 'hit', a: u.id, b: e.id, dmg, x: toT(e.x), z: toT(e.z) });
        hits++;
        if (e.alive && e.maxHp <= 250) {
          // knockback on light units (integer-exact, mirror-safe)
          const dd = Math.max(1, d);
          e.x = clamp(e.x + mround((ex / dd) * 500), 600, M_ARENA_W - 600);
          e.z = clamp(e.z + mround((ez / dd) * 500), 600, M_ARENA_H - 600);
          e.swing = -1;
          e.cooldown = Math.max(e.cooldown, 8);
        }
      }
      this.emit({ t, kind: 'sweep', a: u.id, team: u.owner, x: toT(u.x), z: toT(u.z) });
      void hits;
      return;
    }
    if (tgt.kind === 1) {
      const e = this.units.find((v) => v.id === tgt.id && v.alive);
      if (!e) return;
      this.damageUnit(e, dmg, u.owner);
      this.emit({ t, kind: 'hit', a: u.id, b: e.id, dmg, x: toT(e.x), z: toT(e.z) });
      // njuchi sting: 1s attack-speed slow, doesn't stack
      if (u.sub === 'bee' && e.alive) {
        if (!(this.tick < e.stingUntil)) {
          e.stingUntil = this.tick + Math.round(1 * TICKS_PER_SEC);
          this.emit({ t, kind: 'sting', a: u.id, b: e.id, x: toT(e.x), z: toT(e.z) });
        }
      }
      if (u.isGoat && e.alive) {
        // knockback 1 tile away + cancel wind-up (integer-exact, mirror-safe)
        const dx = e.x - u.x, dz = e.z - u.z;
        const d = Math.max(1, Math.hypot(dx, dz));
        e.x = clamp(e.x + mround((dx / d) * 1000), 600, M_ARENA_W - 600);
        e.z = clamp(e.z + mround((dz / d) * 1000), 600, M_ARENA_H - 600);
        e.swing = -1;
        e.cooldown = Math.max(e.cooldown, 12);
        this.emit({ t, kind: 'knock', a: u.id, b: e.id, x: toT(e.x), z: toT(e.z) });
      }
    } else if (tgt.kind === 2) {
      const tw = this.towers.find((v) => v.id === tgt.id && v.alive);
      if (!tw) return;
      this.damageTower(tw, dmg, u.owner);
      this.emit({ t, kind: 'hit', a: u.id, b: tw.id, dmg, x: toT(tw.x), z: toT(tw.z) });
    } else {
      const o = this.obstacles.find((v) => v.id === tgt.id && v.alive);
      if (!o) return;
      o.hp -= dmg;
      this.emit({ t, kind: 'hit', a: u.id, b: o.id, dmg, x: toT(o.x), z: toT(o.z) });
      if (o.hp <= 0) {
        o.alive = false;
        this.emit({ t, kind: 'death', a: o.id, x: toT(o.x), z: toT(o.z) });
        this.obstacles = this.obstacles.filter((v) => v.alive);
      }
    }
  }

  private damageUnit(e: Unit, dmg: number, byOwner: Team) {
    void byOwner;
    // Mlonda shield absorbs first (blue bar)
    if (e.shield > 0 && dmg > 0) {
      const absorbed = Math.min(e.shield, dmg);
      e.shield -= absorbed;
      dmg -= absorbed;
      this.emit({ t: this.time, kind: 'shield', a: e.id, team: e.owner, dmg: absorbed, x: toT(e.x), z: toT(e.z) });
      if (e.shield <= 0) e.shield = 0;
    }
    if (dmg > 0) e.hp -= dmg;
    if (e.hp <= 0 && e.alive) {
      e.alive = false;
      this.emit({ t: this.time, kind: 'death', a: e.id, team: e.owner, card: e.card, x: toT(e.x), z: toT(e.z) });
    }
  }

  private damageTower(tw: Tower, dmg: number, byOwner: Team) {    void byOwner;
    tw.hp -= dmg;
    if (tw.kind === 'chief' && !tw.active) {
      tw.active = true;
      this.emit({ t: this.time, kind: 'chiefActive', team: tw.owner, x: toT(tw.x), z: toT(tw.z) });
    }
    if (tw.hp <= 0 && tw.alive) {
      tw.alive = false;
      tw.hp = 0;
      this.slowmoUntil = this.tick + 30; // 1.5s slow-mo moment
      this.emit({ t: this.time, kind: 'towerFall', team: tw.owner, x: toT(tw.x), z: toT(tw.z), text: tw.kind });
      if (tw.kind === 'nsanja') {
        // activate own chief
        const chief = this.towers.find((v) => v.owner === tw.owner && v.kind === 'chief');
        if (chief && !chief.active) {
          chief.active = true;
          this.emit({ t: this.time, kind: 'chiefActive', team: chief.owner, x: chief.x, z: chief.z });
        }
      }
    }
  }

  /** Milli-tiles in. */
  private inRain(mx: number, mz: number): boolean {
    return this.rains.some((r) => (mx - r.x) ** 2 + (mz - r.z) ** 2 <= r.r * r.r);
  }
  /** Milli-tiles in. */
  private inPuddle(mx: number, mz: number): boolean {
    return this.puddles.some((p) => (mx - p.x) ** 2 + (mz - p.z) ** 2 <= p.r * p.r);
  }
  /** Milli-tiles in. Slow comes from the card that made the zone. */
  private mSlowAt(mx: number, mz: number): number {
    const zone = this.rains.find((r) => (mx - r.x) ** 2 + (mz - r.z) ** 2 <= r.r * r.r);
    if (zone) return 1 - zone.slow / 100; // heavy rain (ground + air)
    if (this.inPuddle(mx, mz)) return 0.9; // 10% slow in leftover puddles
    return 1;
  }

  /** Blast spells also chip enemy towers (40%), so dropping fire on a tower
   *  always does visible damage. Emits 'hit' events for floaters.
   *  Millis in, tiles out (events). */
  private damageTowersInBlast(team: Team, mx: number, mz: number, r: number, dmg: number) {
    const enemy: Team = team === 0 ? 1 : 0;
    const tdmg = Math.round(dmg * TOWER_SPELL_FACTOR);
    if (tdmg <= 0) return;
    for (const tw of this.towers) {
      if (!tw.alive || tw.owner !== enemy) continue;
      if (Math.hypot(tw.x - mx, tw.z - mz) > r + 1100) continue;
      this.damageTower(tw, tdmg, team);
      this.emit({ t: this.time, kind: 'hit', a: -1, b: tw.id, dmg: tdmg, team, x: toT(tw.x), z: toT(tw.z) });
    }
  }
  /** Public tile-space helper (tests, debug). */
  rainSlowAt(x: number, z: number): number {
    return this.mSlowAt(toM(x), toM(z));
  }

  /** Can attacker engage this target? Ground melee (canTarget ground) can
   *  never hit air; air-only attackers can never hit ground walls. */
  canHitUnit(att: { canTarget: CanTarget }, tgt: { layer: Layer }): boolean {
    if (tgt.layer === 'air') return att.canTarget !== 'ground';
    return att.canTarget !== 'air';
  }
  canHitStructure(att: { canTarget: CanTarget }): boolean {
    // towers and roadblocks are ground structures
    return att.canTarget !== 'air';
  }

  /** Separation pass: push overlapping units apart so armies never stack.
   *  Ground radius 0.6 tiles, air 0.45 tiles. Id-ordered, integer-exact,
   *  mirror-safe (symmetric pushes). Runs once per tick after movement. */
  private separate() {
    const us = this.units.filter((u) => u.alive);
    us.sort((a, b) => a.id - b.id);
    for (let i = 0; i < us.length; i++) {
      const a = us[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < us.length; j++) {
        const c = us[j];
        if (!c.alive) continue;
        if (a.layer !== c.layer) continue; // ground/air pass through each other
        const minD = a.layer === 'air' ? 450 : 600;
        const dx = c.x - a.x, dz = c.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD || d2 <= 1) continue;
        const d = Math.sqrt(d2);
        const push = Math.round(((minD - d) / 2) * 10) / 10;
        const nx = dx / d, nz = dz / d;
        // mround (NOT Math.round): sign-symmetric, so flipped sims push
        // mirrored-exactly. Math.round splits exact halves asymmetrically.
        const px = mround(nx * push), pz = mround(nz * push);
        // buildings (watchtower, speed 0) never move — push the other unit fully
        const aStatic = a.speed <= 1;
        const cStatic = c.speed <= 1;
        if (aStatic && cStatic) continue;
        if (aStatic) {
          c.x = clamp(c.x + px * 2, 600, M_ARENA_W - 600);
          c.z = clamp(c.z + pz * 2, 600, M_ARENA_H - 600);
        } else if (cStatic) {
          a.x = clamp(a.x - px * 2, 600, M_ARENA_W - 600);
          a.z = clamp(a.z - pz * 2, 600, M_ARENA_H - 600);
        } else {
          a.x = clamp(a.x - px, 600, M_ARENA_W - 600);
          a.z = clamp(a.z - pz, 600, M_ARENA_H - 600);
          c.x = clamp(c.x + px, 600, M_ARENA_W - 600);
          c.z = clamp(c.z + pz, 600, M_ARENA_H - 600);
        }
      }
    }
  }

  /** Milli-tiles in and out: tx/tz are milli, u.x/u.z are milli. */
  private moveUnit(u: Unit, tx: number, tz: number, auraMult: number) {
    void auraMult;
    const slow = this.mSlowAt(u.x, u.z);
    const rate = u.speed * slow * this.synergyMult(u); // tiles/sec
    if (rate <= 0.001) return;
    let dx = tx - u.x, dz = tz - u.z;
    const d = Math.hypot(dx, dz);
    if (d < 20) return;
    dx /= d; dz /= d;
    // step length in millis: (rate/20 per tick) * min(d, 10 tiles), exact port
    const stepLen = ((rate / TICKS_PER_SEC) * Math.min(d, 10000)) / 1000;
    // flying units: straight line, ignore river/bridges/obstacles entirely
    // (integer-exact displacement: identical same-frame, bit-exact mirrored)
    if (u.layer === 'air') {
      u.x = clamp(u.x + mround(dx * stepLen), 600, M_ARENA_W - 600);
      u.z = clamp(u.z + mround(dz * stepLen), 600, M_ARENA_H - 600);
      u.walkPhase += (rate / TICKS_PER_SEC) * 6;
      return;
    }
    // river routing: ladders let troops ford anywhere; else head to a bridge
    const ford = this.tick < this.fordUntil[u.owner];
    const crosses = (u.z < M_RIVER_Z0 && tz > M_RIVER_Z1) || (u.z > M_RIVER_Z1 && tz < M_RIVER_Z0);
    let mx = dx, mz = dz;
    if (!ford && crosses && !this.mOnBridge(u.x) && !(u.z >= M_RIVER_Z0 && u.z <= M_RIVER_Z1)) {
      const b = mNearestBridge(u.x);
      const wx = b.cx - u.x;
      const wz = (u.owner === 0 ? M_RIVER_Z0 - 500 : M_RIVER_Z1 + 500) - u.z;
      const wd = Math.max(1, Math.hypot(wx, wz));
      mx = wx / wd; mz = wz / wd;
    } else if (!ford && u.z >= M_RIVER_Z0 && u.z <= M_RIVER_Z1 && !this.mOnBridge(u.x)) {
      // pushed into river: slide to nearest bridge
      const b = mNearestBridge(u.x);
      mx = Math.sign(b.cx - u.x);
      mz = 0;
    }
    let nx = u.x + mx * stepLen;
    let nz = u.z + mz * stepLen;
    // obstacle avoidance: slide (ground only — air passed over)
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      if (Math.abs(nx - o.x) < o.hw + 350 && Math.abs(nz - o.z) < o.hd + 350) {
        // simple slide: cancel the smaller penetration axis
        const penX = o.hw + 350 - Math.abs(nx - o.x);
        const penZ = o.hd + 350 - Math.abs(nz - o.z);
        if (penX < penZ) nx = u.x;
        else nz = u.z;
      }
    }
    // integer-exact displacement (u.x/u.z are ints, so ≡ mround(nx/nz)
    // same-frame, but bit-exact across the mirror)
    u.x = clamp(u.x + mround(nx - u.x), 600, M_ARENA_W - 600);
    u.z = clamp(u.z + mround(nz - u.z), 600, M_ARENA_H - 600);
    u.walkPhase += (rate / TICKS_PER_SEC) * 6;
  }

  // ----- targeting (millis) -----
  private validTarget(u: Unit): boolean {
    if (u.targetKind === 0 || u.targetId < 0) return false;
    if (u.targetKind === 1) {
      const e = this.units.find((v) => v.id === u.targetId);
      if (!e || !e.alive) return false;
      const d = distM(u.x, u.z, e.x, e.z);
      if (d > Math.max(u.range + 1200, u.aggro + 3000)) return false;
      if (u.buildingsOnly) return false;
      if (!this.canHitUnit(u, e)) return false;
      return true;
    }
    if (u.targetKind === 2) {
      const tw = this.towers.find((v) => v.id === u.targetId);
      if (!tw || !tw.alive) return false;
      if (!this.canHitStructure(u)) return false;
      return true;
    }
    // obstacles: flying units pass over, never target them
    if (u.layer === 'air') return false;
    if (!this.canHitStructure(u)) return false;
    const o = this.obstacles.find((v) => v.id === u.targetId);
    return !!o && o.alive;
  }

  private acquireTarget(u: Unit) {
    u.targetKind = 0; u.targetId = -1;
    const enemy: Team = u.owner === 0 ? 1 : 0;
    if (!u.buildingsOnly) {
      // nearest ENGAGEABLE enemy unit in aggro
      let best: Unit | null = null; let bd = Infinity;
      for (const e of this.units) {
        if (!e.alive || e.owner !== enemy) continue;
        if (!this.canHitUnit(u, e)) continue;
        const d = distM(u.x, u.z, e.x, e.z);
        if (d <= u.aggro && d < bd) { bd = d; best = e; }
      }
      if (best) { u.targetKind = 1; u.targetId = best.id; return; }
      // blocking obstacle nearby (ground attackers only)
      if (u.layer === 'ground' && this.canHitStructure(u)) {
        let bo: Obstacle | null = null; let od = Infinity;
        for (const o of this.obstacles) {
          if (!o.alive || o.owner !== enemy) continue;
          const d = distM(u.x, u.z, o.x, o.z);
          if (d <= 3000 && d < od) { od = d; bo = o; }
        }
        if (bo) { u.targetKind = 3; u.targetId = bo.id; return; }
      }
      // enemy-deployed watchtower buildings are units; handled above as units
    } else {
      // buildings only: enemy obstacles first if close, else towers
      let bo: Obstacle | null = null; let od = Infinity;
      for (const o of this.obstacles) {
        if (!o.alive || o.owner !== enemy) continue;
        const d = distM(u.x, u.z, o.x, o.z);
        if (d <= 3000 && d < od) { od = d; bo = o; }
      }
      if (bo) { u.targetKind = 3; u.targetId = bo.id; return; }
    }
    // lane tower: nearest alive enemy tower by lane side
    if (!this.canHitStructure(u)) return;
    const lane = u.x < M_ARENA_W / 2 ? 0 : 1;
    const cands = this.towers.filter((tw) => tw.alive && tw.owner === enemy);
    if (cands.length === 0) return;
    const laneTower = cands.find((tw) => tw.lane === lane && tw.kind === 'nsanja' && tw.alive);
    let pick: Tower;
    if (laneTower) pick = laneTower;
    else {
      // nearest by distance (chief included)
      pick = cands.slice().sort((a, b) => distM(u.x, u.z, a.x, a.z) - distM(u.x, u.z, b.x, b.z))[0];
    }
    u.targetKind = 2; u.targetId = pick.id;
  }

  private resolveTarget(u: Unit): { kind: number; id: number; x: number; z: number } | null {
    if (u.targetKind === 1) {
      const e = this.units.find((v) => v.id === u.targetId && v.alive);
      return e ? { kind: 1, id: e.id, x: e.x, z: e.z } : null;
    }
    if (u.targetKind === 2) {
      const tw = this.towers.find((v) => v.id === u.targetId && v.alive);
      return tw ? { kind: 2, id: tw.id, x: tw.x, z: tw.z } : null;
    }
    if (u.targetKind === 3) {
      const o = this.obstacles.find((v) => v.id === u.targetId && v.alive);
      return o ? { kind: 3, id: o.id, x: o.x, z: o.z } : null;
    }
    return null;
  }

  private validTowerTarget(tw: Tower): boolean {
    if (tw.targetKind === 0 || tw.targetId < 0) return false;
    const e = this.units.find((v) => v.id === tw.targetId);
    if (!e || !e.alive) return false;
    const range = toM(tw.kind === 'chief' ? BALANCE.chiefRange : BALANCE.nsanjaRange);
    return distM(tw.x, tw.z, e.x, e.z) <= range + 1500;
  }
  private acquireTowerTarget(tw: Tower) {
    // towers and the watchtower building hit ground + air
    tw.targetKind = 0; tw.targetId = -1;
    const enemy: Team = tw.owner === 0 ? 1 : 0;
    const range = toM(tw.kind === 'chief' ? BALANCE.chiefRange : BALANCE.nsanjaRange);
    let best: Unit | null = null; let bd = Infinity;
    for (const e of this.units) {
      if (!e.alive || e.owner !== enemy) continue;
      const d = distM(tw.x, tw.z, e.x, e.z);
      if (d <= range && d < bd) { bd = d; best = e; }
    }
    if (best) { tw.targetKind = 1; tw.targetId = best.id; }
  }
  private resolveTowerTarget(tw: Tower): Unit | null {
    if (tw.targetKind !== 1) return null;
    const e = this.units.find((v) => v.id === tw.targetId && v.alive);
    return e ?? null;
  }

  nsanjaLost(team: Team): number {
    return this.towers.filter((t) => t.owner === team && t.kind === 'nsanja' && !t.alive).length;
  }
  towerHealthPct(team: Team): number {
    const ts = this.towers.filter((t) => t.owner === team);
    const cur = ts.reduce((s, t) => s + Math.max(0, t.hp), 0);
    const max = ts.reduce((s, t) => s + t.maxHp, 0);
    return max > 0 ? cur / max : 0;
  }

  private checkEnd() {
    const chief0 = this.towers.find((t) => t.owner === 0 && t.kind === 'chief')!;
    const chief1 = this.towers.find((t) => t.owner === 1 && t.kind === 'chief')!;
    if (!chief0.alive || !chief1.alive) {
      this.over = true;
      this.winner = !chief0.alive && !chief1.alive ? 2 : !chief1.alive ? 0 : 1;
      this.overTick = this.tick;
      this.emit({ t: this.time, kind: 'gameOver', text: String(this.winner) });
      return;
    }
    const endReg = BALANCE.regTime;
    const endAll = BALANCE.regTime + BALANCE.suddenDeathTime;
    if (!this.suddenDeath && this.time >= endReg) {
      const l0 = this.nsanjaLost(1); // nsanja of team1 destroyed by team0
      const l1 = this.nsanjaLost(0);
      if (l0 !== l1) return this.finishNow();
      this.suddenDeath = true;
      this.emit({ t: this.time, kind: 'gameOver', text: 'sudden' });
    }
    if (this.time >= endAll) this.finishNow();
  }

  private finishNow() {
    this.over = true;
    const l0 = this.nsanjaLost(1);
    const l1 = this.nsanjaLost(0);
    if (l0 !== l1) this.winner = l0 > l1 ? 0 : 1;
    else {
      const p0 = this.towerHealthPct(0);
      const p1 = this.towerHealthPct(1);
      this.winner = Math.abs(p0 - p1) < 1e-9 ? 2 : p0 > p1 ? 0 : 1;
    }
    this.overTick = this.tick;
    this.emit({ t: this.time, kind: 'gameOver', text: String(this.winner) });
  }

  /** lightweight snapshot for AI (no mutation) */
  unitCount(): number { return this.units.length; }

  // ---------- netcode: snapshots + state hash ----------
  /** Full serializable state (reconnects, resyncs after desync). */
  getState(): BattleState {
    return structuredClone({
      tick: this.tick, seed: this.seed, randA: this.randA,
      units: this.units, towers: this.towers, obstacles: this.obstacles,
      rains: this.rains, puddles: this.puddles, strikes: this.strikes,
      fordUntil: this.fordUntil,
      energy: this.energy, energyFrac: this.energyFrac,
      decks: this.decks, hands: this.hands, queues: this.queues,
      over: this.over, winner: this.winner, suddenDeath: this.suddenDeath,
      slowmoUntil: this.slowmoUntil, nextId: this.nextId, overTick: this.overTick,
    });
  }

  setState(s: BattleState): void {
    const c: BattleState = structuredClone(s);
    this.tick = c.tick; this.seed = c.seed; this.randA = c.randA;
    this.units = c.units; this.towers = c.towers; this.obstacles = c.obstacles;
    this.rains = c.rains; this.puddles = c.puddles; this.strikes = c.strikes ?? [];
    this.fordUntil = c.fordUntil;
    this.energy = c.energy; this.energyFrac = c.energyFrac;
    this.decks = c.decks; this.hands = c.hands; this.queues = c.queues;
    this.over = c.over; this.winner = c.winner; this.suddenDeath = c.suddenDeath;
    this.slowmoUntil = c.slowmoUntil; this.nextId = c.nextId; this.overTick = c.overTick;
    this.events = [];
  }

  /** Short deterministic hash of gameplay state (desync detection). */
  stateHash(): string {
    return hashBattleState(this.getState());
  }
}

export interface BattleState {
  tick: number; seed: number; randA: number;
  units: Unit[]; towers: Tower[]; obstacles: Obstacle[];
  rains: RainZone[]; puddles: Puddle[];
  strikes: MpheziStrike[];
  fordUntil: [number, number];
  energy: [number, number]; energyFrac: [number, number];
  decks: [string[], string[]]; hands: [string[], string[]]; queues: [string[], string[]];
  over: boolean; winner: -1 | 0 | 1 | 2; suddenDeath: boolean;
  slowmoUntil: number; nextId: number; overTick: number;
}

/** Pure state hash (server compares per-slot views without a Battle).
 *  `mirrored` must be true for sims running the z-mirrored board (slot-1
 *  clients): their (owner, lane) towers are the canonical (1-owner, lane)
 *  towers, and unit target references are normalized to match. */
export function hashBattleState(s: BattleState, mirrored = false): string {
  const q = (v: number) => Math.round(v * 1000);
  const parts: (string | number)[] = [s.tick, s.nextId];
  const us = [...s.units].sort((a, b) => a.id - b.id);
  for (const u of us) {
    // Unit targetIds that point at towers are frame-dependent (each side
    // numbers its own towers 100-105), so hash the canonical (owner, lane)
    // slot instead. Unit and obstacle ids are spawn-ordered and identical.
    let tid = u.targetId;
    if (u.targetKind === 2) {
      const tw = s.towers.find((t) => t.id === u.targetId);
      const o = tw ? tw.owner : 0;
      const l = tw ? tw.lane : 0;
      tid = (mirrored ? 1 - o : o) * 3 + l;
    }
    parts.push(u.id, u.owner, q(u.x), q(u.z), q(u.hp), q(u.shield),
      u.cooldown, u.swing, u.targetKind, tid, u.stingUntil, u.summonCd,
      u.alive ? 1 : 0, q(u.walkPhase), u.expiresTick, u.layer, u.canTarget);
  }
  const ts = [...s.towers].sort((a, b) => a.owner - b.owner || a.lane - b.lane);
  // NOTE: no tower id — under team-flip, ids swap sides while (owner, lane)
  // slots stay aligned, so ids would never match. (owner, lane) is unique.
  for (const t of ts) parts.push(q(t.hp), t.alive ? 1 : 0, t.active ? 1 : 0, t.cooldown, t.swing, t.targetId);
  for (const o of s.obstacles) parts.push(o.id, q(o.x), q(o.z), q(o.hp), o.expiresTick);
  for (const r of s.rains) parts.push(q(r.x), q(r.z), r.expiresTick);
  for (const p of s.puddles) parts.push(q(p.x), q(p.z), p.expiresTick);
  for (const k of s.strikes ?? []) {
    // strike targets: tower ids are frame-dependent (see units above),
    // units/obstacles are spawn-ordered and identical.
    const tg = k.tgts.map((g) => {
      if (g.kind !== 'tower') return `${g.kind}:${g.id}`;
      const tw = s.towers.find((t) => t.id === g.id);
      const o = tw ? tw.owner : 0;
      const l = tw ? tw.lane : 0;
      return `${g.kind}:${(mirrored ? 1 - o : o) * 3 + l}`;
    }).join(',');
    parts.push(k.idx, k.nextTick, tg);
  }
  parts.push(s.energy[0], s.energy[1], q(s.energyFrac[0]), q(s.energyFrac[1]));
  parts.push(s.hands[0].join(','), s.hands[1].join(','));
  parts.push(s.queues[0].join(','), s.queues[1].join(','));
  parts.push(s.fordUntil[0], s.fordUntil[1]);
  parts.push(s.randA, s.over ? 1 : 0, s.winner, s.suddenDeath ? 1 : 0);
  let h = 2166136261 >>> 0;
  const str = parts.join('|');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Team-flipped view of a state: clients always label themselves team 0,
 *  so slot-1 players simulate the mirrored board. Owners, energies, hands,
 *  queues, ford windows and obstacle owners swap; the board mirrors in z
 *  (z -> 32000 - z, exact in milli-tiles), x is already symmetric.
 *  The winner flips too (0<->1, draw/undecided unchanged) so flipped views
 *  and local mirrors stay comparable even after the match ends.
 *  Ids/positions otherwise stay. */
export function flipState(s: BattleState): BattleState {
  const flip = (t: 0 | 1): 0 | 1 => (t === 0 ? 1 : 0);
  const mz = (z: number): number => M_MIRROR - z;
  const w = s.winner;
  const winner = (w === 2 || w < 0 ? w : 1 - (w as 0 | 1)) as BattleState['winner'];
  return {
    ...s,
    winner,
    units: s.units.map((u) => ({ ...u, owner: flip(u.owner), z: mz(u.z) })),
    towers: s.towers.map((t) => ({ ...t, owner: flip(t.owner), z: mz(t.z) })),
    obstacles: s.obstacles.map((o) => ({ ...o, owner: flip(o.owner), z: mz(o.z) })),
    rains: s.rains.map((r) => ({ ...r, z: mz(r.z) })),
    puddles: s.puddles.map((p) => ({ ...p, z: mz(p.z) })),
    strikes: (s.strikes ?? []).map((k) => ({
      ...k,
      team: flip(k.team),
      tgts: k.tgts.map((g) => ({ ...g, z: mz(g.z) })),
    })),
    energy: [s.energy[1], s.energy[0]],
    energyFrac: [s.energyFrac[1], s.energyFrac[0]],
    decks: [s.decks[1], s.decks[0]],
    hands: [s.hands[1], s.hands[0]],
    queues: [s.queues[1], s.queues[0]],
    fordUntil: [s.fordUntil[1], s.fordUntil[0]],
  };
}
/** Mirror-frame deploy: `d` carries LOCAL-frame player/coords (self = team 0,
 *  board z-mirrored for slot-1 clients). The origin team rides along so
 *  team-dependent spawn offsets (woweta goats) mirror correctly.
 *  Server never calls this (it simulates canonically). */
export function deployRemote(
  b: Battle, myTeam: Team,
  d: { player: Team; cardId: string; x: number; z: number },
): boolean {
  const origin = (d.player === 0 ? myTeam : ((1 - myTeam) as Team)) as Team;
  return b.deploy(d.player, d.cardId, d.x, d.z, myTeam === 1 ? origin : false);
}

/** Forgiving deploy used by BOTH client (ghost) and server (authority):
 *  exact spot first, else clamp near-misses to the nearest legal point.
 *  Troops/buildings NEVER cross halves: enemy-side or river drops stay
 *  invalid (return null) so the half rule is preserved; only x-outside or
 *  bottom/top-edge misses on the player's own side are pulled inside.
 *  Spells clamp anywhere inside the arena. Tiles in/out. */
export function nudgeDeploy(b: Battle, team: Team, cardId: string, x: number, z: number): { x: number; z: number } | null {
  if (b.canDeploy(team, cardId, x, z).ok) return { x, z };
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  const def = CARDS[cardId];
  if (!def) return null;
  const clampN = (v: number, a: number, b2: number) => Math.min(b2, Math.max(a, v));
  const snap = (v: number) => Math.round(v * 2) / 2;
  if (def.type === 'spell') {
    // spells cast anywhere: just pull back inside the arena bounds
    const cx = snap(clampN(x, 0.5, 17.5));
    const cz = snap(clampN(z, 0.5, 31.5));
    if (b.canDeploy(team, cardId, cx, cz).ok) return { x: cx, z: cz };
    return null;
  }
  // troops + buildings: keep the half rule — enemy side + river never nudge.
  if (team === 0 && z >= 15) return null;
  if (team === 1 && z <= 17) return null;
  // own-side near-miss: clamp x inside, z inside own half (0.5..14.5 / 17.5..31.5)
  const cx = snap(clampN(x, 0.5, 17.5));
  const cz = team === 0 ? snap(clampN(z, 0.5, 14.5)) : snap(clampN(z, 17.5, 31.5));
  if (b.canDeploy(team, cardId, cx, cz).ok) return { x: cx, z: cz };
  return null;
}

function seedStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
function distM(ax: number, az: number, bx: number, bz: number): number {
  return Math.hypot(ax - bx, az - bz);
}
/** Milli-tile target radius: towers 1.1, obstacles 0.9, units 0.25. */
function targetRadius(t: { kind: number }): number {
  return t.kind === 2 ? 1100 : t.kind === 3 ? 900 : 250;
}
/** Instrumented round: logs inputs within 1e-6 of a half (temporary debug). */
function mround(v: number): number {
  // Mirror-symmetric rounding: exact halves (x.5, common from halving ops)
  // round to EVEN, so complementary mirror pairs (a+0.5, b+0.5 with
  // a+b+1 == 32000) always sum back to 32000. Plain round-half-up splits
  // them (18854 vs 13147), which desyncs mirrored sims every time.
  // The 1e-6 window also catches ulp-displaced exact halves.
  const f = v - Math.floor(v);
  if (Math.abs(f - 0.5) < 1e-6) {
    const fl = Math.floor(v);
    return fl % 2 === 0 ? fl : fl + 1;
  }
  return Math.round(v);
}
function targetRadiusM(t: { kind: number }): number {
  return targetRadius(t);
}
function mNearestBridge(mx: number) {
  return M_BRIDGES.slice().sort((a, b) => Math.abs(a.cx - mx) - Math.abs(b.cx - mx))[0];
}
function formationOffsets(n: number): { x: number; z: number }[] {
  const spots = [
    { x: 0, z: 0 }, { x: 0.9, z: 0.4 }, { x: -0.9, z: 0.4 },
    { x: 0.5, z: -0.9 }, { x: -0.5, z: -0.9 },
    { x: 1.1, z: -0.5 }, { x: -1.1, z: -0.5 },
  ];
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) out.push(spots[i % spots.length]);
  return out;
}
