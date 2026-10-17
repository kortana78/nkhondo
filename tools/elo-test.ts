// Elo unit tests. Run: tsx tools/elo-test.ts
import { START_RATING, applyElo, expectedScore, kFactor, arenaUnlocked } from '../shared/elo';

let fails = 0;
function ok(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
}

ok('start rating is 1000', START_RATING === 1000);
// equal ratings: expected 0.5, K=40 (new player), win -> +20
{
  const r = applyElo(1000, 1000, 1, 0);
  ok('even win +20', r.rating === 1020 && r.delta === 20 && r.k === 40, JSON.stringify(r));
}
// loss mirrors
{
  const r = applyElo(1000, 1000, 0, 0);
  ok('even loss -20', r.rating === 980 && r.delta === -20, JSON.stringify(r));
}
// draw, equal ratings -> no change
{
  const r = applyElo(1000, 1000, 0.5, 5);
  ok('even draw unchanged', r.rating === 1000 && r.delta === 0, JSON.stringify(r));
}
// upset win gains more than favourite win
{
  const upset = applyElo(800, 1200, 1, 40);
  const chalk = applyElo(1200, 800, 1, 40);
  ok('upset pays more', upset.delta > chalk.delta, `upset=${upset.delta} chalk=${chalk.delta}`);
}
// K tiers: <30 games -> 40; >=30 & <2000 -> 24; >=2000 -> 16
ok('K new player', kFactor(1000, 0) === 40);
ok('K regular', kFactor(1500, 100) === 24);
ok('K elite', kFactor(2100, 100) === 16);
ok('K 30th game boundary', kFactor(1500, 29) === 40 && kFactor(1500, 30) === 24);
// floor at 0 (favoured player loses: 5 - 24*0.37 would go negative)
{
  const r = applyElo(5, 100, 0, 100);
  ok('floor at 0', r.rating === 0 && r.delta === -5, JSON.stringify(r));
}
// expected score sanity
ok('expected 0.5 even', Math.abs(expectedScore(1200, 1200) - 0.5) < 1e-9);
ok('underdog < 0.5', expectedScore(1000, 1400) < 0.5);
ok('favourite > 0.5', expectedScore(1400, 1000) > 0.5);
// symmetry: zero-sum for a finished match (both sides computed)
{
  const a = applyElo(1100, 900, 1, 50);
  const b = applyElo(900, 1100, 0, 50);
  ok('zero-sum', a.delta + b.delta === 0, `${a.delta} + ${b.delta}`);
}
// arena unlocks
ok('mudzi open at 0', arenaUnlocked('mudzi', 0));
ok('msika locked at 399', !arenaUnlocked('msika', 399));
ok('msika open at 400', arenaUnlocked('msika', 400));
ok('nyika locked at 1999', !arenaUnlocked('nyika', 1999));

if (fails > 0) { console.log(`${fails} FAILURES`); process.exit(1); }
console.log('ALL ELO TESTS PASSED');
