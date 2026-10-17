// Smoke verification for sim logic (not part of the game bundle).
import { Battle, toM, toT } from '../shared/sim/battle';
import { AIController } from '../shared/sim/ai';
import { STARTER_DECK } from '../shared/sim/cards';
void toM;

let fails = 0;
function ok(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) fails++;
}

// 1. deploy rules
{
  const b = new Battle(1, [...STARTER_DECK], [...STARTER_DECK]);
  b.energy[0] = 10;
  b.hands[0] = ['mlonda', 'rain', 'moto', 'fisi'];
  ok('troop on own half', b.canDeploy(0, 'mlonda', 9, 6).ok);
  ok('troop rejected on enemy half', !b.canDeploy(0, 'mlonda', 9, 25).ok);
  ok('spell anywhere', b.canDeploy(0, 'rain', 9, 25).ok);
  ok('energy gate', (() => { b.energy[0] = 1; const r = !b.canDeploy(0, 'mlonda', 9, 6).ok; b.energy[0] = 10; return r; })());
  ok('deploy cycles hand', (() => {
    const before = [...b.hands[0]];
    b.deploy(0, 'mlonda', 9, 6);
    return b.hands[0].length === 4 && !(b.hands[0].every((c, i) => c === before[i]) && b.energy[0] === 10);
  })());
}

// 2. determinism: same seed -> identical trace hash
function traceHash(seed: number): string {
  const b = new Battle(seed, [...STARTER_DECK], [...STARTER_DECK]);
  const ai0 = new AIController(0, 'normal', 7);
  const ai1 = new AIController(1, 'normal', 8);
  let guard = 0;
  while (!b.over && guard++ < 6000) {
    const a0 = ai0.update(b); if (a0) b.deploy(0, a0.card, a0.x, a0.z);
    const a1 = ai1.update(b); if (a1) b.deploy(1, a1.card, a1.x, a1.z);
    b.step();
  }
  let h = 2166136261 >>> 0;
  const mix = (n: number) => { h ^= (n * 2654435761) >>> 0; h = Math.imul(h, 16777619); };
  mix(b.winner + 5); mix(b.tick);
  for (const u of b.units) { mix(u.id); mix(Math.round(u.hp * 7)); }
  for (const t of b.towers) mix(Math.round(t.hp));
  return (h >>> 0).toString(16);
}
{
  const a = traceHash(42), c = traceHash(42), d = traceHash(43);
  ok('deterministic same seed', a === c);
  ok('different seeds diverge', a !== d);
}

// 3. chief activates when hit; fisi pair spawns two hyenas
{
  const b = new Battle(5, [...STARTER_DECK], [...STARTER_DECK]);
  const chief = b.towers.find((t) => t.owner === 1 && t.kind === 'chief')!;
  ok('chief starts dormant', !chief.active);
  b.energy[0] = 10;
  b.hands[0] = ['fisi', 'mlonda', 'woweta', 'moto'];
  ok('fisi spawns a hyena pair', b.deploy(0, 'fisi', 9, 13.5) &&
    b.units.filter((u) => u.card === 'fisi').length === 2);
  // send waves with energy cheats until the defence reacts
  const wave = ['mlonda', 'fisi', 'woweta', 'moto'];
  let wi = 0;
  for (let i = 0; i < 20 * 240 && !b.over && !chief.active; i++) {
    if (i % (20 * 6) === 0) {
      b.energy[0] = 10;
      const c = wave[wi++ % wave.length];
      b.deploy(0, c, ...(c === 'moto' ? [9, 24] as [number, number] : [13.9, 13.2] as [number, number]));
    }
    b.step();
  }
  ok('chief activated during raid', chief.active);
}

// 4. match always terminates with a decision
{
  let done = true;
  for (let s = 0; s < 20; s++) {
    const b = new Battle(100 + s, [...STARTER_DECK], [...STARTER_DECK]);
    const ai0 = new AIController(0, 'hard', s);
    const ai1 = new AIController(1, 'hard', s + 50);
    let g = 0;
    while (!b.over && g++ < 6000) {
      const a0 = ai0.update(b); if (a0) b.deploy(0, a0.card, a0.x, a0.z);
      const a1 = ai1.update(b); if (a1) b.deploy(1, a1.card, a1.x, a1.z);
      b.step();
    }
    if (!b.over) done = false;
  }
  ok('20/20 hard matches terminate', done);
}

// 5. mafunde shoves + damages, harvest grants energy
{
  const d0 = ['mafunde', 'harvest', 'mlonda', 'fisi', 'moto', 'mfiti', 'rain', 'roadblock'];
  const d1 = ['fisi', 'mlonda', 'moto', 'njuchi', 'woweta', 'zikwanje', 'watchtower', 'rain'];
  const b = new Battle(9, d0, d1);
  b.energy[0] = 5; b.energy[1] = 10;
  b.hands[0] = ['mafunde', 'harvest', 'mlonda', 'moto'];
  b.hands[1] = ['fisi', 'mlonda', 'moto', 'njuchi'];
  b.deploy(1, 'fisi', 9, 25);
  const before = b.units.filter((u) => u.owner === 1).map((u) => ({ x: u.x, z: u.z, hp: u.hp }));
  ok('mafunde deploys', b.deploy(0, 'mafunde', 9, 23));
  const after = b.units.filter((u) => u.owner === 1);
  ok('mafunde shoves + damages every enemy in radius', after.length === before.length && after.every((u, i) =>
    u.hp === before[i].hp - 60 &&
    (Math.abs(u.z - before[i].z) > 500 || Math.abs(u.x - before[i].x) > 500)));
  const e0 = b.energy[0];
  ok('harvest deploys', b.deploy(0, 'harvest', 9, 8));
  ok('harvest grants net energy', b.energy[0] === Math.min(10, e0 - 3 + 5));
}

// 6. moto burns, mphepo shoves toward the enemy side, ladders open a ford
{
  const d = ['moto', 'mphepo', 'makwerero', 'mlonda', 'fisi', 'njuchi', 'woweta', 'rain'];
  const b = new Battle(11, d, [...d]);
  b.energy[0] = 10; b.energy[1] = 10;
  b.hands[0] = ['moto', 'mphepo', 'makwerero', 'mlonda'];
  b.hands[1] = ['fisi', 'mlonda', 'moto', 'njuchi'];
  b.deploy(1, 'fisi', 9, 25);
  ok('moto deploys', b.deploy(0, 'moto', 9, 25));
  ok('moto burns every enemy in radius', b.units.filter((u) => u.owner === 1).every((u) => u.hp === 300 - 200));
  const z0 = b.units.filter((u) => u.owner === 1).map((u) => u.z);
  ok('mphepo deploys', b.deploy(0, 'mphepo', 9, 24));
  const afterW = b.units.filter((u) => u.owner === 1);
  ok('mphepo hurls enemies toward their side', afterW.every((u, i) => u.z > z0[i] + 1000 && u.hp === 300 - 200 - 30));
  b.energy[0] = 10;
  ok('ladders deploy', b.deploy(0, 'makwerero', 9, 13));
  ok('ford window opens', b.fordUntil[0] === b.tick + 300);
  b.energy[1] = 10;
  b.hands[1] = ['fisi', 'fisi', 'mlonda', 'moto'];
  ok('second pair deploys', b.deploy(1, 'fisi', 9, 17.5));
  b.energy[0] = 10;
  b.deploy(0, 'mlonda', 9, 12);
  b.fordUntil[1] = b.tick + 300; // ladder the enemy too: straight duel, no bridge detours
  const before = new Map(b.units
    .filter((u) => u.owner === 1 && u.card === 'fisi' && u.z >= 16000 && u.z < 19000)
    .map((u) => [u.id, { x: u.x, z: u.z }]));
  ok('pair tracked', before.size === 2);
  // corridor check: a bridge detour would swing x toward 4.1/13.9 within ~1s
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < 30; i++) {
    b.step();
    for (const u of b.units) {
      if (before.has(u.id)) { minX = Math.min(minX, u.x); maxX = Math.max(maxX, u.x); }
    }
  }
  const m = b.units.find((u) => u.owner === 0 && u.card === 'mlonda');
  const pair2 = b.units.filter((u) => before.has(u.id));
  ok('laddered troops ford straight (no bridge detour)',
    !!m && pair2.length === 2 && Math.abs(m.x - 9000) < 600 && m.z > 12000 &&
    minX > 7000 && maxX < 11000 &&
    pair2.every((u) => u.z < before.get(u.id)!.z));
}

// 7. blast spells chip enemy towers (40%) so fire on a tower always shows damage
{
  const d = ['moto', 'mphepo', 'makwerero', 'mlonda', 'fisi', 'njuchi', 'woweta', 'rain'];
  const b = new Battle(12, d, [...d]);
  b.energy[0] = 10;
  b.hands[0] = ['moto', 'mphepo', 'makwerero', 'mlonda'];
  const tw = b.towers.find((t) => t.owner === 1 && t.kind === 'nsanja' && t.lane === 1)!;
  ok('moto chips the tower', b.deploy(0, 'moto', toT(tw.x), toT(tw.z)) && tw.hp === 1800 - 80);
}

// 8. flying: njuchi bees are air, fly straight over the river
{
  const d = ['njuchi', 'mlonda', 'fisi', 'woweta', 'moto', 'rain', 'mphezi', 'watchtower'];
  const b = new Battle(13, d, [...d]);
  b.energy[0] = 10;
  b.hands[0] = ['njuchi', 'mlonda', 'fisi', 'woweta'];
  ok('njuchi deploys a swarm of 6', b.deploy(0, 'njuchi', 9, 13.5) &&
    b.units.filter((u) => u.card === 'njuchi').length === 6);
  const bee = b.units.find((u) => u.sub === 'bee')!;
  ok('bees fly', bee.layer === 'air' && bee.canTarget === 'both');
}

console.log(fails === 0 ? '\nALL SMOKE TESTS PASSED' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
