// Deterministic woweta mirror test: identical lockstep, no timing.
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
const room = new MatchRoom(db, ra, rb, [...STARTER_DECK], [...STARTER_DECK], 50, {
  onEnd: () => undefined, onDesync: () => undefined, seed: 7,
});
(room as unknown as { started: boolean }).started = true;
(room.slots[0] as { lastDeployAt: number }).lastDeployAt = 0;
(room.slots[1] as { lastDeployAt: number }).lastDeployAt = 0;
const S = room.battle;
const mA = new Battle(room.seed, [...STARTER_DECK], [...STARTER_DECK]);
const mB = new Battle(room.seed, [...STARTER_DECK], [...STARTER_DECK]);
const dueA: DeployedMsg[] = [];
const dueB: DeployedMsg[] = [];

for (const b of [S, mA, mB]) {
  b.energy[0] = 10; b.energy[1] = 10;
  if (!b.hands[0].includes('woweta')) b.hands[0][0] = 'woweta';
  if (!b.hands[1].includes('woweta')) b.hands[1][0] = 'woweta';
}
type Ack = { type: string; player?: 0 | 1; cardId?: string; x?: number; z?: number; executeTick?: number; seq?: number };
const a1 = room.submitDeploy(ra.id, 'woweta', 9, 8, 1) as Ack;
const a2 = room.submitDeploy(rb.id, 'woweta', 9, 24, 2) as Ack;
for (const a of [a1, a2]) {
  if (a.type !== 'deployed') { console.log('submit failed', JSON.stringify(a)); process.exit(1); }
  dueA.push({ player: a.player!, cardId: a.cardId!, x: a.x!, z: a.z!, executeTick: a.executeTick!, seq: a.seq! });
  dueB.push({
    player: (a.player === 1 ? 0 : 1) as 0 | 1, cardId: a.cardId!, x: a.x!,
    z: 32 - a.z!, executeTick: a.executeTick!, seq: a.seq!,
  });
}

function feed(m: Battle, due: DeployedMsg[], myTeam: 0 | 1) {
  const now = due.filter((d) => d.executeTick <= m.tick);
  const rest = due.filter((d) => d.executeTick > m.tick);
  due.length = 0;
  due.push(...rest);
  for (const d of now) deployRemote(m, myTeam, d);
}

for (let i = 0; i < 400 && !S.over; i++) {
  feed(mA, dueA, 0);
  feed(mB, dueB, 1);
  const dueS = room.pending
    .filter((p) => p.executeTick <= S.tick)
    .sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
  room.pending = room.pending.filter((p) => p.executeTick > S.tick);
  for (const d of dueS) S.deploy(d.player, d.cardId, d.x, d.z);
  if (S.tick === 25) {
    const show = (u: { id: number; owner: number; x: number; z: number }) => `${u.id}:${u.owner}@${u.x},${u.z}`;
    console.log('S-spawns :', S.units.map(show).join(' '));
    console.log('mB-spawns:', mB.units.map(show).join(' '));
  }
  S.step(); mA.step(); mB.step();
  if (S.tick % 20 === 0 && S.tick > 0) {
    const st = S.getState();
    const aOk = hashBattleState(st, false) === hashBattleState(mA.getState(), false);
    const bOk = hashBattleState(flipState(st), true) === hashBattleState(mB.getState(), true);
    if (!aOk || !bOk) {
      console.log(`tick=${S.tick} A:${aOk ? 'OK' : 'DIFF'} B:${bOk ? 'OK' : 'DIFF'}`);
      const show2 = (u: { id: number; owner: number; x: number; z: number }) => `${u.id}:${u.owner}@${u.x},${u.z}`;
      console.log('  S :', S.units.map(show2).join(' '));
      console.log('  mB:', mB.units.map(show2).join(' '));
      console.log('WOWETA MIRROR TEST FAILED');
      process.exit(1);
    }
  }
}
console.log(`done tick=${S.tick}`);
console.log('ALL WOWETA MIRROR TESTS PASSED');
process.exit(0);
