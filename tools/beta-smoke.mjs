// Offline-beta smoke test: title -> battle -> deploy -> results-path, zero console errors.
// Usage: node tools/beta-smoke.mjs [URL]  (default http://localhost:4173)
// Serve first: `npm run build` then `npx vite preview --port 4173 --strictPort`
import { chromium } from 'playwright';

const URL = (process.argv[2] ?? 'http://localhost:4173').replace(/\/$/, '');
let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
};

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });

await page.goto(URL + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
ok('title shows NKHONDO', (await page.content()).includes('NKHONDO'));
ok('battle button present', (await page.locator('.battle-btn, .btn.big').count()) > 0);

await page.goto(URL + '/?s=battle&empty=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(4000);
for (let i = 0; i < 3; i++) {
  const btn = page.locator('.coach-card .btn');
  if (await btn.count()) { await btn.click().catch(() => {}); await page.waitForTimeout(300); }
}
const hand = await page.locator('.hand .gcard .gname').allTextContents().catch(() => []);
ok('hand deals 4 cards', hand.length === 4, JSON.stringify(hand));
const e0 = parseInt(await page.locator('.mphamvu b').first().textContent().catch(() => 'x'), 10);
ok('elixir meter visible', Number.isFinite(e0), `energy=${e0}`);

const deployed = await page.evaluate(() => {
  const api = window.__nkhondo;
  const b = api?.battle;
  if (!b) return 'no-battle';
  b.energy[0] = 10;
  if (!b.hands[0].includes('mlonda')) b.hands[0] = ['mlonda', ...b.hands[0].slice(0, 3)];
  return b.deploy(0, 'mlonda', 9, 6) ? `units=${b.units.length}` : 'deploy-false';
});
ok('troop deploys on own half', String(deployed).startsWith('units='), String(deployed));

const invalid = await page.evaluate(() => {
  const b = window.__nkhondo?.battle;
  if (!b) return 'no-battle';
  b.energy[0] = 10;
  if (!b.hands[0].includes('mlonda')) b.hands[0] = ['mlonda', ...b.hands[0].slice(0, 3)];
  const chk = b.canDeploy(0, 'mlonda', 9, 25);
  return !chk.ok ? chk.reason : 'wrongly-ok';
});
ok('enemy-half troop stays invalid', invalid === 'half', `reason=${invalid}`);

await page.waitForTimeout(3000);
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res((n / (performance.now() - t0)) * 1000); };
  requestAnimationFrame(loop);
}));
console.log(`rAF fps (note: SwiftShader CPU rendering, not device GPU): ${Math.round(fps)}`);
ok('zero console/page errors', errors.length === 0, errors.length ? errors.slice(0, 5).join(' | ') : '');
await browser.close();
console.log(fails === 0 ? 'BETA SMOKE PASSED' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
