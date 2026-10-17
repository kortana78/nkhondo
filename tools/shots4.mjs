import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

await page.goto('http://127.0.0.1:4173/?s=battle&autoplay=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(45000);
await page.screenshot({ path: 'shots/feedback.png' });
const nFloaters = await page.locator('.floater').count();
const mom = await page.locator('.momentum span').first().textContent().catch(() => null);
console.log('floaters visible:', nFloaters, '| momentum:', mom);
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
