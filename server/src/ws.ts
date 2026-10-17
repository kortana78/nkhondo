// WebSocket server: auth-by-token, matchmaking + live-match routing,
// rate limits, heartbeats, reconnects. REST lives in http.ts.
import type { IncomingMessage } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_MSG_PER_SEC, type ClientMsg, type ServerMsg } from '../../shared/protocol.js';
import { verifyToken } from './auth.js';
import type { Db } from './db.js';
import { Hub, type Conn } from './hub.js';
import type { Config } from './config.js';

const MAX_STRIKES = 5;

export function attachWs(server: import('node:http').Server, hub: Hub, db: Db, config: Config): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });

  // heartbeat: ping every 25s, drop connections silent for >60s
  const hb = setInterval(() => {
    const now = Date.now();
    wss.clients.forEach((ws) => {
      const c = (ws as WebSocket & { __conn?: Conn }).__conn;
      if (!c) return;
      if (!c.alive) { try { c.ws.terminate(); } catch { /* noop */ } return; }
      if (now - c.lastPong > 60_000) { try { c.ws.terminate(); } catch { /* noop */ } return; }
      c.alive = false;
      try { c.ws.ping(); } catch { /* noop */ }
    });
  }, 25_000);
  hb.unref?.();
  wss.on('close', () => clearInterval(hb));

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    void handleConnection(ws, req, hub, db, config).catch((err) => {
      console.error('[ws] connection failed:', (err as Error).message);
      try { ws.close(4400, 'auth failed'); } catch { /* noop */ }
    });
  });

  return wss;
}

async function handleConnection(ws: WebSocket, req: IncomingMessage, hub: Hub, db: Db, config: Config): Promise<void> {
  const url = new URL(req.url ?? '/ws', 'http://x');
  const token = url.searchParams.get('token') ?? '';
  const payload = verifyToken(config.jwtSecret, token);
  if (!payload) { ws.close(4401, 'bad token'); return; }
  const row = await db.findPlayerById(payload.sub);
  if (!row || row.tokenVersion !== payload.v) { ws.close(4401, 'unknown player'); return; }
  await db.touchSeen(row.id).catch(() => undefined);

  const conn: Conn = {
    ws, userId: row.id, row, roomId: null, msgTimes: [], strikes: 0,
    lastPong: Date.now(), alive: true,
    send: (m: ServerMsg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
    },
  };
  (ws as WebSocket & { __conn?: Conn }).__conn = conn;
  // ws-level pong for the heartbeat above
  ws.on('pong', () => {
    conn.alive = true;
    conn.lastPong = Date.now();
  });

  hub.addConn(conn);
  pushStats(hub, db);

  // reattach to a live match (reconnect within the window)
  const live = hub.roomOfUser(row.id);
  if (live && live.onReconnect(row.id, conn)) {
    conn.roomId = live.id;
  }

  ws.on('message', (data) => {
    void onMessage(conn, data, hub, db).catch((err) => {
      console.error('[ws] msg failed:', (err as Error).message);
    });
  });

  const cleanup = () => {
    hub.removeConn(conn);
    if (conn.roomId) {
      const room = hub.rooms.get(conn.roomId);
      // only mark disconnected if NO other socket of this player is in the room
      const stillHere = hub.socketsOf(conn.userId).some((c) => c.roomId === conn.roomId);
      if (room && !stillHere) room.onDisconnect(conn.userId);
    } else {
      hub.dequeue(conn.userId);
    }
    pushStats(hub, db);
  };
  ws.on('close', cleanup);
  ws.on('error', () => { try { ws.close(); } catch { /* noop */ } });
}

async function pushStats(hub: Hub, db: Db): Promise<void> {
  try {
    hub.broadcastStats(await db.countPlayers());
  } catch { /* noop */ }
}

async function onMessage(conn: Conn, data: unknown, hub: Hub, db: Db): Promise<void> {
  const now = Date.now();
  conn.msgTimes = conn.msgTimes.filter((t) => t > now - 1000);
  conn.msgTimes.push(now);
  if (conn.msgTimes.length > MAX_MSG_PER_SEC) {
    conn.strikes++;
    if (conn.strikes > MAX_STRIKES) {
      await db.addFlag(conn.userId).catch(() => 0);
      try { conn.ws.close(4409, 'rate limited'); } catch { /* noop */ }
      return;
    }
    conn.send({ type: 'error', message: 'too fast — slow down' });
    return;
  }

  let msg: ClientMsg;
  try {
    const parsed: unknown = JSON.parse(String(data));
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as { type: unknown }).type !== 'string') throw new Error('bad shape');
    msg = parsed as ClientMsg;
  } catch {
    conn.send({ type: 'error', message: 'bad message' });
    return;
  }

  switch (msg.type) {
    case 'queue': {
      const row = await db.findPlayerById(conn.userId);
      if (!row) break;
      conn.row = row;
      const res = hub.enqueue(conn.userId, row, (msg as { deck?: unknown }).deck);
      if ('error' in res) conn.send({ type: 'error', message: res.error });
      else {
        conn.roomId = null;
        conn.send({ type: 'queued', position: res.position, window: res.window });
      }
      void pushStats(hub, db);
      break;
    }
    case 'dequeue': {
      hub.dequeue(conn.userId);
      void pushStats(hub, db);
      break;
    }
    case 'deploy': {
      const room = conn.roomId ? hub.rooms.get(conn.roomId) : hub.roomOfUser(conn.userId);
      if (!room) { conn.send({ type: 'rejected', clientSeq: msg.clientSeq, reason: 'over' }); break; }
      conn.roomId = room.id;
      const ack = room.submitDeploy(conn.userId, msg.cardId, msg.x, msg.z, msg.clientSeq);
      if (ack.type === 'rejected') {
        conn.send(ack);
        // count cheat-ish rejects (not plain rate/over rejects)
        if (ack.reason !== 'rate' && ack.reason !== 'over') {
          const slot = room.slots.find((s) => s.userId === conn.userId);
          if (slot && slot.invalidStrikes > 0 && slot.invalidStrikes % 10 === 0) {
            const flags = await db.addFlag(conn.userId).catch(() => 0);
            if (flags > 5 || slot.invalidStrikes > 30) {
              try { conn.ws.close(4409, 'invalid inputs'); } catch { /* noop */ }
            }
          }
        }
      }
      // 'deployed' is already broadcast to the room by submitDeploy
      break;
    }
    case 'hash': {
      const room = conn.roomId ? hub.rooms.get(conn.roomId) : null;
      room?.onHash(conn.userId, msg.tick, msg.hash);
      break;
    }
    case 'pong': {
      conn.lastPong = Date.now();
      conn.send({ type: 'pong', t: typeof msg.t === 'number' ? msg.t : 0 });
      break;
    }
    case 'rematch': {
      hub.rematch(conn.userId);
      break;
    }
    case 'rematch_accept': {
      hub.rematch(conn.userId);
      break;
    }
    case 'abandon': {
      const room = conn.roomId ? hub.rooms.get(conn.roomId) : hub.roomOfUser(conn.userId);
      room?.abandon(conn.userId);
      conn.roomId = null;
      break;
    }
    default: {
      conn.send({ type: 'error', message: 'unknown message' });
    }
  }
}

