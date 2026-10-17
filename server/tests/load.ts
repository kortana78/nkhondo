// Bot load test: 100 simulated players queue + play FULL ranked matches
// against the real server (HTTP+WS), each with a local mirror sim.
// Reports wall time, server CPU/mem, message rates, desyncs.
// Run: tsx tests/load.ts
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

const NBOTS = 100;
const TICK_MS = 5;
const SECRET = 'load-test-secret';

let fails = 0;
const ok = (n: string, c: boolean, x = '') => {
  console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`);
  if (!c) fails++;
};

const db = new MemoryDb();
await db.migrate();
const config = {
  port: 0, databaseUrl: '', jwtSecret: SECRET, adminKey: '',
  allowedOrigins: [] as string[], tickMs: TICK_MS, clientUrl: '',
};
const hub = new Hub(config, db);
const handler = createHandler({
  config, db, live: () => hub.stats(), registered: () => db.countPlayers(),
  adminStats: () => ({}),
});
const server = createServer((req, res) => { void handler(req, res); });
attachWs(server, hub, db, config);
await new Promise<void>((r) => server.listen(18097, r));
const sweep = setInterval(() => { try { hub.sweep(); } catch { /* noop */ } }, 50);
const WSURL = 'ws://127.0.0.1:18097/ws';

let sent = 0;
let received = 0;

interface Bot {
  id: string;
  ws: WebSocket;
  team: 0 | 1;
  mirror: Battle | null;
  due: DeployedMsg[];
  seq: number;
  done: boolean;
  lastPlay: number;
}

const bots: Bot[] = [];
for (let i = 0; i < NBOTS; i++) {
  const row = await db.createPlayer({ name: `Bot${i}`, tag: '0000', recoveryHash: await hashRecoveryCode('AAAA-BBBB-CCCC') });
  const token = signToken(SECRET, row.id, 0);
  const ws: WebSocket = await new Promise((res, rej) => {
    const w = new WebSocket(`${WSURL}?token=${token}`);
    w.on('open', () => res(w));
    w.on('error', rej);
  });
  const bot: Bot = { id: row.id, ws, team: 0, mirror: null, due: [], seq: 1, done: false, lastPlay: 0 };
  bots.push(bot);
  ws.on('message', (data) => {
    received++;
    const m = JSON.parse(String(data)) as ServerMsg;
    if (m.type === 'match_found') {
      bot.team = m.yourTeam;
      const myDeck = m.yourTeam === 0 ? m.deck : m.foeDeck;
      const foeDeck = m.yourTeam === 0 ? m.foeDeck : m.deck;
      bot.mirror = new Battle(m.seed, myDeck, foeDeck);
      bot.mirror.mirrorZ = m.yourTeam === 1;
      bot.due = [];
    } else if (m.type === 'deployed' && bot.mirror) {
      const mz = bot.team === 0 ? m.z : 32 - m.z;
      bot.due.push({
        player: (m.player === bot.team ? 0 : 1) as 0 | 1,
        cardId: m.cardId, x: m.x, z: mz, executeTick: m.executeTick, seq: m.seq,
      });
      bot.due.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
    } else if (m.type === 'tick' && bot.mirror) {
      const b = bot.mirror;
      let guard = 0;
      while (b.tick < m.serverTick && guard++ < 500) {
        const now = bot.due.filter((d) => d.executeTick <= b.tick);
        bot.due = bot.due.filter((d) => d.executeTick > b.tick);
        for (const d of now) deployRemote(b, bot.team, d);
        b.step();
        if (b.tick % 40 === 0) {
          const h = bot.team === 0 ? b.stateHash() : hashBattleState(b.getState(), true);
          send(bot, { type: 'hash', tick: b.tick, hash: h });
        }
      }
    } else if (m.type === 'snapshot' && bot.mirror) {
      bot.mirror.setState(bot.team === 0 ? m.state : flipState(m.state));
      bot.due = m.pending
        .filter((p) => p.executeTick > bot.mirror!.tick)
        .map((p) => ({
          player: (p.player === bot.team ? 0 : 1) as 0 | 1,
          cardId: p.cardId, x: p.x,
          z: bot.team === 0 ? p.z : 32 - p.z,
          executeTick: p.executeTick, seq: p.seq,
        }));
    } else if (m.type === 'match_end') {
      bot.done = true;
    }
  });
}

function send(bot: Bot, m: ClientMsg): void {
  sent++;
  bot.ws.send(JSON.stringify(m));
}

const cpu0 = process.cpuUsage();
const mem0 = process.memoryUsage().heapUsed;
const t0 = Date.now();

// all bots queue at once
for (const bot of bots) send(bot, { type: 'queue', deck: [...STARTER_DECK] });

let lastStatus = 0;
for (;;) {
  const done = bots.filter((b) => b.done).length;
  if (done >= NBOTS) break;
  if (Date.now() - t0 > 420_000) break;
  if (Date.now() - lastStatus > 10_000) {
    lastStatus = Date.now();
    console.log(`  ... ${done}/${NBOTS} done, rooms=${hub.rooms.size} queue=${hub.mm.size} desyncs=${hub.desyncs}`);
  }
  // bot play: one deploy per bot every ~1.5s from its mirror
  for (const bot of bots) {
    const b = bot.mirror;
    if (!b || b.over || bot.done) continue;
    if (Date.now() - bot.lastPlay < 1500) continue;
    bot.lastPlay = Date.now();
    for (const card of [...b.hands[0]].sort()) {
      const isSpell = ['rain', 'roadblock', 'harvest', 'mafunde', 'moto', 'mphepo', 'mphezi', 'makwerero'].includes(card);
      const x = 2 + ((bot.seq * 37) % 140) / 10;
      const z = isSpell ? 10 + ((bot.seq * 53) % 120) / 10 : 4 + ((bot.seq * 29) % 90) / 10;
      if (!b.canDeploy(0, card, x, z).ok) continue;
      const sz = bot.team === 0 ? z : 32 - z;
      send(bot, { type: 'deploy', cardId: card, x, z: sz, clientSeq: bot.seq++ });
      break;
    }
  }
  await new Promise((r) => setTimeout(r, 100));
}

const wallS = (Date.now() - t0) / 1000;
const cpu = process.cpuUsage(cpu0);
const cpuS = (cpu.user + cpu.system) / 1e6;
const memMB = (process.memoryUsage().heapUsed - mem0) / 1048576;
const done = bots.filter((b) => b.done).length;
console.log(`  wall=${wallS.toFixed(1)}s server-cpu=${cpuS.toFixed(1)}s mem-delta=${memMB.toFixed(1)}MB`);
console.log(`  msgs: client->server=${sent} server->client=${received} desyncs=${hub.desyncs}`);

ok('all 100 bots completed ranked matches', done === NBOTS, `${done}/${NBOTS}`);
ok('zero desyncs at scale', hub.desyncs === 0, `desyncs=${hub.desyncs}`);
const lb = await db.leaderboard(5);
ok('elo recorded', lb.length > 0 && lb[0].games > 0, `top games=${lb[0]?.games}`);

for (const bot of bots) { try { bot.ws.close(); } catch { /* noop */ } }
clearInterval(sweep);
server.close();
if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL LOAD TESTS PASSED');
