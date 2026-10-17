import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
await page.goto('http://127.0.0.1:4173/?s=battle&empty=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
for (let i = 0; i < 3; i++) {
  const btn = page.locator('.coach-card .btn');
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(300); }
}
// open the pause menu too
await page.locator('.hud-top .iconbtn').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/after-desktop.png' });
await page.locator('.pause-card .btn.big').click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/after-desktop2.png' });
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
