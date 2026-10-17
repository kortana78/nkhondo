import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = process.cwd() + '/dist';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  let p = '?';
  try {
    p = new URL(req.url, 'http://x').pathname;
    console.log('REQ ' + p);
    const file = p === '/' || p === '/index.html' ? '/index.html' : p;
    const data = await readFile(join(ROOT, file));
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch (e) {
    console.log('READFAIL ' + p + ' :: ' + e.message);
    try {
      const data = await readFile(join(ROOT, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    } catch { res.writeHead(404); res.end(); }
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;
console.log('SRV ' + BASE);
{
  const idx = await fetch(BASE).then((r) => r.text());
  console.log('fetch / bytes=' + idx.length + ' hasModule=' + idx.includes('type="module"'));
  const src = idx.match(/src="([^"]+)"/g);
  console.log('scripts: ' + JSON.stringify(src));
  if (src) {
    for (const s of src.slice(0, 2)) {
      const u = s.slice(5, -1);
      const r = await fetch(BASE.slice(0, -1) + u);
      console.log(`fetch ${u} -> ${r.status} ${r.headers.get('content-type')} bytes=${(await r.arrayBuffer()).byteLength}`);
    }
  }
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0, 400)));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text().slice(0, 300)); });
await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(8000);
console.log('body classes:', await page.evaluate(() => document.querySelector('.app')?.className));
console.log('body text:', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0, 400)));
await page.screenshot({ path: 'shots/debug-boot.png' });
await browser.close();
server.close();
