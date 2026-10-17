// Full online match test over real HTTP+WS: queue -> match -> scripted play
// with local mirror sims -> match_end + Elo. Plus: cheat rejects, reconnect
// resume, rematch handshake. Run: tsx tests/match.ts
import { createServer } from 'node:http';
import WebSocket from 'ws';
import { Battle, deployRemote, flipState, hashBattleState } from '../../shared/sim/battle.js';
import { STARTER_DECK } from '../../shared/sim/cards.js';
import type { ClientMsg, DeployedMsg, ServerMsg } from '../../shared/protocol.js';
import { Hub } from '../src/hub.js';
import { createHandler } from '../src/http.js';
import { MemoryDb } from '../src/db.js';
import { attachWs } from '../src/ws.js';
import { hashRecoveryCode, signToken } from '../src/auth.js';

const TICK_MS = 5;
let fails = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  if (!c) fails++;
};

const db = new MemoryDb();
await db.migrate();
const config = {
  port: 0, databaseUrl: '', jwtSecret: 'match-test-secret', adminKey: '',
  allowedOrigins: [] as string[], tickMs: TICK_MS, clientUrl: '',
};
const hub = new Hub(config, db);
const handler = createHandler({
  config, db, live: () => hub.stats(), registered: () => db.countPlayers(),
  adminStats: () => ({}),
});
const server = createServer((req, res) => { void handler(req, res); });
attachWs(server, hub, db, config);
await new Promise<void>((r) => server.listen(18098, r));
const sweepTimer = setInterval(() => { try { hub.sweep(); } catch { /* noop */ } }, 100);
const WSURL = 'ws://127.0.0.1:18098/ws';

async function mkPlayer(name: string) {
  const row = await db.createPlayer({ name, tag: '0000', recoveryHash: await hashRecoveryCode('AAAA-BBBB-CCCC') });
  return { row, token: signToken(config.jwtSecret, row.id, 0) };
}
const A = await mkPlayer('Alice');
const B = await mkPlayer('Bob');

interface Ctx {
  ws: WebSocket;
  inbox: ServerMsg[];
  team: 0 | 1;
  mirror: Battle | null;
  due: (DeployedMsg & { mirror: boolean })[];
  hashesSent: number;
  hold: boolean;
}

function connectRaw(token: string): WebSocket {
  return new WebSocket(`${WSURL}?token=${token}`);
}

function connect(token: string): Promise<WebSocket> {
  return new Promise((res, rej) => {
    const ws = connectRaw(token);
    ws.on('open', () => res(ws));
    ws.on('error', rej);
  });
}

function mkCtx(ws: WebSocket): Ctx {
  const ctx: Ctx = { ws, inbox: [], team: 0, mirror: null, due: [], hashesSent: 0, hold: false };
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as ServerMsg;
    ctx.inbox.push(m);
    onMsg(ctx, m);
  });
  return ctx;
}

function localOf(ctx: Ctx, p: 0 | 1): 0 | 1 {
  return (p === ctx.team ? 0 : 1) as 0 | 1;
}

function onMsg(ctx: Ctx, m: ServerMsg): void {
  if (m.type === 'match_found') {
    ctx.team = m.yourTeam;
    const myDeck = m.yourTeam === 0 ? m.deck : m.foeDeck;
    const foeDeck = m.yourTeam === 0 ? m.foeDeck : m.deck;
    ctx.mirror = new Battle(m.seed, myDeck, foeDeck);
    ctx.due = [];
  } else if (m.type === 'deployed' && ctx.mirror) {
    // slot-1 clients mirror the board (z -> 32 - z): map team AND coords,
    // and negate formation offsets for every server-originated deploy
    const mz = ctx.team === 0 ? m.z : 32 - m.z;
    ctx.due.push({
      player: localOf(ctx, m.player), cardId: m.cardId, x: m.x, z: mz,
      executeTick: m.executeTick, seq: m.seq, mirror: ctx.team === 1,
    });
    ctx.due.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
  } else if (m.type === 'tick' && ctx.mirror && !ctx.hold) {
    const b = ctx.mirror;
    let guard = 0;
    while (b.tick < m.serverTick && guard++ < 500) {
      const dueNow = ctx.due.filter((d) => d.executeTick <= b.tick);
      ctx.due = ctx.due.filter((d) => d.executeTick > b.tick);
      for (const d of dueNow) deployRemote(b, ctx.team, d);
      b.step();
      if (b.tick % 40 === 0) {
        ctx.hashesSent++;
        const h = ctx.team === 0 ? b.stateHash() : hashBattleState(b.getState(), true);
        ctx.ws.send(JSON.stringify({ type: 'hash', tick: b.tick, hash: h }));
      }
    }
  } else if (m.type === 'snapshot' && ctx.mirror) {
    ctx.hold = false;
    const st = ctx.team === 0 ? m.state : flipState(m.state);
    ctx.mirror.setState(st);
    ctx.due = m.pending
      .filter((p) => p.executeTick > ctx.mirror!.tick)
      .map((p) => ({
        player: localOf(ctx, p.player), cardId: p.cardId, x: p.x,
        z: ctx.team === 0 ? p.z : 32 - p.z,
        executeTick: p.executeTick, seq: p.seq, mirror: ctx.team === 1,
      }))
      .sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
  }
}

function send(ws: WebSocket, m: ClientMsg): void {
  ws.send(JSON.stringify(m));
}

async function waitFor(ctx: Ctx, type: ServerMsg['type'], timeoutMs = 20_000): Promise<ServerMsg> {
  const t0 = Date.now();
  for (;;) {
    const i = ctx.inbox.findIndex((m) => m.type === type);
    if (i >= 0) return ctx.inbox.splice(i, 1)[0];
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${type}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

// deterministic bot play from the mirror sim
let seq = 1;
function botPlay(ctx: Ctx): void {
  const b = ctx.mirror;
  if (!b || b.over) return;
  for (const card of [...b.hands[0]].sort()) {
    const isSpell = ['rain', 'roadblock', 'harvest', 'mafunde', 'moto', 'mphepo', 'mphezi', 'makwerero'].includes(card);
    const x = 2 + ((seq * 37) % 140) / 10;
    const z = isSpell ? 10 + ((seq * 53) % 120) / 10 : 4 + ((seq * 29) % 90) / 10;
    const chk = b.canDeploy(0, card, x, z);
    if (chk.ok) {
      send(ctx.ws, { type: 'deploy', cardId: card, x, z, clientSeq: seq++ });
      return;
    }
  }
}

// ---------- cheat tests (raw socket, before real play) ----------
const wsA = await connect(A.token);
const wsB = await connect(B.token);
const ctxA = mkCtx(wsA);
const ctxB = mkCtx(wsB);
send(wsA, { type: 'queue', deck: [...STARTER_DECK] });
send(wsB, { type: 'queue', deck: [...STARTER_DECK] });
const foundA = await waitFor(ctxA, 'match_found') as Extract<ServerMsg, { type: 'match_found' }>;
await waitFor(ctxB, 'match_found');
ok('matched with countdown', foundA.countdownMs === 3000 && !!foundA.matchId);
ok('decks shipped, foe named', foundA.deck.length === 8 && foundA.foeDeck.length === 8 && foundA.foe.name === 'Bob');
await waitFor(ctxA, 'match_start', 10_000);
await new Promise((r) => setTimeout(r, 1500));

// ---------- cheat tests (deterministic, room level) ----------
{
  const { MatchRoom } = await import('../src/rooms.js');
  const sent: unknown[] = [];
  const fake = { send: (m: unknown) => { sent.push(m); } };
  const ra = await db.findPlayerById(A.row.id);
  const rb = await db.findPlayerById(B.row.id);
  const room = new MatchRoom(db, ra!, rb!, [...STARTER_DECK], [...STARTER_DECK], 50, {
    onEnd: () => undefined,
    onDesync: () => undefined,
  });
  room.attach(A.row.id, fake as never);
  room.attach(B.row.id, fake as never);
  (room as unknown as { started: boolean }).started = true;
  const b = room.battle;
  const pace = () => {
    (room.slots[0] as { lastDeployAt: number }).lastDeployAt = 0;
    (room.slots[1] as { lastDeployAt: number }).lastDeployAt = 0;
  };
  b.energy[0] = 0;
  if (!b.hands[0].includes('mlonda')) b.hands[0][0] = 'mlonda';
  pace();
  const r1 = room.submitDeploy(A.row.id, 'mlonda', 9, 6, 1);
  ok('no energy rejected', r1.type === 'rejected' && r1.reason === 'energy', JSON.stringify(r1));
  b.energy[0] = 10;
  b.hands[0] = ['mlonda', 'roadblock', 'rain', 'zikwanje'];
  pace();
  const r2 = room.submitDeploy(A.row.id, 'moto', 9, 6, 2);
  ok('not-in-hand rejected', r2.type === 'rejected' && r2.reason === 'hand', JSON.stringify(r2));
  pace();
  const r3 = room.submitDeploy(A.row.id, 'roadblock', 99, 16, 3);
  ok('outside arena rejected', r3.type === 'rejected' && r3.reason === 'arena', JSON.stringify(r3));
  pace();
  const r4 = room.submitDeploy(A.row.id, 'mlonda', 9, 6, 4);
  ok('valid deploy scheduled +20t', r4.type === 'deployed' && r4.executeTick === b.tick + 20, JSON.stringify(r4).slice(0, 120));
  let rate = 0;
  for (let i = 0; i < 25; i++) {
    const r = room.submitDeploy(A.row.id, 'rain', 9, 16, 100 + i);
    if (r.type === 'rejected' && r.reason === 'rate') rate++;
  }
  ok('spam rate-limited', rate > 0, `rate=${rate}`);
  room.destroy();
}

// ---------- reconnect test (handler attached BEFORE open: no race) ----------
wsA.close();
await new Promise((r) => setTimeout(r, 1200));
const wsA2raw = connectRaw(A.token);
const ctxA2 = mkCtx(wsA2raw);
// a real client keeps its battle across reconnects; this test rebuilds the
// mirror from the stashed match_found, then the snapshot handler resyncs it.
{
  const f = foundA as unknown as { seed: number; deck: string[]; foeDeck: string[]; yourTeam: 0 | 1 };
  ctxA2.team = ctxA.team;
  ctxA2.hold = true; // don't step/hash until the snapshot resyncs us
  const myDeck = f.yourTeam === 0 ? f.deck : f.foeDeck;
  const foeDeck = f.yourTeam === 0 ? f.foeDeck : f.deck;
  ctxA2.mirror = new Battle(f.seed, myDeck, foeDeck);
}
await new Promise<void>((res, rej) => {
  wsA2raw.on('open', () => res());
  wsA2raw.on('error', rej);
});
const wsA2 = wsA2raw;
// keep old ctxA inbox for match_end later? use ctxA2 from here on
let gotSnap = false;
{
  const t0 = Date.now();
  while (Date.now() - t0 < 8000 && !gotSnap) {
    if (ctxA2.inbox.some((m) => m.type === 'snapshot')) gotSnap = true;
    else await new Promise((r) => setTimeout(r, 100));
  }
}
ok('reconnect snapshot', gotSnap);

// ---------- play the match out with both mirrors ----------
const players = [ctxA2, ctxB];
const t0 = Date.now();
let endA: ServerMsg | null = null;
let endB: ServerMsg | null = null;
let lastPlay = 0;
while (Date.now() - t0 < 150_000) {
  for (const p of players) {
    const i = p.inbox.findIndex((m) => m.type === 'match_end');
    if (i >= 0) {
      const m = p.inbox.splice(i, 1)[0];
      if (p === ctxA2) endA = m; else endB = m;
    }
  }
  if (endA && endB) break;
  if (Date.now() - lastPlay > 1500) {
    lastPlay = Date.now();
    botPlay(ctxA2);
    botPlay(ctxB);
  }
  await new Promise((r) => setTimeout(r, 100));
}
ok('match completed for both', !!endA && !!endB);
if (endA && endA.type === 'match_end' && endB && endB.type === 'match_end') {
  ok('elo deltas zero-sum', endA.youDelta + endA.foeDelta === 0, `${endA.youDelta}/${endA.foeDelta}`);
  ok('ratings moved', endA.youRating !== 1000 || endB.youRating !== 1000, `A=${endA.youRating} B=${endB.youRating}`);
  console.log(`  result: winner=${endA.winner} reason=${endA.reason} A ${endA.youRating} (${endA.youDelta >= 0 ? '+' : ''}${endA.youDelta})`);
}
ok('no server desyncs', hub.desyncs === 0, `desyncs=${hub.desyncs}`);
ok('hashes were checked', ctxA2.hashesSent > 3 && ctxB.hashesSent > 3, `A=${ctxA2.hashesSent} B=${ctxB.hashesSent}`);

// ---------- rematch handshake ----------
if (endA && endB) {
  ctxA2.inbox.length = 0;
  ctxB.inbox.length = 0;
  send(wsA2, { type: 'rematch' });
  const asked = await waitFor(ctxB, 'rematch_asked', 5000).catch(() => null);
  ok('rematch relayed', !!asked);
  send(wsB, { type: 'rematch_accept' });
  const f2 = await waitFor(ctxA2, 'match_found', 8000).catch(() => null);
  ok('rematch starts new match', !!f2);
}

wsA2.close(); wsB.close();
clearInterval(sweepTimer);
server.close();
if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL MATCH TESTS PASSED');
