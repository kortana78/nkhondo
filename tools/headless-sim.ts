// Headless AI-vs-AI balance runner: `npm run sim -- 1000`
// Prints win rate overall + per-card usage-weighted win rate, avg match time.
import { Battle, TICKS_PER_SEC } from '../shared/sim/battle';
import { AIController, randomAiDeck } from '../shared/sim/ai';
import { ALL_CARD_IDS, BALANCE, AI_DECK_LIST } from '../shared/sim/cards';

const N = Math.max(1, parseInt(process.argv[2] ?? '1000', 10) || 1000);

function randomDeck(rand: () => number): string[] {
  // half archetype decks (realistic meta), half fully random (coverage)
  if (rand() < 0.5) return [...AI_DECK_LIST[Math.floor(rand() * AI_DECK_LIST.length)]];
  const pool = [...ALL_CARD_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 8);
}
void randomAiDeck;

let seed = 12345;
const srand = () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const maxTicks = (BALANCE.regTime + BALANCE.suddenDeathTime + 5) * TICKS_PER_SEC;
const cardWins: Record<string, number> = {};
const cardGames: Record<string, number> = {};
for (const c of ALL_CARD_IDS) { cardWins[c] = 0; cardGames[c] = 0; }
let w0 = 0, w1 = 0, draws = 0, totalTicks = 0;
let p0wins = 0;

const t0 = Date.now();
for (let m = 0; m < N; m++) {
  const d0 = randomDeck(srand);
  const d1 = randomDeck(srand);
  const b = new Battle(1000 + m, d0, d1);
  const ai0 = new AIController(0, 'normal', 5000 + m);
  const ai1 = new AIController(1, 'normal', 9000 + m);
  let guard = 0;
  while (!b.over && guard++ < maxTicks) {
    const a0 = ai0.update(b);
    if (a0) b.deploy(0, a0.card, a0.x, a0.z);
    const a1 = ai1.update(b);
    if (a1) b.deploy(1, a1.card, a1.x, a1.z);
    b.step();
  }
  totalTicks += b.tick;
  if (b.winner === 0) { w0++; p0wins++; }
  else if (b.winner === 1) { w1++; }
  else draws++;
  const winDeck = b.winner === 0 ? d0 : b.winner === 1 ? d1 : null;
  for (const c of d0) cardGames[c]++;
  for (const c of d1) cardGames[c]++;
  if (winDeck) for (const c of winDeck) cardWins[c]++;
}
const ms = Date.now() - t0;

console.log(`\nNKHONDO headless balance — ${N} AI(normal)-vs-AI(normal) matches`);
console.log(`seeds 1000..${1000 + N - 1}, maxTicks/match ${maxTicks}`);
console.log(`P0 wins: ${w0} (${(100 * w0 / N).toFixed(1)}%)  P1 wins: ${w1} (${(100 * w1 / N).toFixed(1)}%)  draws: ${draws}`);
console.log(`avg match time: ${(totalTicks / N / TICKS_PER_SEC).toFixed(1)}s   sim speed: ${(N / (ms / 1000)).toFixed(0)} matches/s`);
console.log(`\ncard        games   win% (when in winning deck)`);
const rows = ALL_CARD_IDS.map((c) => ({
  c,
  g: cardGames[c],
  w: cardGames[c] ? (100 * cardWins[c]) / cardGames[c] : 0,
})).sort((a, b) => b.w - a.w);
for (const r of rows) {
  const flag = r.w > 58 ? '  <-- NERF?' : r.w < 42 ? '  <-- BUFF?' : '';
  console.log(`${r.c.padEnd(12)}${String(r.g).padStart(6)}   ${r.w.toFixed(1).padStart(5)}%${flag}`);
}
console.log('\nBalance guide: aim every card 47-53%. >55% = nerf candidate, <45% = buff candidate.');
console.log('Spec flags: >58% nerf, <42% buff.');
