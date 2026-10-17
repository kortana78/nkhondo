import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

// deck screen with 11 real card icons
await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.mouse.click(240, 450);
await page.waitForTimeout(800);
await page.locator('.menu-card').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/deck-og.png' });

// msika autoplay battle
await page.goto('http://127.0.0.1:4173/?s=battle&autoplay=1&arena=msika', { waitUntil: 'networkidle' });
await page.waitForTimeout(35000);
await page.screenshot({ path: 'shots/msika-battle.png' });
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
