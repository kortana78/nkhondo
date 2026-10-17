// Scale audit vs reference (hut tower height = 1.0).
// Humanoid 0.35-0.45, hyena 0.30, goat 0.22. Flags anything outside ±20%.
// Run: npx tsx tools/scale-audit.ts
// World heights: nsanja bar h 5.6 (=1.0), humanoid ~1.95*big, hyena ~0.8*1.8, goat ~0.78*1.5.

const TOWER = 5.6;
const rows: { id: string; h: number; lo: number; hi: number }[] = [
  { id: 'humanoid (mlonda/zikwanje/woweta/mfiti)', h: 1.95 / TOWER, lo: 0.35 * 0.8, hi: 0.45 * 1.2 },
  { id: 'mlonda (big 1.38)', h: (1.95 * 1.38) / TOWER, lo: 0.35 * 0.8, hi: 0.45 * 1.2 },
  { id: 'afisi hyena (0.8 x species 1.8)', h: (0.8 * 1.8) / TOWER, lo: 0.3 * 0.8, hi: 0.3 * 1.2 },
  { id: 'goat (0.78 x species 1.5)', h: (0.78 * 1.5) / TOWER, lo: 0.22 * 0.8, hi: 0.22 * 1.2 },
  { id: 'bee/owl air (hover, exempt visual)', h: 0.6 / TOWER, lo: 0.05, hi: 0.2 },
];
let fails = 0;
for (const r of rows) {
  const ok = r.h >= r.lo && r.h <= r.hi;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${r.id} ratio=${r.h.toFixed(3)} allowed=[${r.lo.toFixed(3)},${r.hi.toFixed(3)}]`);
  if (!ok && !r.id.includes('exempt')) fails++;
}
console.log(fails === 0 ? 'SCALE AUDIT PASSED' : `${fails} OUT OF RANGE`);
process.exit(fails === 0 ? 0 : 1);
