import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 }, hasTouch: true });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

await page.goto('http://127.0.0.1:4173/?s=battle', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
for (let i = 0; i < 3; i++) {
  const btn = page.locator('.coach-card .btn');
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(300); }
}
const energy = () => page.locator('.mphamvu b').first().textContent();
const armed = () => page.locator('.hand .gcard.sel').count();
async function tap(x, y, holdMs) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.waitForTimeout(300);
}
const cardBox = await page.locator('.hand .gcard').first().boundingBox();
const cx = cardBox.x + cardBox.width / 2, cy = cardBox.y + cardBox.height / 2;

// 1. instant tap (0ms hold) must still arm
await tap(cx, cy, 0);
console.log('instant tap armed count:', await armed());
// 2. tap own half -> deploy
const e0 = await energy();
await tap(240, 600, 120);
const e1 = await energy();
console.log('tap-place: energy', e0, '->', e1, Number(e1) < Number(e0) ? 'DEPLOYED' : 'NOTHING HAPPENED', '| still armed:', await armed());
await page.screenshot({ path: 'shots/tapflow.png' });
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
