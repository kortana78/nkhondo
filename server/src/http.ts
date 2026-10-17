// REST API on plain node:http (no framework): register/recover/rename,
// profile, leaderboard, stats, healthz, admin. CORS locked to ALLOWED_ORIGINS.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Config } from './config.js';
import type { Db, PlayerRow } from './db.js';
import {
  hashRecoveryCode, checkRecoveryCode, makeRecoveryCode, makeTag,
  signToken, validateName, verifyToken,
} from './auth.js';
import type {
  ErrorRes, LeaderboardRes, ProfileRes, RegisterRes,
} from '../../shared/protocol.js';

export interface HttpCtx {
  config: Config;
  db: Db;
  live: () => { online: number; inQueue: number; inBattle: number };
  registered: () => Promise<number>;
  adminStats: () => unknown;
}

const SEVEN_DAYS = 7 * 24 * 3600 * 1000;

function cors(ctx: HttpCtx, req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin;
  if (origin) {
    if (!ctx.config.allowedOrigins.includes(origin)) {
      res.writeHead(403, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'origin not allowed' } satisfies ErrorRes));
      return false;
    }
    res.setHeader('access-control-allow-origin', origin);
  }
  res.setHeader('vary', 'origin');
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,authorization,x-admin-key');
    res.setHeader('access-control-max-age', '86400');
    res.writeHead(204);
    res.end();
    return false;
  }
  return true;
}

function json(res: ServerResponse, code: number, body: unknown): void {
  res.setHeader('content-type', 'application/json');
  res.writeHead(code);
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((res, rej) => {
    let n = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      n += c.length;
      if (n > limit) { rej(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => res(Buffer.concat(chunks).toString('utf8')));
    req.on('error', rej);
  });
}

async function authed(ctx: HttpCtx, req: IncomingMessage): Promise<PlayerRow | null> {
  const h = req.headers.authorization ?? '';
  const m = /^Bearer (.+)$/.exec(h);
  if (!m) return null;
  const payload = verifyToken(ctx.config.jwtSecret, m[1]);
  if (!payload) return null;
  const row = await ctx.db.findPlayerById(payload.sub);
  if (!row || row.tokenVersion !== payload.v) return null;
  return row;
}

function profileOf(row: PlayerRow, rank: number, history: { matchId: string; rating: number; at: number }[]): ProfileRes {
  return {
    playerId: row.id, name: row.name, tag: row.tag, rating: row.rating,
    games: row.games, wins: row.wins, losses: row.losses, rank,
    history: history.map((p) => ({ matchId: p.matchId, rating: p.rating, at: new Date(p.at).toISOString() })),
  };
}

export function createHandler(ctx: HttpCtx) {
  // register rate limit: 5 per IP per hour
  const regHits = new Map<string, number[]>();
  setInterval(() => {
    const cutoff = Date.now() - 3600_000;
    for (const [ip, ts] of regHits) {
      const kept = ts.filter((t) => t > cutoff);
      if (kept.length === 0) regHits.delete(ip);
      else regHits.set(ip, kept);
    }
  }, 60_000).unref?.();

  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!cors(ctx, req, res)) return;
      const url = new URL(req.url ?? '/', 'http://x');
      const path = url.pathname;
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
        || req.socket.remoteAddress || 'unknown';

      if (req.method === 'GET' && path === '/healthz') {
        return json(res, 200, { ok: true, db: ctx.db.kind });
      }

      if (req.method === 'POST' && path === '/api/register') {
        const now = Date.now();
        const hits = (regHits.get(ip) ?? []).filter((t) => t > now - 3600_000);
        if (hits.length >= 5) return json(res, 429, { error: 'too many registrations, try later' } satisfies ErrorRes);
        hits.push(now);
        regHits.set(ip, hits);
        let body: { name?: unknown };
        try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' } satisfies ErrorRes); }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const err = validateName(name);
        if (err) return json(res, 400, { error: `invalid name: ${err}` } satisfies ErrorRes);
        const taken = await ctx.db.findPlayerByName(name);
        const tag = taken.length > 0 ? makeTag() : '0000';
        // ensure (name, tag) unique
        let finalTag = tag;
        if (taken.some((p) => p.tag === finalTag)) finalTag = makeTag();
        const recoveryCode = makeRecoveryCode();
        const row = await ctx.db.createPlayer({
          name, tag: finalTag, recoveryHash: await hashRecoveryCode(recoveryCode),
        });
        const token = signToken(ctx.config.jwtSecret, row.id, row.tokenVersion);
        const out: RegisterRes = { playerId: row.id, name, tag: finalTag, token, recoveryCode };
        return json(res, 200, out);
      }

      if (req.method === 'POST' && path === '/api/recover') {
        let body: { code?: unknown };
        try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' } satisfies ErrorRes); }
        if (typeof body.code !== 'string') return json(res, 400, { error: 'missing code' } satisfies ErrorRes);
        const row = await ctx.db.findPlayerByRecoveryHash((h) => checkRecoveryCode(body.code as string, h));
        if (!row) return json(res, 404, { error: 'unknown recovery code' } satisfies ErrorRes);
        await ctx.db.touchSeen(row.id);
        return json(res, 200, {
          playerId: row.id, name: row.name, tag: row.tag,
          token: signToken(ctx.config.jwtSecret, row.id, row.tokenVersion),
        });
      }

      if (req.method === 'GET' && path === '/api/me') {
        const row = await authed(ctx, req);
        if (!row) return json(res, 401, { error: 'unauthorized' } satisfies ErrorRes);
        const [rank, history] = await Promise.all([
          ctx.db.rankOf(row.id), ctx.db.history(row.id, 20),
        ]);
        return json(res, 200, profileOf(row, rank, history));
      }

      if (req.method === 'POST' && path === '/api/rename') {
        const row = await authed(ctx, req);
        if (!row) return json(res, 401, { error: 'unauthorized' } satisfies ErrorRes);
        if (row.lastRename > 0 && Date.now() - row.lastRename < SEVEN_DAYS) {
          return json(res, 429, { error: 'name can change once every 7 days' } satisfies ErrorRes);
        }
        let body: { name?: unknown };
        try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, { error: 'bad json' } satisfies ErrorRes); }
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const err = validateName(name);
        if (err) return json(res, 400, { error: `invalid name: ${err}` } satisfies ErrorRes);
        const taken = (await ctx.db.findPlayerByName(name)).filter((p) => p.id !== row.id);
        let tag = row.tag;
        if (taken.some((p) => p.tag === tag)) tag = makeTag();
        const updated = await ctx.db.rename(row.id, name, tag);
        return json(res, 200, { name: updated.name, tag: updated.tag });
      }

      if (req.method === 'GET' && path === '/api/leaderboard') {
        const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? 100)));
        const row = await authed(ctx, req).catch(() => null);
        const top = await ctx.db.leaderboard(limit);
        let you: LeaderboardRes['you'] = null;
        if (row) {
          const rank = await ctx.db.rankOf(row.id);
          you = { name: row.name, tag: row.tag, rating: row.rating, games: row.games, wins: row.wins, rank };
        }
        const out: LeaderboardRes = {
          top: top.map((p) => ({ name: p.name, tag: p.tag, rating: p.rating, games: p.games, wins: p.wins })),
          you,
        };
        return json(res, 200, out);
      }

      if (req.method === 'GET' && path === '/api/stats') {
        return json(res, 200, { ...ctx.live(), registered: await ctx.registered() });
      }

      if (req.method === 'GET' && path === '/admin/stats') {
        if (!ctx.config.adminKey || req.headers['x-admin-key'] !== ctx.config.adminKey) {
          return json(res, 403, { error: 'forbidden' } satisfies ErrorRes);
        }
        return json(res, 200, ctx.adminStats());
      }

      return json(res, 404, { error: 'not found' } satisfies ErrorRes);
    } catch (err) {
      console.error('[http]', (err as Error).message);
      try { json(res, 500, { error: 'internal' } satisfies ErrorRes); } catch { /* closed */ }
    }
  };
}

