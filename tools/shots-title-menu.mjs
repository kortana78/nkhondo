// Title + menu screenshots at 1920x1080, 1366x768, 390x844.
// Self-contained: serves dist/ in-process, no detached servers.
// Usage: node tools/shots-title-menu.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd() + '/dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  try {
    const p = new URL(req.url, 'http://x').pathname;
    const file = p === '/' || p === '/index.html' ? '/index.html' : p;
    const data = await readFile(join(ROOT, file));
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    try {
      const data = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const BASE = `http://127.0.0.1:${port}/`;
console.log('serving', BASE);

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };

for (const [w, h] of [[1920, 1080], [1366, 768], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => errors.push(`PAGEERROR ${w}: ` + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`CONSOLE ${w}: ` + m.text().slice(0, 200)); });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('.title-logo', { timeout: 20000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/title-${w}.png` });
  const titleText = await page.evaluate(() => document.body.innerText);
  ok(`title ${w}: no tagline`, !titleText.includes("Nkhondo ya m'mudzi") && !titleText.includes('Battle for the village'));
  ok(`title ${w}: no em/en dashes`, !/[—–]/.test(titleText), 'found dash');
  ok(`title ${w}: footer version line`, titleText.includes('v0.9.0'));
  await page.locator('.title-screen .btn.big').first().click();
  await page.waitForSelector('.menu-container', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/menu-${w}.png` });
  const menuText = await page.evaluate(() => document.body.innerText);
  ok(`menu ${w}: no em/en dashes`, !/[—–]/.test(menuText), 'found dash');
  ok(`menu ${w}: no players-online placeholder`, !menuText.includes('players online'));
  const tiles = await page.locator('.menu-grid .menu-card').count();
  ok(`menu ${w}: 4 equal tiles`, tiles === 4, `count=${tiles}`);
  await page.close();
}
ok('zero console/page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
server.close();
console.log(fails === 0 ? 'TITLE/MENU SHOTS PASSED' : `${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
