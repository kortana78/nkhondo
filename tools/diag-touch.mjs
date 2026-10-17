import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 }, hasTouch: true, isMobile: true });
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
const handNames = () => page.locator('.hand .gcard .gname').allTextContents();

// log hand + costs
console.log('hand:', JSON.stringify(await handNames()));
console.log('energy0:', await energy());

// touchscreen tap on first card
await page.touchscreen.tap(120, 780);
await page.waitForTimeout(500);
console.log('after card tap, armed:', await armed(), 'hintbar:', await page.locator('.hintbar').count());
await page.screenshot({ path: 'shots/diag-armed.png' });

// tap own half (lower-middle of arena)
await page.touchscreen.tap(240, 620);
await page.waitForTimeout(1200);
console.log('after arena tap, energy:', await energy(), 'armed:', await armed());
await page.screenshot({ path: 'shots/diag-placed.png' });

// check units on field via canvas? use HUD unitCount through evaluate on window snapshot if exposed
const exposed = await page.evaluate(() => Object.keys(window).filter((k) => /battle|sim|game/i.test(k)));
console.log('window keys:', JSON.stringify(exposed));
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
