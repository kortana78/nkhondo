import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
await page.route('**://fonts.googleapis.com/**', r => r.abort());
await page.route('**://fonts.gstatic.com/**', r => r.abort());
page.on('pageerror', e => console.log('PAGEERROR:' + e.message));
await page.goto('http://127.0.0.1:4173/?s=battle&empty=1', { waitUntil: 'commit', timeout: 15000 });
await page.waitForTimeout(5000);
for (let i = 0; i < 3; i++) {
  const btn = page.locator('.coach-card .btn');
  if (await btn.count()) { await btn.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(300); }
}
const energy = () => page.locator('.mphamvu b').first().textContent();
console.log('e0', await energy());
const rects = await page.evaluate(() => Array.from(document.querySelectorAll('.hand .gcard')).map(el => { const r = el.getBoundingClientRect(); return [r.x + r.width/2, r.y + r.height/2]; }));
console.log('rects', JSON.stringify(rects));
await page.mouse.click(rects[0][0], rects[0][1]);
await page.waitForTimeout(500);
console.log('armed after card click', await page.locator('.hand .gcard.sel').count());
await page.mouse.click(240, 600);
await page.waitForTimeout(1000);
console.log('after arena click energy', await energy(), 'armed', await page.locator('.hand .gcard.sel').count());
await page.mouse.move(rects[1][0], rects[1][1]);
await page.mouse.down();
await page.waitForTimeout(200);
await page.mouse.move(240, 550, { steps: 10 });
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(1000);
console.log('after drag energy', await energy());
await browser.close();
