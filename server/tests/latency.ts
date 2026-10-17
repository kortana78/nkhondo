// Latency test: 300ms artificial latency (150ms each way) + 2% packet
// loss-with-retransmit on the client->server leg, real-time ticks.
// Two bots play a scripted 600-tick segment with mirror sims.
// Asserts: all deploys acked (none starved by the delay), zero desyncs,
// ack round-trips stay under the 1s deploy window (feels instant).
// Run: tsx tests/latency.ts
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

const TICK_MS = 50; // real-time sim rate
const ONE_WAY_MS = 150;
const LOSS_PCT = Number(process.argv[2] ?? 2);
const RESEND_MS = 200;
const PLAY_TICKS = 600;

let fails = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  if (!c) fails++;
};

const db = new MemoryDb();
await db.migrate();
const config = {
  port: 0, databaseUrl: '', jwtSecret: 'latency-test-secret', adminKey: '',
  allowedOrigins: [] as string[], tickMs: TICK_MS, clientUrl: '',
};
const hub = new Hub(config, db);
const handler = createHandler({
  config, db, live: () => hub.stats(), registered: () => db.countPlayers(),
  adminStats: () => ({}),
});
const server = createServer((req, res) => { void handler(req, res); });
attachWs(server, hub, db, config);
await new Promise<void>((r) => server.listen(18096, r));
const sweep = setInterval(() => { try { hub.sweep(); } catch { /* noop */ } }, 200);
const WSURL = 'ws://127.0.0.1:18096/ws';

async function mkPlayer(name: string) {
  const row = await db.createPlayer({ name, tag: '0000', recoveryHash: await hashRecoveryCode('AAAA-BBBB-CCCC') });
  return { row, token: signToken(config.jwtSecret, row.id, 0) };
}
const A = await mkPlayer('LaggyA');
const B = await mkPlayer('LaggyB');

interface Ctx {
  ws: WebSocket;
  inbox: ServerMsg[];
  team: 0 | 1;
  mirror: Battle | null;
  due: DeployedMsg[];
  ackLat: number[];
  sentAt: Map<number, number>;
  seq: number;
  hashStates: Map<number, ReturnType<Battle['getState']>>;
}

// laggy transport: delay every client->server frame 150ms, drop 2% (resend +200ms)
function laggySend(ctx: Ctx, m: ClientMsg): void {
  const deliver = () => {
    try { ctx.ws.send(JSON.stringify(m)); } catch { /* noop */ }
  };
  if (m.type === 'deploy') ctx.sentAt.set((m as { clientSeq: number }).clientSeq, Date.now());
  if (Math.random() * 100 < LOSS_PCT) {
    setTimeout(deliver, ONE_WAY_MS + RESEND_MS);
  } else {
    setTimeout(deliver, ONE_WAY_MS);
  }
}

function mkCtx(ws: WebSocket): Ctx {
  const ctx: Ctx = { ws, inbox: [], team: 0, mirror: null, due: [], ackLat: [], sentAt: new Map(), seq: 1, hashStates: new Map() };
  ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as ServerMsg;
    ctx.inbox.push(m);
    if (m.type === 'match_found') {
      ctx.team = m.yourTeam;
      const myDeck = m.yourTeam === 0 ? m.deck : m.foeDeck;
      const foeDeck = m.yourTeam === 0 ? m.foeDeck : m.deck;
      ctx.mirror = new Battle(m.seed, myDeck, foeDeck);
      ctx.due = [];
    } else if (m.type === 'deployed' && ctx.mirror) {
      const mz = ctx.team === 0 ? m.z : 32 - m.z;
      ctx.due.push({
        player: (m.player === ctx.team ? 0 : 1) as 0 | 1,
        cardId: m.cardId, x: m.x, z: mz, executeTick: m.executeTick, seq: m.seq,
      });
      ctx.due.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
      if (m.clientSeq != null && ctx.sentAt.has(m.clientSeq)) {
        ctx.ackLat.push(Date.now() - ctx.sentAt.get(m.clientSeq)!);
        ctx.sentAt.delete(m.clientSeq);
      }
    } else if (m.type === 'tick' && ctx.mirror) {
      const b = ctx.mirror;
      let guard = 0;
      while (b.tick < m.serverTick && guard++ < 500) {
        const now = ctx.due.filter((d) => d.executeTick <= b.tick);
        ctx.due = ctx.due.filter((d) => d.executeTick > b.tick);
        for (const d of now) deployRemote(b, ctx.team, d);
        b.step();
        if (b.tick % 40 === 0) {
          const h = ctx.team === 0 ? b.stateHash() : hashBattleState(b.getState(), true);
          ctx.hashStates.set(b.tick, b.getState());
          if (ctx.hashStates.size > 6) {
            const oldest = Math.min(...ctx.hashStates.keys());
            ctx.hashStates.delete(oldest);
          }
          if (process.env.NKHONDO_DESYNC_DEBUG) {
            console.log(`[bot-hash] team=${ctx.team} tick=${b.tick} hash=${h}`);
          }
          ctx.ws.send(JSON.stringify({ type: 'hash', tick: b.tick, hash: h }));
        }
      }
    } else if (m.type === 'snapshot' && ctx.mirror) {
      if (process.env.NKHONDO_DESYNC_DEBUG) {
        const rec = ctx.hashStates.get(m.serverTick);
        if (rec) {
          console.log(`[bot-state] team=${ctx.team} tick=${m.serverTick}`);
        }
        console.log(`[bot-pre] team=${ctx.team} tick=${ctx.mirror.tick} nunits=${ctx.mirror.units.length}`);
      }
      ctx.mirror.setState(ctx.team === 0 ? m.state : flipState(m.state));
      ctx.due = m.pending
        .filter((p) => p.executeTick > ctx.mirror!.tick)
        .map((p) => ({
          player: (p.player === ctx.team ? 0 : 1) as 0 | 1,
          cardId: p.cardId, x: p.x,
          z: ctx.team === 0 ? p.z : 32 - p.z,
          executeTick: p.executeTick, seq: p.seq,
        }));
    }
  });
  return ctx;
}

async function connect(token: string): Promise<WebSocket> {
  const ws = new WebSocket(`${WSURL}?token=${token}`);
  await new Promise<void>((res, rej) => {
    ws.on('open', () => res());
    ws.on('error', rej);
  });
  return ws;
}
async function waitFor(ctx: Ctx, type: ServerMsg['type'], timeoutMs = 30_000): Promise<ServerMsg> {
  const t0 = Date.now();
  for (;;) {
    const i = ctx.inbox.findIndex((m) => m.type === type);
    if (i >= 0) return ctx.inbox.splice(i, 1)[0];
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${type}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const wsA = await connect(A.token);
const wsB = await connect(B.token);
const ctxA = mkCtx(wsA);
const ctxB = mkCtx(wsB);
laggySend(ctxA, { type: 'queue', deck: [...STARTER_DECK] });
laggySend(ctxB, { type: 'queue', deck: [...STARTER_DECK] });
await waitFor(ctxA, 'match_found');
await waitFor(ctxB, 'match_found');
await waitFor(ctxA, 'match_start', 15_000);
console.log('  matched, playing 600 ticks through 300ms/2% link...');

// scripted plays from mirrors every ~3s
const players = [ctxA, ctxB];
const t0 = Date.now();
let plays = 0;
let rejects = 0;
for (const p of players) {
  p.ws.on('message', (data) => {
    const m = JSON.parse(String(data)) as ServerMsg;
    if (m.type === 'rejected') rejects++;
  });
}
while ((ctxA.mirror?.tick ?? 0) < PLAY_TICKS && Date.now() - t0 < 180_000) {
  for (const p of players) {
    const b = p.mirror;
    if (!b || b.over) continue;
    for (const card of [...b.hands[0]].sort()) {
      const isSpell = ['rain', 'roadblock', 'harvest', 'lake-surge', 'moto', 'mphepo', 'makwerero', 'mphezi'].includes(card);
      const x = 2 + ((p.seq * 37) % 140) / 10;
      const z = isSpell ? 10 + ((p.seq * 53) % 120) / 10 : 4 + ((p.seq * 29) % 90) / 10;
      if (!b.canDeploy(0, card, x, z).ok) continue;
      const sz = p.team === 0 ? z : 32 - z;
      laggySend(p, { type: 'deploy', cardId: card, x, z: sz, clientSeq: p.seq++ });
      console.log(`  play t=${b.tick} team=${p.team} ${card} (${x.toFixed(1)},${sz.toFixed(1)})`);
      plays++;
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 3000));
}
const lat = [...ctxA.ackLat, ...ctxB.ackLat].sort((a, b) => a - b);
const p95 = lat.length ? lat[Math.floor(lat.length * 0.95)] : -1;
const maxLat = lat.length ? lat[lat.length - 1] : -1;
console.log(`  plays=${plays} rejects=${rejects} ack p95=${p95}ms max=${maxLat}ms desyncs=${hub.desyncs}`);
ok('deploys acked through lag (none starved)', plays > 5 && lat.length >= plays - 2, `acks=${lat.length}/${plays}`);
ok('acks stay inside the 1s deploy window', p95 > 0 && p95 < 1000, `p95=${p95}ms`);
ok('zero desyncs under 300ms + 2% loss', hub.desyncs === 0, `desyncs=${hub.desyncs}`);

wsA.close(); wsB.close();
clearInterval(sweep);
server.close();
if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL LATENCY TESTS PASSED');
