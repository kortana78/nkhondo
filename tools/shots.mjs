import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 480, height: 900 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });

await page.goto('http://127.0.0.1:4173/', { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/title.png' });

await page.goto('http://127.0.0.1:4173/?s=battle&autoplay=1', { waitUntil: 'networkidle' });
await page.waitForTimeout(20000);
await page.screenshot({ path: 'shots/battle-early.png' });
await page.waitForTimeout(50000);
await page.screenshot({ path: 'shots/battle-mid.png' });

const webgl2 = await page.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
const fps = await page.evaluate(() => new Promise((res) => {
  let n = 0;
  const t0 = performance.now();
  const loop = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(loop); else res((n / (performance.now() - t0)) * 1000); };
  requestAnimationFrame(loop);
}));
console.log('webgl2:', webgl2);
console.log('rAF fps (swiftshader):', Math.round(fps));
console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
