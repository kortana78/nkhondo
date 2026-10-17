// Diagnostic: is a lone guard visible?
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 500)));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE-' + m.type() + ':', m.text().slice(0, 300)); });
await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
await page.addInitScript(() => {
  try {
    localStorage.setItem('nkhondo:coach', '1');
    localStorage.setItem('nkhondo:tutorial', 'skipped');
  } catch { /* noop */ }
});
await page.goto('http://localhost:4173/?s=battle&empty=1', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(3500);
const r = await page.evaluate(() => {
  const api = window.__nkhondo;
  const b = api?.battle;
  const dep = (card, x, z) => {
    b.energy[0] = 10;
    if (!b.hands[0].includes(card)) b.hands[0][0] = card;
    return b.deploy(0, card, x, z);
  };
  // A: native guard, untouched. B: same-spot rewrite only.
  const out = [dep('mlonda', 7, 10), dep('mlonda', 11, 10)];
  for (const tw of b.towers) tw.cooldown = 99999;
  const us = b.units.filter((u) => u.card === 'mlonda');
  us[1].x = us[1].x; us[1].z = us[1].z; // no-op write: does this hide it?
  return { out, units: b.units.map((u) => `${u.card}@${u.x},${u.z},spd${u.speed}`) };
});
console.log(JSON.stringify(r));
await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/diag-guard.png', timeout: 20000 });
await browser.close();
