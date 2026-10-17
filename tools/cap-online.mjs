import { chromium } from 'playwright';
const OUT = 'C:/Users/MASAUTSO KAIMFA/AppData/Local/Temp/opencode/';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--mute-audio'] });
async function newPage() {
  const pg = await browser.newPage({ viewport: { width: 480, height: 900 } });
  await pg.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await pg.route('https://fonts.gstatic.com/**', (r) => r.abort());
  return pg;
}
const shot = (pg, n) => pg.screenshot({ path: OUT + n, timeout: 15000 });

// 1. name entry + register + home with online panel
{
  const pg = await newPage();
  await pg.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await pg.waitForTimeout(2500);
  await pg.mouse.click(240, 450);
  await pg.waitForTimeout(1500);
  await shot(pg, 'o2-nameentry.png');
  await pg.locator('.nameinput').fill('Tester');
  await pg.locator('button.btn.big').click();
  await pg.waitForTimeout(1500);
  await shot(pg, 'o3-recovery.png');
  await pg.locator('button.btn.big').click();
  await pg.waitForTimeout(1500);
  await shot(pg, 'o1-home.png');
  await pg.close();
}
// 2. leaderboard (fresh registered user via storage copy is complex; use API directly then screenshot with token)
{
  const pg = await newPage();
  await pg.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await pg.waitForTimeout(1500);
  const reg = await pg.evaluate(async () => {
    const r = await fetch('http://127.0.0.1:18778/api/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Shoti' }),
    });
    const j = await r.json();
    try { localStorage.setItem('nkhondo:token', j.token); } catch {}
    return j;
  });
  console.log('registered', reg.name, reg.tag);
  await pg.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await pg.waitForTimeout(2500);
  await pg.mouse.click(240, 450);
  await pg.waitForTimeout(1500);
  // dismiss first-launch tutorial offer if present
  await pg.getByRole('button', { name: 'Skip', exact: true }).click({ timeout: 4000 }).catch(() => {});
  await pg.waitForTimeout(600);
  await pg.getByRole('button', { name: 'Leaderboard' }).click();
  await pg.waitForTimeout(1500);
  await shot(pg, 'o4-leaderboard.png');
  await pg.close();
}
// 3. two tabs queue -> match -> real tap deploys -> battle shot
{
  const mk = async (name) => {
    const pg = await newPage();
    await pg.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await pg.waitForTimeout(1000);
    await pg.evaluate(async (nm) => {
      const r = await fetch('http://127.0.0.1:18778/api/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: nm }),
      });
      const j = await r.json();
      try { localStorage.setItem('nkhondo:token', j.token); } catch {}
    }, name);
    await pg.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded', timeout: 20000 });
    await pg.waitForTimeout(2000);
    await pg.mouse.click(240, 450);
    await pg.waitForTimeout(1200);
    await pg.getByRole('button', { name: 'Skip', exact: true }).click({ timeout: 4000 }).catch(() => {});
    await pg.waitForTimeout(600);
    return pg;
  };
  const pgA = await mk('AlphaA');
  const pgB = await mk('BetaBB');
  await pgA.getByRole('button', { name: 'Ranked battle' }).click();
  await pgB.getByRole('button', { name: 'Ranked battle' }).click();
  await pgA.waitForTimeout(1000);
  await pgA.screenshot({ path: OUT + 'o5-queue.png', timeout: 15000 });
  // wait for match start on both (countdown 3s)
  await pgA.waitForTimeout(9000);
  // tap-deploy: click first hand card, then own half on canvas
  const play = async (pg, cardIdx, cx, cy) => {
    await pg.locator('.hand .gcard').nth(cardIdx).click();
    await pg.waitForTimeout(600);
    await pg.mouse.click(cx, cy);
    await pg.waitForTimeout(800);
  };
  await play(pgA, 0, 200, 560);
  await play(pgB, 1, 280, 300);
  await play(pgA, 2, 150, 600);
  await pgA.waitForTimeout(6000);
  await shot(pgA, 'o6-online-battle.png');
  await pgB.close();
  await pgA.close();
}
await browser.close();
console.log('captured all');
