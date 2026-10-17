// Deterministic mirror sweep: full matches (to `over`, incl. sudden death)
// across many seeds, canonical + flipped-mirror hashes every 40 ticks.
// No wall-clock, no sockets: any DIFF here is a real sim/mirror bug.
// Run: npx tsx server/tests/sweep.ts [seeds] [maxTicks]
import { Battle, flipState, hashBattleState, deployRemote } from '../../shared/sim/battle.js';
import { STARTER_DECK, AI_DECKS } from '../../shared/sim/cards.js';
import type { DeployedMsg } from '../../shared/protocol.js';
import { MemoryDb } from '../src/db.js';
import { MatchRoom } from '../src/rooms.js';
import { hashRecoveryCode } from '../src/auth.js';

const NSEEDS = parseInt(process.argv[2] ?? '12', 10);
const MAXT = parseInt(process.argv[3] ?? '5200', 10);
const EVERY = process.env.NKHONDO_SWEEP_EVERY ? parseInt(process.env.NKHONDO_SWEEP_EVERY, 10) : 40;
const SEED0 = process.env.NKHONDO_SWEEP_SEED0 ? parseInt(process.env.NKHONDO_SWEEP_SEED0, 10) : 900000;
const db = new MemoryDb();
await db.migrate();

const DECKS = [STARTER_DECK, AI_DECKS.witchSwarm, AI_DECKS.tankSpells, AI_DECKS.fastCycle];
let failedRooms = 0;

for (let s = 0; s < NSEEDS; s++) {
  const seed = SEED0 + s;
  const mk = async (n: string) => db.createPlayer({ name: `${n}${s}`, tag: '0000', recoveryHash: await hashRecoveryCode('AAAA-BBBB-CCCC') });
  const ra = await mk('SweepA');
  const rb = await mk('SweepB');
  const d0 = DECKS[s % DECKS.length];
  const d1 = DECKS[(s + 1) % DECKS.length];
  const broadcasts: DeployedMsg[] = [];
  const fake = { send: (m: never) => {
    const d = m as unknown as { type: string };
    if (d.type === 'deployed') broadcasts.push({ ...(m as unknown as DeployedMsg) });
  } };
  const room = new MatchRoom(db, ra, rb, [...d0], [...d1], 50, {
    onEnd: () => undefined, onDesync: () => undefined, seed,
  });
  room.attach(ra.id, fake);
  room.attach(rb.id, fake);
  (room as unknown as { started: boolean }).started = true;

  const S = room.battle;
  const mA = new Battle(seed, [...d0], [...d1]);
  // slot-1 mirror simulates in the LOCAL frame (own deck first), exactly
  // like a real client (load.ts myDeck/foeDeck swap)
  const mB = new Battle(seed, [...d1], [...d0]);
  mB.mirrorZ = true;
  const dueA: DeployedMsg[] = [];
  const dueB: DeployedMsg[] = [];
  let seq = 1;
  const botPlay = (mirror: Battle, teamServer: 0 | 1, myId: string) => {
    for (const card of [...mirror.hands[0]].sort()) {
      const isSpell = ['rain', 'roadblock', 'harvest', 'mafunde', 'moto', 'mphepo', 'mphezi', 'makwerero'].includes(card);
      const x = 2 + ((seq * 37) % 140) / 10;
      const z = isSpell ? 10 + ((seq * 53) % 120) / 10 : 4 + ((seq * 29) % 90) / 10;
      if (mirror.canDeploy(0, card, x, z).ok) {
        const sz = teamServer === 0 ? z : 32 - z;
        (room.slots[0] as { lastDeployAt: number }).lastDeployAt = 0;
        (room.slots[1] as { lastDeployAt: number }).lastDeployAt = 0;
        room.submitDeploy(myId, card, x, sz, seq);
        seq++;
        return;
      }
    }
    seq++;
  };
  const drain = () => {
    for (const d of broadcasts.splice(0)) {
      dueA.push({ player: d.player, cardId: d.cardId, x: d.x, z: d.z, executeTick: d.executeTick, seq: d.seq });
      dueB.push({ player: (d.player === 1 ? 0 : 1) as 0 | 1, cardId: d.cardId, x: d.x, z: 32 - d.z, executeTick: d.executeTick, seq: d.seq });
    }
    dueA.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
    dueB.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
  };
  const feed = (m: Battle, due: DeployedMsg[], myTeam: 0 | 1) => {
    const now = due.filter((d) => d.executeTick <= m.tick);
    const rest = due.filter((d) => d.executeTick > m.tick);
    due.length = 0;
    due.push(...rest);
    for (const d of now) deployRemote(m, myTeam, d);
  };
  let diff: string | null = null;
  let t = 0;
  while (!S.over && t++ < MAXT) {
    drain();
    feed(mA, dueA, 0);
    feed(mB, dueB, 1);
    const dueS = room.pending
      .filter((p) => p.executeTick <= S.tick)
      .sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
    room.pending = room.pending.filter((p) => p.executeTick > S.tick);
    for (const d of dueS) S.deploy(d.player, d.cardId, d.x, d.z);
    S.step(); mA.step(); mB.step();
    if (S.tick % 150 === 0 && S.tick > 0) { botPlay(mA, 0, ra.id); botPlay(mB, 1, rb.id); }
    if (S.tick % EVERY === 0) {
      const st = S.getState();
      const aOk = hashBattleState(st, false) === mA.stateHash();
      const bOk = hashBattleState(flipState(st), true) === hashBattleState(mB.getState(), true);
      if (!bOk && !diff) {
        const fs = flipState(st);
        const ms = mB.getState();
        const fsu = [...fs.units].sort((a, b) => a.id - b.id);
        const msu = [...ms.units].sort((a, b) => a.id - b.id);
        const slotOf = (st8: { towers: { id: number; owner: 0 | 1; lane: number }[] }, tid: number, mirrored: boolean) => {
          const tw = st8.towers.find((t) => t.id === tid);
          if (!tw) return `dead:${tid}`;
          return `slot:${(mirrored ? 1 - tw.owner : tw.owner) * 3 + tw.lane}`;
        };
        if (fsu.length !== msu.length) diff = `tick=${S.tick} unit count: S=${fsu.length} B=${msu.length}`;
        if (S.nextId !== mB.nextId) diff = `tick=${S.tick} nextId: S=${S.nextId} B=${mB.nextId}`;
        for (const u of fsu) {
          const v = msu.find((w) => w.id === u.id);
          if (!v) { diff = `tick=${S.tick} unit ${u.id} missing on B`; break; }
          for (const k of ['owner', 'x', 'z', 'hp', 'shield', 'cooldown', 'swing', 'stingUntil', 'summonCd', 'whistleCd', 'walkPhase', 'expiresTick', 'targetKind', 'layer', 'canTarget', 'sub', 'card'] as const) {
            const a = k === 'walkPhase' ? Math.round(u[k] * 1000) : u[k];
            const b2 = k === 'walkPhase' ? Math.round((v[k] as number) * 1000) : v[k];
            if (a !== b2) { diff = `tick=${S.tick} unit ${u.id}.${k}: S=${a} B=${b2} | Su=${JSON.stringify(fsu.find((w) => w.id === u.id))} | Bu=${JSON.stringify(msu.find((w) => w.id === u.id))}`; break; }
          }
          if (diff) break;
          if (u.targetKind === 2) {
            const a = slotOf(fs, u.targetId, true);
            const b2 = slotOf(ms, v.targetId, true);
            if (a !== b2) { diff = `tick=${S.tick} unit ${u.id}.targetSlot: S=${a}(raw ${u.targetId}) B=${b2}(raw ${v.targetId})`; break; }
          } else if (u.targetId !== v.targetId) {
            diff = `tick=${S.tick} unit ${u.id}.targetId: S=${u.targetId} B=${v.targetId}`;
            break;
          }
        }
        if (!diff) {
          const fst = [...fs.towers].sort((a, b) => a.owner - b.owner || a.lane - b.lane);
          const mst = [...ms.towers].sort((a, b) => a.owner - b.owner || a.lane - b.lane);
          for (let i = 0; i < fst.length; i++) {
            for (const k of ['hp', 'alive', 'active', 'cooldown', 'swing', 'targetId'] as const) {
              if ((fst[i] as never)[k] !== (mst[i] as never)[k]) { diff = `tick=${S.tick} tower o${fst[i].owner}l${fst[i].lane}.${k}: S=${(fst[i] as never)[k]} B=${(mst[i] as never)[k]}`; break; }
            }
            if (diff) break;
          }
        }
        if (!diff) {
          if (S.tick !== mB.tick || S.over !== mB.over || (S.overTick ?? -1) !== (mB.overTick ?? -1)) {
            diff = `tick=${S.tick} SKEW: mB.tick=${mB.tick} S(over=${S.over},overTick=${S.overTick},w=${S.winner}) B(over=${mB.over},overTick=${mB.overTick},w=${mB.winner})`;
          } else {
            // flipState maps winner to local labels, so raw compare is valid
            const fe = JSON.stringify([fs.energy, fs.energyFrac, fs.hands, fs.queues, fs.fordUntil, fs.randA, fs.over, fs.winner, fs.suddenDeath]);
            const me = JSON.stringify([ms.energy, ms.energyFrac, ms.hands, ms.queues, ms.fordUntil, ms.randA, ms.over, ms.winner, ms.suddenDeath]);
            if (fe !== me) diff = `tick=${S.tick} meta: S=${fe} B=${me}`;
          }
        }
        if (!diff) {
          const fo = JSON.stringify(fs.obstacles);
          const mo = JSON.stringify(ms.obstacles);
          if (fo !== mo) diff = `tick=${S.tick} obstacles: S=${fo} B=${mo}`;
          const fr = JSON.stringify([fs.rains, fs.puddles, fs.strikes]);
          const mr = JSON.stringify([ms.strikes && ms.puddles ? ms.puddles : null, ms.puddles, ms.strikes]);
          void mr;
          const mr2 = JSON.stringify([ms.rains, ms.puddles, ms.strikes]);
          if (fr !== mr2) diff = `tick=${S.tick} zones: S=${fr} B=${mr2}`;
        }
      }
      if ((!aOk || !bOk) && !diff) {
        const show = (u: { id: number; owner: number; x: number; z: number; hp: number; cooldown: number; swing: number; targetKind: number; targetId: number }) =>
          `${u.id}:${u.owner}@${u.x},${u.z} hp${Math.round(u.hp)} cd${u.cooldown} sw${u.swing} t${u.targetKind}/${u.targetId}`;
        diff = `tick=${S.tick} A:${aOk ? 'OK' : 'DIFF'} B:${bOk ? 'OK' : 'DIFF'}\n` +
          `  S units: ${S.units.map(show).join(' | ')}\n` +
          `  B units: ${mB.units.map(show).join(' | ')}\n` +
          `  S e=${S.energy} ef=${S.energyFrac.map((v) => v.toFixed(3))} hands=${S.hands.map((h) => h.join('+')).join(' / ')} randA=${S.randA}\n` +
          `  B e=${mB.energy} ef=${mB.energyFrac.map((v) => v.toFixed(3))} hands=${mB.hands.map((h) => h.join('+')).join(' / ')} randA=${mB.randA}`;
      }
      if (!aOk || !bOk) break;
    }
  }
  if (diff) {
    failedRooms++;
    console.log(`seed ${seed} decks ${d0[0]}/${d1[0]} over=${S.over} w=${S.winner}\n${diff}`);
  } else {
    console.log(`seed ${seed} OK (over=${S.over} w=${S.winner} ticks=${S.tick})`);
  }
}
console.log(failedRooms === 0 ? `SWEEP PASSED (${NSEEDS} full matches)` : `${failedRooms} DIVERGED`);
process.exit(failedRooms === 0 ? 0 : 1);
