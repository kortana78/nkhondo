// AI opponent: threat reads per lane, counters, energy-advantage pushes.
// Difficulties tune reaction delay, mistake chance, spell use.

import { CARDS, AI_DECK_LIST } from './cards.js';
import { ARENA_W, Battle, TICKS_PER_SEC, toT } from './battle.js';
import type { Team } from './battle.js';

export type Difficulty = 'easy' | 'normal' | 'hard';

const TUNING: Record<Difficulty, { minDelay: number; maxDelay: number; mistake: number; useSpells: boolean; aggro: number }> = {
  easy: { minDelay: 1.5, maxDelay: 2.6, mistake: 0.35, useSpells: false, aggro: 0.35 },
  normal: { minDelay: 0.6, maxDelay: 1.2, mistake: 0.15, useSpells: true, aggro: 0.6 },
  hard: { minDelay: 0.3, maxDelay: 0.6, mistake: 0.05, useSpells: true, aggro: 0.85 },
};

export interface AiAction { card: string; x: number; z: number; }

/** Pick one of the 3 archetype decks (or anything) — used by headless sims. */
export function randomAiDeck(rand: () => number): string[] {
  const d = AI_DECK_LIST[Math.floor(rand() * AI_DECK_LIST.length)];
  return [...d];
}

export class AIController {
  diff: Difficulty;
  team: Team;
  nextThink = 0;
  queued: (AiAction & { at: number }) | null = null;
  rand: () => number;
  // how many elixir-like plays; used for pacing
  constructor(team: Team, diff: Difficulty, seed: number) {
    this.team = team;
    this.diff = diff;
    let s = (seed ^ (team === 0 ? 0x9e3779b9 : 0x85ebca6b)) >>> 0;
    this.rand = () => {
      s |= 0; s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** call every tick; returns an action to play now (already deployed by caller) */
  update(b: Battle): AiAction | null {
    // fire queued delayed action
    if (this.queued && b.tick >= this.queued.at) {
      const q = this.queued;
      this.queued = null;
      if (b.canDeploy(this.team, q.card, q.x, q.z).ok) return q;
    }
    if (this.queued || b.tick < this.nextThink || b.over) return null;
    const t = TUNING[this.diff];
    const think = this.decide(b);
    const delay = (t.minDelay + this.rand() * (t.maxDelay - t.minDelay)) * TICKS_PER_SEC;
    this.nextThink = b.tick + Math.round(1.2 * TICKS_PER_SEC); // think cadence
    if (think) {
      const act = this.rand() < t.mistake ? this.suboptimal(b, think) ?? think : think;
      this.queued = { ...act, at: b.tick + Math.round(delay) };
    }
    return null;
  }

  private decide(b: Battle): AiAction | null {
    const me = this.team;
    const enemy: Team = me === 0 ? 1 : 0;
    const t = TUNING[this.diff];
    const hand = b.hands[me];
    const afford = (c: string) => hand.includes(c) && (CARDS[c]?.cost ?? 99) <= b.energy[me];
    const laneX = (lane: 0 | 1) => (lane === 0 ? 4.1 : 13.9);

    // 1) threats: enemy units on my half, grouped by lane
    const threatByLane = [0, 0];
    let clumpX = 0, clumpZ = 0, clumpN = 0;
    let airThreat = 0;
    for (const u of b.units) {
      if (!u.alive || u.owner !== enemy) continue;
      const onMyHalf = me === 0 ? u.z < 15000 : u.z > 17000;
      if (onMyHalf) {
        const lane = toT(u.x) < ARENA_W / 2 ? 0 : 1;
        threatByLane[lane] += u.hp + u.dmg * 6;
        clumpX += u.x; clumpZ += u.z; clumpN++;
        if (u.layer === 'air') airThreat += u.hp;
      }
    }
    const dangerLane = threatByLane[0] >= threatByLane[1] ? 0 : 1;
    const danger = threatByLane[dangerLane];

    // clump centroid in TILES (deploy API speaks tiles; storage is milli)
    const ccx = clumpN > 0 ? toT(clumpX / clumpN) : 0;
    const ccz = clumpN > 0 ? toT(clumpZ / clumpN) : 0;
    // 2) spell answers (normal+)
    if (t.useSpells && clumpN >= 3 && afford('rain')) {
      return { card: 'rain', x: clamp(ccx, 1, ARENA_W - 1), z: clamp(ccz, 1, 31) };
    }
    if (t.useSpells && afford('mphezi') && (danger > 1400 || clumpN >= 3)) {
      const cx = clumpN > 0 ? ccx : laneX(dangerLane);
      const cz = clumpN > 0 ? ccz : me === 0 ? 11.5 : 20.5;
      return { card: 'mphezi', x: clamp(cx, 1, ARENA_W - 1), z: clamp(cz, 1, 31) };
    }
    if (t.useSpells && afford('mafunde') && (danger > 1200 || clumpN >= 2)) {
      const cx = clumpN > 0 ? ccx : laneX(dangerLane);
      const cz = clumpN > 0 ? ccz : me === 0 ? 11.5 : 20.5;
      return { card: 'mafunde', x: clamp(cx, 1, ARENA_W - 1), z: clamp(cz, 1, 31) };
    }
    if (t.useSpells && afford('harvest') && b.energy[me] <= 4 && danger < 800) {
      return { card: 'harvest', x: 9, z: me === 0 ? 6 : 26 };
    }
    if (t.useSpells && afford('moto') && (danger > 900 || clumpN >= 2)) {
      const cx = clumpN > 0 ? ccx : laneX(dangerLane);
      const cz = clumpN > 0 ? ccz : me === 0 ? 11.5 : 20.5;
      return { card: 'moto', x: clamp(cx, 1, ARENA_W - 1), z: clamp(cz, 1, 31) };
    }
    if (t.useSpells && afford('mphepo') && (danger > 1100 || clumpN >= 3)) {
      const cx = clumpN > 0 ? ccx : laneX(dangerLane);
      const cz = clumpN > 0 ? ccz : me === 0 ? 11.5 : 20.5;
      return { card: 'mphepo', x: clamp(cx, 1, ARENA_W - 1), z: clamp(cz, 1, 31) };
    }
    if (t.useSpells && afford('roadblock') && danger > 1400) {
      const wallZ = me === 0 ? 12.5 : 19.5;
      return { card: 'roadblock', x: laneX(dangerLane), z: wallZ };
    }

    // 3) defend biggest threat with a counter
    if (danger > 250) {
      const order = counterOrder(b, me, enemy, dangerLane, airThreat);
      for (const c of order) {
        if (!afford(c)) continue;
        const def = CARDS[c];
        if (!def || def.type === 'spell') continue;
        // place between threat and tower
        const pz = me === 0 ? 11.5 : 20.5;
        return { card: c, x: laneX(dangerLane) + (this.rand() * 2 - 1), z: pz + (this.rand() * 2 - 1) };
      }
      // cheap chaff fallback
      if (afford('njuchi')) return { card: 'njuchi', x: laneX(dangerLane), z: me === 0 ? 11.5 : 20.5 };
      if (afford('fisi')) return { card: 'fisi', x: laneX(dangerLane), z: me === 0 ? 11.5 : 20.5 };
    }

    // 4) attack when energy advantage or enemy overspent
    const push = b.energy[me] >= 8 || (b.energy[me] >= 6 && this.rand() < t.aggro);
    if (push) {
      // pick weak lane: enemy tower with lower hp, prefer tank + support
      const lane = pickPushLane(b, enemy, this.rand);
      if (t.useSpells && afford('makwerero') && b.energy[me] >= 7 && this.rand() < 0.45)
        return { card: 'makwerero', x: laneX(lane), z: me === 0 ? 13.5 : 18.5 };
      // varied lead (mlonda weighted 2x) so play isn't scripted — and no
      // single card soaks up every high-leverage moment
      const backZ = me === 0 ? 6.5 : 25.5;
      const plays: AiAction[] = [];
      if (afford('mlonda')) plays.push(
        { card: 'mlonda', x: laneX(lane), z: backZ },
        { card: 'mlonda', x: laneX(lane), z: backZ });
      if (afford('mfiti')) plays.push({ card: 'mfiti', x: 9, z: me === 0 ? 8 : 24 });
      if (afford('woweta')) plays.push({ card: 'woweta', x: laneX(lane), z: me === 0 ? 7 : 25 });
      if (afford('fisi')) plays.push({ card: 'fisi', x: laneX(lane), z: me === 0 ? 12.5 : 19.5 });
      if (afford('njuchi')) plays.push({ card: 'njuchi', x: laneX(lane), z: me === 0 ? 12.5 : 19.5 });
      if (afford('zikwanje')) plays.push({ card: 'zikwanje', x: laneX(lane), z: me === 0 ? 12.5 : 19.5 });
      if (afford('watchtower')) plays.push({ card: 'watchtower', x: laneX(lane), z: me === 0 ? 9 : 23 });
      if (plays.length > 0) return plays[Math.floor(this.rand() * plays.length)];
    }

    // 5) passive: build up backline support when rich
    if (b.energy[me] >= 9) {
      if (afford('mfiti')) return { card: 'mfiti', x: 9, z: me === 0 ? 7 : 25 };
      if (afford('mlonda')) return { card: 'mlonda', x: 9, z: me === 0 ? 6 : 26 };
      if (afford('zikwanje')) return { card: 'zikwanje', x: 9, z: me === 0 ? 7 : 25 };
      if (t.useSpells && afford('harvest')) return { card: 'harvest', x: 9, z: me === 0 ? 6 : 26 };
    }
    return null;
  }

  private suboptimal(b: Battle, good: AiAction): AiAction | null {
    // 15% (normal): wrong lane or cheaper random card
    const hand = b.hands[this.team].filter((c) => (CARDS[c]?.cost ?? 99) <= b.energy[this.team] && c !== good.card);
    if (hand.length === 0) return good;
    const c = hand[Math.floor(this.rand() * hand.length)];
    const def = CARDS[c];
    let x = good.x, z = good.z;
    if (this.rand() < 0.5) x = ARENA_W - good.x; // wrong lane
    if (def.type === 'troop' || def.type === 'building') {
      z = this.team === 0 ? 3 + this.rand() * 10 : 19 + this.rand() * 10;
    }
    return b.canDeploy(this.team, c, x, z).ok ? { card: c, x, z } : good;
  }
}

function clamp(v: number, a: number, b: number) { return v < a ? a : v > b ? b : v; }

/** counter preference vs the most dangerous enemy unit in that lane */
function counterOrder(b: Battle, me: Team, enemy: Team, lane: 0 | 1, airThreat: number): string[] {
  // air threats need air-hitters: njuchi, mfiti (+owls), watchtower, towers
  if (airThreat > 500) return ['njuchi', 'mfiti', 'watchtower', 'zikwanje', 'mlonda', 'woweta', 'fisi'];
  let tankHp = 0, swarmN = 0, rangedN = 0, bldgN = 0;
  for (const u of b.units) {
    if (!u.alive || u.owner !== enemy) continue;
    if ((u.x < 9000 ? 0 : 1) !== lane) continue;
    const onMyHalf = me === 0 ? u.z < 15000 : u.z > 17000;
    if (!onMyHalf) continue;
    if (u.buildingsOnly) bldgN++;
    else if (u.maxHp >= 1500) tankHp += u.hp;
    else if (u.maxHp <= 250) swarmN++;
    else if (u.ranged) rangedN++;
    else tankHp += u.hp * 0.5;
  }
  if (bldgN > 0 && tankHp < 800) return ['woweta', 'njuchi', 'fisi', 'mlonda', 'zikwanje', 'mfiti', 'watchtower'];
  if (tankHp >= 1200) return ['mlonda', 'woweta', 'mfiti', 'zikwanje', 'fisi', 'watchtower', 'njuchi'];
  if (swarmN >= 3 || rangedN >= 1) return ['zikwanje', 'watchtower', 'woweta', 'mfiti', 'njuchi', 'fisi', 'mlonda'];
  return ['woweta', 'njuchi', 'fisi', 'zikwanje', 'mlonda', 'mfiti', 'watchtower'];
}

function pickPushLane(b: Battle, enemy: Team, rand: () => number): 0 | 1 {
  const L = b.towers.find((t) => t.owner === enemy && t.lane === 0 && t.kind === 'nsanja');
  const R = b.towers.find((t) => t.owner === enemy && t.lane === 1 && t.kind === 'nsanja');
  const lh = L && L.alive ? L.hp / L.maxHp : -1;
  const rh = R && R.alive ? R.hp / R.maxHp : -1;
  if (lh < 0 && rh < 0) return rand() < 0.5 ? 0 : 1;
  if (lh < 0) return 1;
  if (rh < 0) return 0;
  if (Math.abs(lh - rh) < 0.08) return rand() < 0.5 ? 0 : 1;
  return lh < rh ? 0 : 1;
}
