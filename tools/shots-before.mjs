import { chromium } from 'playwright';

// BEFORE pass: empty arena, mid-battle, tower-destruction burst.
const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

async function dismissCoach() {
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('.coach-card .btn');
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(300); }
  }
}

// 1. empty arena: no autoplay, shoot ASAP after canvas mounts
await page.goto('http://127.0.0.1:4173/?s=battle', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await dismissCoach();
await page.screenshot({ path: 'shots/before-empty.png' });

// 2+3. autoplay: mid-battle + tower-fall burst
await page.goto('http://127.0.0.1:4173/?s=battle&autoplay=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(55000);
await page.screenshot({ path: 'shots/before-mid.png' });
for (let i = 0; i < 10; i++) {
  await page.waitForTimeout(15000);
  await page.screenshot({ path: `shots/before-fall-${i}.png` });
}
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
