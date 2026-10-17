// Lockstep replay of a desyncing live session: exact inputs, no timing.
import { Battle, flipState, hashBattleState } from '../../shared/sim/battle.js';
import { STARTER_DECK } from '../../shared/sim/cards.js';
import type { DeployedMsg } from '../../shared/protocol.js';
import { MemoryDb } from '../src/db.js';
import { MatchRoom } from '../src/rooms.js';
import { hashRecoveryCode } from '../src/auth.js';

// inputs: [serverTick, team(0=A,1=B), card, x, z(server frame)]
const INPUTS: [number, 0 | 1, string, number, number][] = [
  [3, 0, 'fisi', 5.7, 6.9],
  [3, 1, 'fisi', 5.7, 25.1],
  [183, 0, 'watchtower', 9.4, 9.8],
  [183, 1, 'watchtower', 9.4, 22.2],
  [303, 0, 'njuchi', 13.1, 12.7],
  [303, 1, 'njuchi', 13.1, 19.3],
  [543, 0, 'woweta', 2.8, 6.6],
  [543, 1, 'woweta', 2.8, 25.4],
];

const db = new MemoryDb();
await db.migrate();
const mk = async (n: string) => db.createPlayer({ name: n, tag: '0000', recoveryHash: await hashRecoveryCode('AAAA-BBBB-CCCC') });
const ra = await mk('Alice');
const rb = await mk('Bob');
const ids = [ra.id, rb.id];
const room = new MatchRoom(db, ra, rb, [...STARTER_DECK], [...STARTER_DECK], 50, {
  onEnd: () => undefined, onDesync: () => undefined, seed: 419052566,
});
(room as unknown as { started: boolean }).started = true;
const S = room.battle;
const mA = new Battle(room.seed, [...STARTER_DECK], [...STARTER_DECK]);
const mB = new Battle(room.seed, [...STARTER_DECK], [...STARTER_DECK]);
const dueA: DeployedMsg[] = [];
const dueB: DeployedMsg[] = [];
let seq = 100;

function feed(m: Battle, due: DeployedMsg[], mirrorBoard: boolean) {
  const now = due.filter((d) => d.executeTick <= m.tick);
  const rest = due.filter((d) => d.executeTick > m.tick);
  due.length = 0;
  due.push(...rest);
  for (const d of now) m.deploy(d.player, d.cardId, d.x, d.z, mirrorBoard);
}

let si = 0;
for (let i = 0; i < 700 && !S.over; i++) {
  while (si < INPUTS.length && INPUTS[si][0] === S.tick) {
    const [, team, card, x, z] = INPUTS[si++];
    // identical forcing on all three sims (mirrors must validate the same!)
    for (const [bb, tt] of [[S, team], [mA, team], [mB, (1 - team) as 0 | 1]] as const) {
      bb.energy[tt] = Math.max(bb.energy[tt], 10);
      if (!bb.hands[tt].includes(card)) bb.hands[tt][0] = card;
    }
    // lockstep loop runs in one millisecond: bypass the wall-clock rate gate
    (room.slots[0] as { lastDeployAt: number }).lastDeployAt = 0;
    (room.slots[1] as { lastDeployAt: number }).lastDeployAt = 0;
    const ack = room.submitDeploy(ids[team], card, x, z, seq++) as
      | { type: 'deployed'; player: 0 | 1; cardId: string; x: number; z: number; executeTick: number; seq: number }
      | { type: string; reason: string };
    if (ack.type !== 'deployed') {
      console.log(`submit rejected: ${JSON.stringify(ack)}`);
      continue;
    }
    dueA.push({ player: ack.player, cardId: ack.cardId, x: ack.x, z: ack.z, executeTick: ack.executeTick, seq: ack.seq });
    dueB.push({
      player: (ack.player === 1 ? 0 : 1) as 0 | 1, cardId: ack.cardId, x: ack.x, z: 32 - ack.z,
      executeTick: ack.executeTick, seq: ack.seq,
    });
  }
  feed(mA, dueA, false);
  feed(mB, dueB, true);
  const dueS = room.pending
    .filter((p) => p.executeTick <= S.tick)
    .sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
  room.pending = room.pending.filter((p) => p.executeTick > S.tick);
  for (const d of dueS) {
    const beforeS = S.nextId, beforeA = mA.nextId, beforeB = mB.nextId;
    S.deploy(d.player, d.cardId, d.x, d.z);
    if (d.cardId === 'woweta') {
      console.log(`spawnS t=${S.tick}:`, S.units.filter((u) => u.id >= beforeS).map((u) => `${u.id}:${u.owner}@${u.x},${u.z}`).join(' '));
    }
  }
  S.step(); mA.step(); mB.step();
  if (S.tick >= 560 && S.tick <= 582) {
    const g = (u: { id: number }) => u.id === 20;
    const s20 = S.units.find(g);
    const m20 = mB.units.find(g);
    if (s20 && m20) console.log(`t=${S.tick} S20:(${s20.x},${s20.z}) M20:(${m20.x},${m20.z}) flip=${32000 - s20.z}`);
  }
  if (S.tick === 580) {
    const showAll = (u: { id: number; owner: number; sub: string; x: number; z: number }) =>
      `${u.id}:${u.owner}:${u.sub}@${u.x},${u.z}`;
    console.log('S-all:', S.units.map(showAll).join(' '));
    console.log('M-all:', mB.units.map(showAll).join(' '));
  }
  if (S.tick % 20 === 0 && S.tick > 0) {
    const st = S.getState();
    const aOk = hashBattleState(st, false) === hashBattleState(mA.getState(), false);
    const bOk = hashBattleState(flipState(st), true) === hashBattleState(mB.getState(), true);
    if (S.tick >= 560 && S.tick <= 585) {
      const show = (u: { id: number; owner: number; x: number; z: number; swing: number; cooldown: number; targetKind: number; targetId: number }) =>
        `${u.id}:${u.owner}:(${u.x},${u.z}) sw${u.swing} cd${u.cooldown} t${u.targetKind}/${u.targetId}`;
      console.log(`t=${S.tick} S-goats:`, S.units.filter((u) => u.sub === 'goat').map(show).join(' '));
      console.log(`t=${S.tick} M-goats:`, mB.units.filter((u) => u.sub === 'goat').map(show).join(' '));
    }
    if (!aOk || !bOk) {
      console.log(`tick=${S.tick} A:${aOk ? 'OK' : 'DIFF'} B:${bOk ? 'OK' : 'DIFF'}`);
      const show = (u: { id: number; owner: number; x: number; z: number; hp: number; cooldown: number; swing: number; targetKind: number; targetId: number; stingUntil: number; summonCd: number; whistleCd: number }) =>
        `${u.id}:${u.owner}:x${u.x} z${u.z} hp${u.hp} cd${u.cooldown} sw${u.swing} t${u.targetKind}/${u.targetId} st${u.stingUntil} su${u.summonCd} wh${u.whistleCd}`;
      if (!bOk) {
        console.log('  server:', S.units.map(show).join(' | '));
        console.log('  mB:    ', mB.units.map(show).join(' | '));
      }
      break;
    }
  }
}
console.log(`done tick=${S.tick}`);
process.exit(0);
