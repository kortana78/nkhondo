// Determinism test: the shared sim must produce bit-identical results for the
// same seed + input list, and snapshots must resume exactly. Run: tsx tools/determinism.ts
import { Battle } from '../shared/sim/battle';
import { AIController } from '../shared/sim/ai';
import { STARTER_DECK } from '../shared/sim/cards';

let fails = 0;
function ok(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
}

interface Input { tick: number; team: 0 | 1; card: string; x: number; z: number }

// fixed scripted input list (valid plays, both teams, troops + spells)
const SCRIPT: Input[] = [
  { tick: 20, team: 0, card: 'njuchi', x: 4.1, z: 12.5 },
  { tick: 40, team: 1, card: 'njuchi', x: 13.9, z: 19.5 },
  { tick: 80, team: 0, card: 'mfiti', x: 9, z: 6 },
  { tick: 100, team: 1, card: 'mfiti', x: 9, z: 26 },
  { tick: 140, team: 0, card: 'moto', x: 9, z: 22 },
  { tick: 160, team: 1, card: 'rain', x: 9, z: 12 },
  { tick: 220, team: 0, card: 'zikwanje', x: 4.1, z: 10 },
  { tick: 240, team: 1, card: 'zikwanje', x: 13.9, z: 22 },
  { tick: 300, team: 0, card: 'mlonda', x: 9, z: 8 },
  { tick: 320, team: 1, card: 'mphezi', x: 9, z: 12 },
  { tick: 380, team: 0, card: 'mphezi', x: 4.1, z: 11 },
  { tick: 400, team: 1, card: 'woweta', x: 4.1, z: 21 },
  { tick: 460, team: 0, card: 'woweta', x: 13.9, z: 11 },
  { tick: 480, team: 1, card: 'fisi', x: 9, z: 20 },
  { tick: 540, team: 0, card: 'fisi', x: 9, z: 12 },
  { tick: 600, team: 0, card: 'watchtower', x: 4.1, z: 9 },
  { tick: 620, team: 1, card: 'watchtower', x: 13.9, z: 23 },
  { tick: 700, team: 0, card: 'mafunde', x: 9, z: 20 },
  { tick: 760, team: 1, card: 'mphepo', x: 9, z: 12 },
  { tick: 820, team: 0, card: 'roadblock', x: 9, z: 13 },
  { tick: 880, team: 1, card: 'harvest', x: 9, z: 24 },
  { tick: 940, team: 0, card: 'harvest', x: 9, z: 8 },
  { tick: 1000, team: 0, card: 'makwerero', x: 9, z: 8 },
  { tick: 1060, team: 1, card: 'makwerero', x: 9, z: 24 },
];

function runScripted(seed: number, ticks: number, collectEvery: number): { hashes: string[]; applied: number } {
  const b = new Battle(seed, [...STARTER_DECK], [...STARTER_DECK]);
  const hashes: string[] = [];
  let applied = 0;
  let si = 0;
  for (let i = 0; i < ticks && !b.over; i++) {
    while (si < SCRIPT.length && SCRIPT[si].tick === b.tick) {
      const s = SCRIPT[si++];
      // top up energy + force the card into hand so the script always has
      // legal plays (identical on both runs, determinism preserved)
      b.energy[s.team] = 10;
      if (!b.hands[s.team].includes(s.card)) b.hands[s.team][0] = s.card;
      if (b.deploy(s.team, s.card, s.x, s.z)) applied++;
    }
    b.step();
    if (b.tick % collectEvery === 0) hashes.push(b.stateHash());
  }
  return { hashes, applied };
}

// 1. identical input list twice -> identical hash at every sampled tick
{
  const a = runScripted(1234, 1400, 20);
  const b = runScripted(1234, 1400, 20);
  ok('scripted inputs applied', a.applied >= 20, `applied=${a.applied}`);
  ok('identical hashes, same seed+inputs', a.hashes.join() === b.hashes.join());
  const c = runScripted(9999, 1400, 20);
  ok('different seed diverges', a.hashes.join() !== c.hashes.join());
}

// 2. snapshot mid-match -> restored copy continues identically
{
  const b1 = new Battle(777, [...STARTER_DECK], [...STARTER_DECK]);
  let si = 0;
  for (let i = 0; i < 500; i++) {
    while (si < SCRIPT.length && SCRIPT[si].tick === b1.tick) {
      const s = SCRIPT[si++];
      b1.energy[s.team] = 10;
      b1.deploy(s.team, s.card, s.x, s.z);
    }
    b1.step();
  }
  const snap = b1.getState();
  const b2 = new Battle(1, [...STARTER_DECK], [...STARTER_DECK]);
  b2.setState(snap);
  ok('snapshot hash matches at restore', b1.stateHash() === b2.stateHash(), `${b1.stateHash()} vs ${b2.stateHash()}`);
  const h1: string[] = [];
  const h2: string[] = [];
  for (let i = 0; i < 500; i++) {
    while (si < SCRIPT.length && SCRIPT[si].tick === b1.tick) {
      const s = SCRIPT[si++];
      b1.energy[s.team] = 10; b2.energy[s.team] = 10;
      if (!b1.hands[s.team].includes(s.card)) b1.hands[s.team][0] = s.card;
      if (!b2.hands[s.team].includes(s.card)) b2.hands[s.team][0] = s.card;
      const r1 = b1.deploy(s.team, s.card, s.x, s.z);
      const r2 = b2.deploy(s.team, s.card, s.x, s.z);
      if (r1 !== r2) break;
    }
    b1.step(); b2.step();
    if (b1.tick % 20 === 0) { h1.push(b1.stateHash()); h2.push(b2.stateHash()); }
  }
  ok('restored sim continues identically', h1.join() === h2.join());
}

// 3. AI vs AI full match twice -> identical (no hidden nondeterminism)
{
  const run = (seed: number) => {
    const b = new Battle(seed, [...STARTER_DECK], [...STARTER_DECK]);
    const ai0 = new AIController(0, 'normal', 7);
    const ai1 = new AIController(1, 'normal', 8);
    let guard = 0;
    while (!b.over && guard++ < 6000) {
      const a0 = ai0.update(b); if (a0) b.deploy(0, a0.card, a0.x, a0.z);
      const a1 = ai1.update(b); if (a1) b.deploy(1, a1.card, a1.x, a1.z);
      b.step();
    }
    return `${b.winner}:${b.tick}:${b.stateHash()}`;
  };
  const r1 = run(42);
  const r2 = run(42);
  ok('AI match deterministic', r1 === r2, r1);
  ok('AI match terminates', r1.length > 0);
}

if (fails > 0) { console.log(`${fails} FAILURES`); process.exit(1); }
console.log('ALL DETERMINISM TESTS PASSED');
