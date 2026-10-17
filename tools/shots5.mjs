import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

await page.goto('http://127.0.0.1:4173/?s=battle', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
for (let i = 0; i < 3; i++) {
  const btn = page.locator('.coach-card .btn');
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(400); }
}
// arm first card, hover arena -> ghost footprint preview
await page.locator('.hand .gcard').first().click();
await page.waitForTimeout(600);
await page.mouse.move(240, 420);
await page.waitForTimeout(1200);
await page.screenshot({ path: 'shots/armed-ghost.png' });
const energyBefore = await page.locator('.mphamvu b').first().textContent();
// double-tap same card -> smart auto-cast
await page.locator('.hand .gcard').first().click();
await page.waitForTimeout(2500);
const energyAfter = await page.locator('.mphamvu b').first().textContent();
console.log('energy before/after double-tap cast:', energyBefore, '->', energyAfter);
await page.screenshot({ path: 'shots/autocast.png' });
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
