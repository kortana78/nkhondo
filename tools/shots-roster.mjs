// Roster screenshots: card list + staged mid-battle moments.
// Usage: npm run build && (vite preview --port 4173 &) && node tools/shots-roster.mjs
import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 600, height: 1000 } });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300)); });
// no external network in this sandbox: block webfonts (fall back to system)
await page.route('**://fonts.googleapis.com/**', (r) => r.abort());
await page.route('**://fonts.gstatic.com/**', (r) => r.abort());
// silence the first-run coach/tutorial overlays for clean shots
await page.addInitScript(() => {
  try {
    localStorage.setItem('nkhondo:coach', '1');
    localStorage.setItem('nkhondo:tutorial', 'skipped');
  } catch { /* noop */ }
});

async function deploy(team, card, x, z) {
  return page.evaluate(([tm, c, px, pz]) => {
    const api = window.__nkhondo;
    const b = api?.battle;
    if (!b) return 'no-battle';
    b.energy[tm] = 10;
    if (!b.hands[tm].includes(c)) b.hands[tm][0] = c;
    return b.deploy(tm, c, px, pz) ? 'ok' : 'fail:' + JSON.stringify(b.canDeploy(tm, c, px, pz));
  }, [team, card, x, z]);
}
async function silenceTowers() {
  await page.evaluate(() => {
    const b = window.__nkhondo?.battle;
    if (b) for (const tw of b.towers) tw.cooldown = 99999;
  });
}

// ---- 1. card list + detail ----
await page.goto('http://localhost:4173/', { waitUntil: 'load', timeout: 60000 });
await page.waitForTimeout(2500);
await page.mouse.click(240, 450); // title -> home
await page.waitForTimeout(800);
// dismiss the first-run tutorial offer if present
const skip = page.getByText('Skip', { exact: true });
if (await skip.count() > 0) await skip.first().click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(400);
await page.getByText('Cards', { exact: true }).click();
await page.waitForTimeout(800);
await shot('shots/cards-list.png');
// open the first troop detail (Mfiti row)
await page.locator('.card-detail .lib-head').first().click();
await page.waitForTimeout(600);
await shot('shots/card-detail.png');

// ---- 2. staged battles (empty arena, scripted deploys) ----
await page.evaluate(() => localStorage.setItem('nkhondo:coach', '1'));
async function freshBattle() {
  await page.goto('http://localhost:4173/?s=battle&empty=1', { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(3500);
  await silenceTowers();
}
await freshBattle();

async function stage(subs, x, z, spread = 600) {
  // gather units into a pinned diorama: positions set, speed 0 (they still
  // fight in range, but never march out of frame)
  const n = await page.evaluate(([list, px, pz, sp]) => {
    const b = window.__nkhondo?.battle;
    if (!b) return 'no-battle';
    const units = b.units.filter((u) => u.alive && list.includes(u.owner + ':' + u.sub));
    units.forEach((u, i) => {
      u.x = Math.round(px + (i - (units.length - 1) / 2) * sp);
      u.z = Math.round(pz + (i % 3) * 550 - 550);
      u.speed = 0;
      u.targetKind = 0; u.targetId = -1;
    });
    return `pinned=${units.length} all=[${b.units.map((u) => `${u.owner}:${u.sub}@(${(u.x / 1000).toFixed(1)},${(u.z / 1000).toFixed(1)})hp${Math.round(u.hp)}${u.alive ? '' : 'X'}`).join(' ')}]`;
  }, [subs, Math.round(x * 1000), Math.round(z * 1000), spread]);
  console.log('stage', subs.join('+'), '->', n);
}

// Mfiti + owls: witch off-center (clear of the chief house), a tough Mlonda
// victim pinned adjacent (hyenas die too fast for photos); shot just after
// the 6s owl summon
async function shot(path) {
  try {
    await page.screenshot({ path, timeout: 20000 });
  } catch {
    await page.waitForTimeout(2000);
    await page.screenshot({ path, timeout: 20000 });
  }
}
async function tick() {
  return page.evaluate(() => window.__nkhondo?.battle.tick ?? -1);
}
async function waitTicks(n) {
  const t0 = await tick();
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(500);
    if ((await tick()) - t0 >= n) return;
  }
}

console.log('mfiti:', await deploy(0, 'mfiti', 5, 9));
console.log('foe:', await deploy(1, 'mlonda', 13.9, 20));
await stage(['0:witch', '1:guard'], 5, 9.5, 1200);
await waitTicks(135); // just past the 6s owl summon, in sim time
await shot('shots/battle-mfiti.png');

// Njuchi swarm: fresh battle, bees vs one pinned guard
await freshBattle();
console.log('njuchi:', await deploy(0, 'njuchi', 5, 9));
console.log('foe:', await deploy(1, 'mlonda', 13.9, 20));
await stage(['0:bee', '1:guard'], 5, 9.5, 700);
await waitTicks(45);
await shot('shots/battle-njuchi.png');

// Zikwanje sweep: fresh battle, pangas + guard pinned like the calibration
// pair (proven legible); burst shots to catch the 0.9s swoosh arc mid-swing
await freshBattle();
console.log('zik:', await deploy(0, 'zikwanje', 5, 9));
console.log('foe:', await deploy(1, 'mlonda', 13.9, 20));
await stage(['0:panga', '1:guard'], 5, 9.5, 1200);
await waitTicks(20);
await shot('shots/battle-zikwanje.png');
await page.waitForTimeout(700);
await shot('shots/battle-zikwanje2.png');
await page.waitForTimeout(700);
await shot('shots/battle-zikwanje3.png');
await page.waitForTimeout(700);
await shot('shots/battle-zikwanje4.png');

// Mphezi strike: fresh battle, tank pinned mid-screen, bolt flash then scorch
await freshBattle();
console.log('bolt-foe:', await deploy(1, 'mlonda', 13.9, 20));
await page.evaluate(() => {
  const b = window.__nkhondo?.battle;
  const m = b?.units.find((u) => u.owner === 1 && u.card === 'mlonda' && u.hp > 1500);
  if (m) { m.x = 9000; m.z = 12500; m.speed = 0; }
});
console.log('mphezi:', await deploy(0, 'mphezi', 9, 12.5));
await page.waitForTimeout(450);
await shot('shots/battle-mphezi.png');
await page.waitForTimeout(1800);
await shot('shots/battle-mphezi2.png');

console.log('errors(' + errors.length + '):');
for (const e of errors.slice(0, 20)) console.log('  ' + e);
await browser.close();
