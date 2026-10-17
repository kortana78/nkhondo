// Server smoke test: boot, register 2 players, recover, leaderboard, stats.
import { Hub } from '../src/hub.js';
import { createHandler } from '../src/http.js';
import { MemoryDb } from '../src/db.js';
import { createServer } from 'node:http';

const db = new MemoryDb();
await db.migrate();
const hub = new Hub({ port: 0, databaseUrl: '', jwtSecret: 'test-secret', adminKey: 'adm', allowedOrigins: [], tickMs: 50, clientUrl: '' }, db);
const handler = createHandler({
  config: hub.config, db,
  live: () => hub.stats(),
  registered: () => db.countPlayers(),
  adminStats: () => ({ ok: true }),
});
const server = createServer((req, res) => { void handler(req, res); });
await new Promise<void>((r) => server.listen(18099, r));

const base = 'http://127.0.0.1:18099';
async function post(path, body, token) {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}
async function get(path, token) {
  const res = await fetch(base + path, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  return { status: res.status, json: await res.json() };
}

let fails = 0;
const ok = (n, c, x = '') => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); if (!c) fails++; };

const h = await get('/healthz');
ok('healthz', h.status === 200 && h.json.ok);
const bad = await post('/api/register', { name: 'x' });
ok('short name rejected', bad.status === 400, JSON.stringify(bad.json));
const prof = await post('/api/register', { name: 'Bwana Moyo' });
ok('register ok', prof.status === 200 && prof.json.tag === '0000' && !!prof.json.recoveryCode, JSON.stringify(prof.json).slice(0, 120));
const dup = await post('/api/register', { name: 'bwana moyo' });
ok('duplicate gets tag', dup.status === 200 && dup.json.tag !== '0000', `tag=${dup.json.tag}`);
const rec = await post('/api/recover', { code: prof.json.recoveryCode });
ok('recover works', rec.status === 200 && rec.json.playerId === prof.json.playerId);
const me = await get('/api/me', prof.json.token);
ok('profile', me.status === 200 && me.json.rating === 1000 && me.json.rank === 1, JSON.stringify(me.json).slice(0, 120));
const rn = await post('/api/rename', { name: 'Mfumu' }, prof.json.token);
ok('rename', rn.status === 200 && rn.json.name === 'Mfumu');
const rn2 = await post('/api/rename', { name: 'Mfumu2' }, prof.json.token);
ok('rename cooldown', rn2.status === 429);
const lb = await get('/api/leaderboard?limit=10', prof.json.token);
ok('leaderboard', lb.status === 200 && lb.json.top.length === 2 && lb.json.you.rank === 1, `top=${lb.json.top.length}`);
const st = await get('/api/stats');
ok('stats', st.status === 200 && st.json.registered === 2, JSON.stringify(st.json));
const adm = await fetch(base + '/admin/stats', { headers: { 'x-admin-key': 'adm' } }).then((r) => r.json());
ok('admin', adm.ok === true);
for (let i = 0; i < 6; i++) await post('/api/register', { name: `Spammer${i}` });
const lim = await post('/api/register', { name: 'Blocked1' });
ok('register rate limit', lim.status === 429, `status=${lim.status}`);

server.close();
if (fails) { console.log(fails + ' FAILURES'); process.exit(1); }
console.log('ALL SERVER SMOKE TESTS PASSED');
