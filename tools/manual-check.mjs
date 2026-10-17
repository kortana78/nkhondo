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
const hand = () => page.locator('.hand .gcard .gname').allTextContents();
const costs = () => page.evaluate(() => Array.from(document.querySelectorAll('.hand .gcard .gcost')).map((el) => el.textContent));
const energy = () => page.locator('.mphamvu b').first().textContent();
console.log('hand', JSON.stringify(await hand()), 'costs', JSON.stringify(await costs()), 'energy', await energy());
// wait for full energy to afford anything
await page.waitForTimeout(12000);
console.log('energy after wait', await energy(), 'hand', JSON.stringify(await hand()));
const rects = await page.evaluate(() => Array.from(document.querySelectorAll('.hand .gcard')).map((el) => { const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
// tap-tap: first affordable troop
const cs = (await costs()).map((c) => parseInt(c, 10));
const e0 = parseInt(await energy(), 10);
let idx = cs.findIndex((c) => c <= e0);
if (idx < 0) idx = 0;
console.log('tapping card', idx);
await page.mouse.click(rects[idx][0], rects[idx][1]);
await page.waitForTimeout(500);
console.log('armed', await page.locator('.hand .gcard.sel').count(), 'hintbar', await page.locator('.hintbar').count());
await page.mouse.click(240, 600);
await page.waitForTimeout(1000);
console.log('after tap-tap energy', await energy(), 'toast', await page.locator('.deploy-toast').count());
// invalid: tap enemy half (top) with a troop if affordable
await page.mouse.click(rects[idx][0], rects[idx][1]);
await page.waitForTimeout(400);
await page.mouse.click(240, 200);
await page.waitForTimeout(800);
console.log('after invalid tap toast', await page.locator('.deploy-toast').count(), 'text', JSON.stringify(await page.locator('.deploy-toast').allTextContents().catch(() => [])));
// drag: affordable card to arena
await page.waitForTimeout(6000);
console.log('energy before drag', await energy(), 'costs', JSON.stringify(await costs()));
const cs2 = (await costs()).map((c) => parseInt(c, 10));
const e1 = parseInt(await energy(), 10);
const idx2 = cs2.findIndex((c) => c <= e1);
if (idx2 >= 0) {
  await page.mouse.move(rects[idx2][0], rects[idx2][1]);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.move(240, 550, { steps: 12 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(1000);
  console.log('after drag energy', await energy(), 'toast', await page.locator('.deploy-toast').count());
} else console.log('no affordable card for drag, skipped');
// combat floaters: spawn two opposing forces via autoplay? empty=1 has no AI, so force a fight by deploying twice and waiting
await page.waitForTimeout(3000);
console.log('floaters visible', await page.locator('.floater').count());
// debug overlay via F1
await page.keyboard.press('F1');
await page.waitForTimeout(600);
console.log('debug visible', await page.evaluate(() => document.body.innerText.includes('DEBUG') ? 1 : 0));
const dbg = await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll('div')).find((d) => d.textContent?.includes('DEBUG (F1'));
  return el ? el.textContent.slice(0, 500) : 'NOT FOUND';
});
console.log('debug text:', JSON.stringify(dbg));
await browser.close();
