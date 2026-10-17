// Faithful live-conditions repro: room + 2 mirrors playing bot deploys.
import { Battle, flipState, hashBattleState, deployRemote } from '../../shared/sim/battle.js';
import { STARTER_DECK } from '../../shared/sim/cards.js';
import type { DeployedMsg } from '../../shared/protocol.js';
import { MemoryDb } from '../src/db.js';
import { MatchRoom } from '../src/rooms.js';
import { hashRecoveryCode } from '../src/auth.js';

const db = new MemoryDb();
await db.migrate();
const mk = async (n: string) => db.createPlayer({ name: n, tag: '0000', recoveryHash: await hashRecoveryCode('AAAA-BBBB-CCCC') });
const ra = await mk('Alice');
const rb = await mk('Bob');

const broadcasts: { player: 0 | 1; cardId: string; x: number; z: number; executeTick: number; seq: number }[] = [];
const fake = { send: (m: never) => {
  const d = m as { type: string };
  if (d.type === 'deployed') broadcasts.push({ ...(m as unknown as DeployedMsg) });
} };
const room = new MatchRoom(db, ra, rb, [...STARTER_DECK], [...STARTER_DECK], 50, {
  onEnd: () => undefined, onDesync: () => undefined, seed: Number(process.argv[2] ?? 424242),
});
room.attach(ra.id, fake);
room.attach(rb.id, fake);
// lockstep from tick 0: never start the room pump; flip the started gate
// directly (tsx does not enforce TS privates at runtime).
(room as unknown as { started: boolean }).started = true;

const S = room.battle;
const mA = new Battle(room.seed, [...STARTER_DECK], [...STARTER_DECK]);
const mB = new Battle(room.seed, [...STARTER_DECK], [...STARTER_DECK]);
mB.mirrorZ = true;
const dueA: DeployedMsg[] = [];
const dueB: DeployedMsg[] = [];
let seq = 1;

function botPlay(mirror: Battle, teamServer: 0 | 1, myId: string): void {
  for (const card of [...mirror.hands[0]].sort()) {
    const isSpell = ['rain', 'roadblock', 'harvest', 'mafunde', 'moto', 'mphepo', 'mphezi', 'makwerero'].includes(card);
    const x = 2 + ((seq * 37) % 140) / 10;
    const z = isSpell ? 10 + ((seq * 53) % 120) / 10 : 4 + ((seq * 29) % 90) / 10;
    if (mirror.canDeploy(0, card, x, z).ok) {
      // map local team 0 -> server team; lockstep loop runs in one
      // millisecond, so bypass the wall-clock rate gate deterministically
      const sx = x, sz = teamServer === 0 ? z : 32 - z;
      (room.slots[0] as { lastDeployAt: number }).lastDeployAt = 0;
      (room.slots[1] as { lastDeployAt: number }).lastDeployAt = 0;
      const ack = room.submitDeploy(myId, card, sx, sz, seq) as { type: string; x: number; z: number; reason: string };
      seq++;
      return;
    }
  }
  seq++;
}

function drain() {
  for (const d of broadcasts.splice(0)) {
    dueA.push({ player: d.player, cardId: d.cardId, x: d.x, z: d.z, executeTick: d.executeTick, seq: d.seq });
    // slot-1 mirror: flip team AND mirror the board (z -> 32 - z)
    dueB.push({ player: (d.player === 1 ? 0 : 1) as 0 | 1, cardId: d.cardId, x: d.x, z: 32 - d.z, executeTick: d.executeTick, seq: d.seq });
  }
  dueA.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
  dueB.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
}

function feed(m: Battle, due: DeployedMsg[], myTeam: 0 | 1, tag: string) {
  const now = due.filter((d) => d.executeTick <= m.tick);
  const rest = due.filter((d) => d.executeTick > m.tick);
  due.length = 0;
  due.push(...rest);
  for (const d of now) {
    const before = m.nextId;
    deployRemote(m, myTeam, d);
    if (d.cardId === 'woweta') {
      console.log(`spawn${tag} t=${m.tick}:`, m.units.filter((u) => u.id >= before).map((u) => `${u.id}:${u.owner}@${u.x},${u.z}`).join(' '));
    }
  }
}

let plays = 0;
let failed = false;
for (let i = 0; i < 3000 && !S.over; i++) {
  drain();
  feed(mA, dueA, 0, 'A');
  feed(mB, dueB, 1, 'B');
  // server-side due application (mirrors room.applyDue ordering)
  const dueS = room.pending
    .filter((p) => p.executeTick <= S.tick)
    .sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
  room.pending = room.pending.filter((p) => p.executeTick > S.tick);
  for (const d of dueS) S.deploy(d.player, d.cardId, d.x, d.z);
  if (S.tick === 170) {
    console.log('pre-step spawns:', S.units.map((u) => `${u.id}:${u.owner}:x${u.x} z${u.z} tgt${u.targetKind}/${u.targetId}`).join(' | '));
    console.log('pre-step mB:    ', mB.units.map((u) => `${u.id}:${u.owner}:x${u.x} z${u.z} tgt${u.targetKind}/${u.targetId}`).join(' | '));
  }
  S.step(); mA.step(); mB.step();
  if (S.tick % 150 === 0 && S.tick > 0) {
    botPlay(mA, 0, ra.id);
    botPlay(mB, 1, rb.id);
    plays++;
  }
  {
    const st = S.getState();
    const aOk = hashBattleState(st, false) === mA.stateHash();
    const bOk = hashBattleState(flipState(st), true) === hashBattleState(mB.getState(), true);
    if ((!aOk || !bOk) && S.tick > 0) {
      console.log(`tick=${S.tick} A:${aOk ? 'OK' : 'DIFF'} B:${bOk ? 'OK' : 'DIFF'}`);
      const show = (u: { id: number; owner: number; x: number; z: number; hp: number; cooldown: number; swing: number; targetKind: number; targetId: number; stingUntil: number; summonCd: number; whistleCd: number }) =>
        `${u.id}:${u.owner}:x${u.x} z${u.z} hp${u.hp} cd${u.cooldown} sw${u.swing} t${u.targetKind}/${u.targetId} st${u.stingUntil} su${u.summonCd} wh${u.whistleCd}`;
      console.log('  server units:', S.units.map(show).join(' | '));
      console.log('  mB units:    ', mB.units.map(show).join(' | '));
      const sht = (t: { id: number; owner: number; kind: string; hp: number; alive: boolean; active: boolean; targetId: number }) =>
        `${t.id}:${t.owner}:${t.kind}:hp${t.hp}:a${t.alive ? 1 : 0}:t${t.targetId}`;
      console.log('  server towers:', S.towers.map(sht).join(' '));
      console.log('  mB towers:    ', mB.towers.map(sht).join(' '));
      console.log(`  end: S(over=${S.over},w=${S.winner},sd=${S.suddenDeath}) mB(over=${mB.over},w=${mB.winner},sd=${mB.suddenDeath}) strikes=${S.strikes.length}/${mB.strikes.length} rains=${S.rains.length}/${mB.rains.length}`);
      failed = true;
      break;
    }
  }
}
console.log(`done tick=${S.tick}`);
if (failed) {
  console.log('MIRROR TEST FAILED');
  process.exit(1);
}
console.log('ALL MIRROR TESTS PASSED');
process.exit(0);
