import { chromium } from 'playwright';

// AFTER pass: empty arena (mobile + desktop w/ side panels), mid-battle, tower-fall burst.
const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });

async function dismissCoach(page) {
  for (let i = 0; i < 3; i++) {
    const btn = page.locator('.coach-card .btn');
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(300); }
  }
}

// 1. empty arena, mobile
{
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:4173/?s=battle&empty=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await dismissCoach(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/after-empty.png' });
  await page.close();
}

// 2. empty arena, desktop (side panels)
{
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:4173/?s=battle&empty=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await dismissCoach(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'shots/after-desktop.png' });
  await page.close();
}

// 3+4. autoplay: mid-battle + tower-fall burst
{
  const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
  await page.goto('http://127.0.0.1:4173/?s=battle&autoplay=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(55000);
  await page.screenshot({ path: 'shots/after-mid.png' });
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(15000);
    await page.screenshot({ path: `shots/after-fall-${i}.png` });
  }
  await page.close();
}
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
