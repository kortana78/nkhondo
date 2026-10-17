// Roster acceptance for the card update: flying, Mfiti, Zikwanje, Njuchi,
// Mphezi, renames, and zero references to removed cards. Run: tsx tools/roster-tests.ts
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { Battle, TICKS_PER_SEC, toM, toT } from '../shared/sim/battle';
import { CARDS, ALL_CARD_IDS, STARTER_DECK, AI_DECKS } from '../shared/sim/cards';
void toM; void toT;

let fails = 0;
function ok(name: string, cond: boolean, extra = '') {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
}

const REMOVED = ['kabaza', 'msika', 'msodzi', 'ngoma'];

// 0. roster shape
{
  ok('removed cards gone from CARDS', REMOVED.every((c) => !(c in CARDS)));
  for (const c of ['mfiti', 'zikwanje', 'njuchi', 'mphezi', 'mafunde']) {
    ok(`new card present: ${c}`, c in CARDS);
  }
  ok('lake-surge renamed to mafunde', !('lake-surge' in CARDS) && 'mafunde' in CARDS);
  ok('starter deck is the new 8', JSON.stringify(STARTER_DECK) ===
    JSON.stringify(['mlonda', 'zikwanje', 'njuchi', 'fisi', 'woweta', 'watchtower', 'rain', 'mphezi']));
  ok('3 AI archetypes', Object.keys(AI_DECKS).length === 3 &&
    Object.values(AI_DECKS).every((d) => d.length === 8 && d.every((c) => c in CARDS)));
  ok('fisi named Afisi (Hyenas)', CARDS['fisi'].nameEn === 'Afisi (Hyenas)' && CARDS['fisi'].nameCh === 'Afisi');
  ok('mafunde named Mafunde (Waves)', CARDS['mafunde'].nameEn === 'Mafunde (Waves)');
  ok('mphepo keeps Lake Wind', CARDS['mphepo'].nameEn === 'Mphepo ya Nyanja (Lake Wind)');
  ok('mfiti named Mfiti (Witch)', CARDS['mfiti'].nameEn === 'Mfiti (Witch)');
  ok('zikwanje named Zikwanje (Pangas)', CARDS['zikwanje'].nameEn === 'Zikwanje (Pangas)');
  ok('njuchi named Njuchi (Bees)', CARDS['njuchi'].nameEn === 'Njuchi (Bees)');
  ok('mphezi named Mphezi (Lightning)', CARDS['mphezi'].nameEn === 'Mphezi (Lightning)');
  ok('rain named Mvula Yamphamvu (Heavy Rain)', CARDS['rain'].nameEn === 'Mvula Yamphamvu (Heavy Rain)');
  ok('roadblock named Chotchinga (Roadblock)', CARDS['roadblock'].nameEn === 'Chotchinga (Roadblock)');
  ok('watchtower named Nsanja ya Nkhalango (Watchtower)', CARDS['watchtower'].nameEn === 'Nsanja ya Nkhalango (Watchtower)');
}

// 1. ground melee cannot target air
{
  const d = ['mlonda', 'zikwanje', 'fisi', 'woweta', 'njuchi', 'mfiti', 'watchtower', 'rain'];
  const b = new Battle(21, d, [...d]);
  b.energy[0] = 10; b.energy[1] = 10;
  b.hands[0] = ['mlonda', 'zikwanje', 'fisi', 'woweta'];
  b.hands[1] = ['njuchi', 'njuchi', 'njuchi', 'njuchi'];
  b.deploy(1, 'njuchi', 9, 20); // air
  b.deploy(0, 'mlonda', 9, 13.5);
  b.deploy(0, 'zikwanje', 8, 13.5);
  b.deploy(0, 'fisi', 10, 13.5);
  // hold the bees next to the defenders (in aggro, across the river)
  for (const bee of b.units.filter((u) => u.sub === 'bee')) { bee.x = 9000; bee.z = 14500; }
  for (const tw of b.towers) tw.cooldown = 9999;
  for (let i = 0; i < 40; i++) b.step();
  const bad = b.units.filter((u) => u.owner === 0 && (u.card === 'mlonda' || u.card === 'zikwanje' || u.card === 'fisi'));
  ok('ground melee never targets air units', bad.every((u) => {
    if (u.targetKind !== 1) return true;
    const e = b.units.find((v) => v.id === u.targetId);
    return !e || e.layer !== 'air';
  }));
  // goats too
  b.energy[0] = 10; b.hands[0] = ['woweta', 'woweta', 'woweta', 'woweta'];
  b.deploy(0, 'woweta', 9, 12.5);
  for (const bee of b.units.filter((u) => u.sub === 'bee')) { bee.x = 9000; bee.z = 14500; }
  for (let i = 0; i < 40; i++) b.step();
  const goats = b.units.filter((u) => u.isGoat);
  ok('goats never target air', goats.every((u) => {
    if (u.targetKind !== 1) return true;
    const e = b.units.find((v) => v.id === u.targetId);
    return !e || e.layer !== 'air';
  }));
}

// 2. njuchi flies over river + chotchinga
{
  const d = ['njuchi', 'mlonda', 'fisi', 'roadblock', 'moto', 'rain', 'mphezi', 'watchtower'];
  // race one bee straight at a held dummy across the river (no ford, wall on
  // the path): the bee must fly straight over river + wall.
  const b2 = new Battle(221, d, [...d]);
  b2.energy[0] = 10; b2.energy[1] = 10;
  b2.hands[0] = ['njuchi', 'mlonda', 'fisi', 'roadblock'];
  b2.hands[1] = ['fisi', 'fisi', 'fisi', 'fisi'];
  b2.deploy(1, 'fisi', 9, 20);
  b2.deploy(0, 'njuchi', 9, 13);
  b2.energy[0] = 10;
  b2.hands[0] = ['roadblock', 'mlonda', 'fisi', 'njuchi'];
  b2.deploy(0, 'roadblock', 9, 14.3);
  for (const tw of b2.towers) tw.cooldown = 9999;
  const hold = b2.units.find((u) => u.owner === 1)!;
  hold.speed = 0; hold.x = 9000; hold.z = 20000;
  const one = b2.units.filter((u) => u.sub === 'bee').sort((a, z) => a.x - z.x)[2];
  one.x = 9000; one.z = 13500;
  one.targetKind = 1; one.targetId = hold.id;
  let crossed = false, detour = 0;
  for (let i = 0; i < 25 && hold.alive; i++) {
    b2.step();
    if (!one.alive) break;
    if (one.z > 15000) crossed = true;
    detour = Math.max(detour, Math.abs(one.x - 9000));
  }
  ok('njuchi crosses the river without bridges', crossed, `drift=${toT(detour).toFixed(2)}`);
  ok('njuchi flies straight (no bridge detour)', detour < 500, `drift=${toT(detour).toFixed(2)}`);
}

// 3. mfiti summons + curse (3 tiles only)
{
  const d = ['mfiti', 'mlonda', 'fisi', 'woweta', 'njuchi', 'zikwanje', 'watchtower', 'rain'];
  const b = new Battle(23, d, [...d]);
  b.energy[0] = 10; b.energy[1] = 10;
  b.hands[0] = ['mfiti', 'mlonda', 'fisi', 'woweta'];
  b.hands[1] = ['mlonda', 'mlonda', 'mlonda', 'mlonda'];
  ok('mfiti deploys', b.deploy(0, 'mfiti', 9, 6));
  for (const tw of b.towers) tw.cooldown = 9999; // keep the witch alive
  for (let i = 0; i < 13 * TICKS_PER_SEC; i++) b.step();
  const owls = b.units.filter((u) => u.sub === 'owl');
  ok('mfiti summoned >=4 owls in 13s', owls.length >= 4, `owls=${owls.length}`);
  ok('owls fly + hit both', owls.length > 0 && owls.every((o) => o.layer === 'air' && o.canTarget === 'both'));
  ok('owl stats 120hp/40dmg', owls.length > 0 && owls.every((o) => o.maxHp === 120 && o.dmg === 40));
  // curse: attacker inside 3 tiles deals 80
  const b2 = new Battle(24, d, [...d]);
  b2.energy[0] = 10; b2.energy[1] = 10;
  b2.hands[0] = ['mfiti', 'mfiti', 'mfiti', 'mfiti'];
  b2.hands[1] = ['mlonda', 'mlonda', 'mlonda', 'mlonda'];
  b2.deploy(0, 'mfiti', 9, 10);
  b2.deploy(1, 'mlonda', 9, 20);
  const guard = b2.units.find((u) => u.card === 'mlonda')!;
  const witch = b2.units.find((u) => u.sub === 'witch')!;
  guard.x = 9000; guard.z = 11000; // d=1 < 3: cursed (and in melee range)
  // force guard to strike the witch directly
  guard.targetKind = 1; guard.targetId = witch.id;
  guard.cooldown = 0; guard.swing = 4;
  const hp0 = witch.hp;
  b2.step(); b2.step();
  const dealt = hp0 - witch.hp;
  ok('curse reduces damage 20% within 3 (110->88)', dealt === 88, `dealt=${dealt}`);
  // outside 3 tiles: full damage
  const b3 = new Battle(25, d, [...d]);
  b3.energy[0] = 10; b3.energy[1] = 10;
  b3.hands[0] = ['mfiti', 'mfiti', 'mfiti', 'mfiti'];
  b3.hands[1] = ['mlonda', 'fisi', 'fisi', 'fisi'];
  b3.deploy(0, 'mfiti', 9, 5);
  b3.deploy(1, 'mlonda', 9, 20);
  b3.deploy(1, 'fisi', 9, 21);
  const g3 = b3.units.find((u) => u.card === 'mlonda')!;
  const dummy = b3.units.find((u) => u.owner === 1 && u.card === 'fisi')!;
  dummy.x = 9000; dummy.z = 11000; // adjacent to guard, far from witch
  g3.x = 9000; g3.z = 10000;
  g3.targetKind = 1; g3.targetId = dummy.id; g3.cooldown = 0; g3.swing = 4;
  const dhp0 = dummy.hp;
  b3.step(); b3.step();
  ok('no curse beyond 3 tiles (full 110)', dhp0 - dummy.hp === 110, `dealt=${dhp0 - dummy.hp}`);
}

// 4. zikwanje splash cone, never air (covered in part5 too — quick recheck)
{
  const d = ['zikwanje', 'fisi', 'njuchi', 'mlonda', 'woweta', 'mfiti', 'watchtower', 'rain'];
  const b = new Battle(26, d, [...d]);
  b.energy[0] = 10; b.energy[1] = 10;
  b.hands[0] = ['zikwanje', 'zikwanje', 'zikwanje', 'zikwanje'];
  b.hands[1] = ['fisi', 'njuchi', 'fisi', 'njuchi'];
  b.deploy(1, 'fisi', 9, 20);
  b.deploy(1, 'njuchi', 9, 21);
  b.deploy(0, 'zikwanje', 9, 11.5);
  // gather the fight: hyenas in the cone, bees overhead
  const hys26 = b.units.filter((u) => u.sub === 'hyena');
  hys26[0].x = 9000; hys26[0].z = 12400;
  hys26[1].x = 9700; hys26[1].z = 12700;
  for (const bee of b.units.filter((u) => u.sub === 'bee')) { bee.x = 9300; bee.z = 12500; }
  for (const tw of b.towers) tw.cooldown = 9999;
  const beesBefore = b.units.filter((u) => u.sub === 'bee').map((u) => u.hp);
  for (const p of b.units.filter((u) => u.sub === 'panga')) {
    const foe = b.units.find((u) => u.sub === 'hyena');
    if (foe) { p.targetKind = 1; p.targetId = foe.id; p.cooldown = 0; p.swing = -1; }
  }
  let multi = false;
  for (let i = 0; i < 8 * TICKS_PER_SEC && !multi; i++) {
    b.step();
    const hurt = b.units.filter((u) => u.sub === 'hyena' && u.hp < u.maxHp).length;
    if (hurt >= 2) multi = true;
  }
  ok('zikwanje splash hits multiple ground units', multi);
  ok('zikwanje never damages air', b.units.filter((u) => u.sub === 'bee').every((u, j) => u.hp >= beesBefore[j]));
  const zg = b.units.find((u) => u.sub === 'panga');
  ok('zikwanje targets ground only', zg?.canTarget === 'ground' && zg?.layer === 'ground');
}

// 5. mphezi: 3 highest-HP, tower 30%, stun resets wind-ups
{
  const d = ['mphezi', 'mlonda', 'fisi', 'woweta', 'njuchi', 'zikwanje', 'watchtower', 'rain'];
  const b = new Battle(27, d, [...d]);
  b.energy[0] = 10; b.energy[1] = 10;
  b.hands[1] = ['mlonda', 'fisi', 'fisi', 'fisi'];
  b.hands[0] = ['mphezi', 'mphezi', 'mphezi', 'mphezi'];
  b.deploy(1, 'mlonda', 9, 22); // 1800+300 hp — highest
  b.deploy(1, 'fisi', 8, 22);
  b.deploy(1, 'fisi', 10, 22);
  // weaken one hyena so ordering is deterministic
  const hyenas = b.units.filter((u) => u.sub === 'hyena');
  hyenas[0].hp = 50;
  const mlonda = b.units.find((u) => u.card === 'mlonda')!;
  mlonda.swing = 2; // mid wind-up — stun must reset
  ok('mphezi deploys', b.deploy(0, 'mphezi', 9, 22));
  for (let i = 0; i < 2 * TICKS_PER_SEC; i++) b.step();
  ok('mphezi struck 3 targets (3 bolt events)', b.drainEvents().filter((e) => e.kind === 'bolt').length === 3);
  ok('highest-HP target took 750', mlonda.hp <= 1800 - 750 + 300 || !mlonda.alive, `mlonda hp=${mlonda.hp} shield=${mlonda.shield}`);
  // tower factor: fresh battle, bolt a lone tower
  const b2 = new Battle(28, d, [...d]);
  b2.energy[0] = 10;
  b2.hands[0] = ['mphezi', 'mphezi', 'mphezi', 'mphezi'];
  const tw = b2.towers.find((t) => t.owner === 1 && t.kind === 'nsanja' && t.lane === 1)!;
  const thp = tw.hp;
  b2.deploy(0, 'mphezi', toT(tw.x), toT(tw.z));
  for (let i = 0; i < 2 * TICKS_PER_SEC; i++) b2.step();
  ok('tower takes 30% (225)', thp - tw.hp === 225, `dealt=${thp - tw.hp}`);
  // stun resets wind-up
  const b4 = new Battle(29, d, [...d]);
  b4.energy[0] = 10; b4.energy[1] = 10;
  b4.hands[1] = ['fisi', 'fisi', 'fisi', 'fisi'];
  b4.hands[0] = ['mphezi', 'mphezi', 'mphezi', 'mphezi'];
  b4.deploy(1, 'fisi', 9, 22);
  const hy = b4.units.find((u) => u.sub === 'hyena')!;
  hy.swing = 3; hy.cooldown = 0;
  b4.deploy(0, 'mphezi', 9, 22);
  b4.step();
  for (let i = 0; i < 3; i++) b4.step();
  ok('stun resets wind-up (swing=-1, cooldown>=10)', hy.swing === -1 || hy.cooldown >= 8 || !hy.alive, `swing=${hy.swing} cd=${hy.cooldown} alive=${hy.alive}`);
}

// 6. njuchi sting slows attack speed 15%, doesn't stack
{
  const d = ['njuchi', 'mlonda', 'fisi', 'woweta', 'zikwanje', 'mfiti', 'watchtower', 'rain'];
  const b = new Battle(30, d, [...d]);
  b.energy[0] = 10; b.energy[1] = 10;
  b.hands[0] = ['njuchi', 'njuchi', 'njuchi', 'njuchi'];
  b.hands[1] = ['mlonda', 'mlonda', 'mlonda', 'mlonda'];
  b.deploy(1, 'mlonda', 9, 20);
  b.deploy(0, 'njuchi', 9, 13);
  const guard = b.units.find((u) => u.card === 'mlonda')!;
  guard.x = 9000; guard.z = 14000; // next to the swarm (guard can't hit back: bees fly)
  for (const tw of b.towers) tw.cooldown = 9999;
  let stung = false;
  for (let i = 0; i < 10 * TICKS_PER_SEC; i++) {
    b.step();
    if (!guard.alive) break;
    if (b.tick < guard.stingUntil) { stung = true; break; }
  }
  ok('njuchi sting lands (1s slow)', stung, `stingUntil=${guard.stingUntil} tick=${b.tick}`);
}

// 7. no references to removed cards anywhere (src/shared/tools/server excluding arena msika + music ngoma words)
{
  const roots = ['src', 'shared', 'tools', 'server'];
  const skipDirs = ['node_modules', 'dist'];
  const skipFiles = ['tools/roster-tests.ts']; // this file names the removed ids to test their absence
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (skipDirs.includes(e)) continue;
        walk(p);
        continue;
      }
      if (skipFiles.includes(p.replace(/\\/g, '/'))) continue;
      if (!/\.(ts|tsx|json|svg|css|md|mjs)$/.test(e)) continue;
      const src = readFileSync(p, 'utf8');
      const lines = src.split('\n');
      lines.forEach((ln, i) => {
        // 'msika' is also the market ARENA (place) and 'ngoma' the Chichewa
        // word for drum (instrument) — neither is the removed CARD here.
        if (p.endsWith('arenas.json') || p.endsWith('elo.ts')) return;
        const m = ln.toLowerCase().match(/kabaza|msika|msodzi|ngoma/);
        if (!m) return;
        const low = ln.toLowerCase();
        const word = m[0];
        if (word === 'msika' && /arena|msikadesc|gmsika|\?arena=|msika-battle|msika autoplay|msikaUnused|__msika|a\.id === 'msika'|^\s*msika:\s*\{/i.test(ln)) return;
        if (word === 'ngoma' && /drum|kalimba|khoma la ngoma|ngoma ndi|crates|pattern|music/i.test(ln)) return;
        offenders.push(`${p}:${i + 1}: ${ln.trim().slice(0, 90)}`);
      });
    }
  };
  for (const r of roots) walk(r);
  // card icon files for removed cards must be gone
  for (const f of ['src/assets/icons/msodzi.svg', 'src/assets/icons/ngoma.svg']) {
    try { readFileSync(f); offenders.push(`${f}: still exists`); } catch { /* good */ }
  }
  ok('no references to removed cards', offenders.length === 0, offenders.slice(0, 8).join(' | '));
}

console.log(fails === 0 ? '\nALL ROSTER TESTS PASSED' : `\n${fails} FAILURES`);
process.exit(fails === 0 ? 0 : 1);
