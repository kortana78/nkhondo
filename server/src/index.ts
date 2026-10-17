// Nkhondo game server: REST + WebSocket in one process.
// REST: register/recover/profile/leaderboard/stats. WS: queue + live matches.
import { createServer } from 'node:http';
import { loadConfig } from './config.js';
import { MemoryDb, type Db } from './db.js';
import { PgDb } from './pgdb.js';
import { Hub } from './hub.js';
import { createHandler } from './http.js';
import { attachWs } from './ws.js';

async function openDb(url: string): Promise<Db> {
  if (url) {
    const pg = new PgDb(url);
    await pg.migrate();
    console.log('[db] postgres connected + migrated');
    return pg;
  }
  console.log('[db] no DATABASE_URL — running on in-memory store (dev/single instance)');
  const mem = new MemoryDb();
  await mem.migrate();
  return mem;
}

async function main(): Promise<void> {
  const config = loadConfig();
  if (!process.env.JWT_SECRET) console.log('[warn] JWT_SECRET not set — using dev default (do NOT deploy like this)');
  const db = await openDb(config.databaseUrl);
  const hub = new Hub(config, db);

  const handler = createHandler({
    config,
    db,
    live: () => hub.stats(),
    registered: () => db.countPlayers(),
    adminStats: () => ({
      uptime_s: Math.round((Date.now() - hub.startedAt) / 1000),
      rooms: hub.rooms.size,
      live_rooms: [...hub.rooms.values()].filter((r) => !r.over).length,
      in_queue: hub.mm.size,
      online_sockets: hub.onlineSockets(),
      matches_played: hub.matchesPlayed,
      desyncs: hub.desyncs,
      db: db.kind,
      draining: hub.draining,
    }),
  });

  const server = createServer((req, res) => { void handler(req, res); });
  attachWs(server, hub, db, config);

  // matchmaking sweep every second
  const sweep = setInterval(() => {
    try {
      hub.sweep();
      // refresh queue positions for waiters
      for (const set of hub.conns.values()) {
        for (const c of set) {
          if (!c.roomId && hub.mm.has(c.userId)) {
            try {
              c.send({ type: 'queued', position: hub.mm.position(c.userId), window: hub.mm.windowFor(c.userId, Date.now()) });
            } catch { /* drop */ }
          }
        }
      }
    } catch (err) {
      console.error('[sweep]', (err as Error).message);
    }
  }, 1000);
  sweep.unref?.();

  // online-counter push every 5s (home screens)
  const statsPush = setInterval(() => {
    db.countPlayers()
      .then((registered) => hub.broadcastStats(registered))
      .catch(() => undefined);
  }, 5000);
  statsPush.unref?.();

  server.listen(config.port, () => {
    console.log(`[nkhondo] listening on :${config.port} (db=${db.kind})`);
  });

  // graceful deploys: stop queueing, finish live matches, then exit
  let shuttingDown = false;
  const shutdown = (sig: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[${sig}] draining — no new matches, finishing live ones`);
    clearInterval(sweep);
    clearInterval(statsPush);
    void hub.drainAndWait(240_000).then(async () => {
      try { server.close(); } catch { /* noop */ }
      await db.close().catch(() => undefined);
      console.log('[nkhondo] shutdown complete');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
