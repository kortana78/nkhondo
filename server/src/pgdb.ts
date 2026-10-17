// Postgres implementation of Db (Neon/Supabase/Render Postgres).
// Used when DATABASE_URL is set; otherwise the server runs on MemoryDb.
import pg from 'pg';
import { MIGRATION_001 } from './migrations.js';
import type { Db, MatchRow, PlayerCreate, PlayerRow, RatingPoint } from './db.js';

// Re-exported row-with-rank type for convenience.
export type { Db };
export type LeaderboardRow = PlayerRow & { rank: number };

function toRow(r: pg.QueryResultRow): PlayerRow {
  return {
    id: r.id as string,
    name: r.name as string,
    tag: r.tag as string,
    tokenVersion: r.token_version as number,
    recoveryHash: (r.recovery_hash as string | null) ?? null,
    rating: r.rating as number,
    games: r.games as number,
    wins: r.wins as number,
    losses: r.losses as number,
    lastRename: r.last_rename ? Date.parse(r.last_rename as string) : 0,
    flags: r.flags as number,
    createdAt: Date.parse(r.created_at as string),
    lastSeen: Date.parse(r.last_seen as string),
  };
}

export class PgDb implements Db {
  kind = 'pg';
  private pool: pg.Pool;

  constructor(url: string) {
    this.pool = new pg.Pool({
      connectionString: url,
      ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false },
      max: 10,
    });
  }

  async migrate(): Promise<void> {
    const c = await this.pool.connect();
    try {
      await c.query(MIGRATION_001);
      await c.query(
        `insert into schema_migrations (version) values ('001') on conflict do nothing`
      );
    } finally {
      c.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async createPlayer(p: PlayerCreate): Promise<PlayerRow> {
    const r = await this.pool.query(
      `insert into players (id, name, tag, recovery_hash)
       values (gen_random_uuid(), $1, $2, $3) returning *`,
      [p.name, p.tag, p.recoveryHash]
    );
    return toRow(r.rows[0]);
  }

  async findPlayerById(id: string): Promise<PlayerRow | null> {
    const r = await this.pool.query(`select * from players where id = $1`, [id]);
    return r.rows.length ? toRow(r.rows[0]) : null;
  }

  async findPlayerByName(name: string): Promise<PlayerRow[]> {
    const r = await this.pool.query(`select * from players where lower(name) = lower($1)`, [name]);
    return r.rows.map(toRow);
  }

  async findPlayerByRecoveryHash(check: (hash: string) => Promise<boolean>): Promise<PlayerRow | null> {
    // Recovery codes are opaque: scan hashes and compare in app code.
    // (Player counts are small on the free tier; revisit with a lookup column if needed.)
    const r = await this.pool.query(`select * from players where recovery_hash is not null`);
    for (const row of r.rows) {
      if (await check(row.recovery_hash as string)) return toRow(row);
    }
    return null;
  }

  async touchSeen(id: string): Promise<void> {
    await this.pool.query(`update players set last_seen = now() where id = $1`, [id]);
  }

  async updateRating(id: string, rating: number, won: boolean, drawn: boolean): Promise<PlayerRow> {
    const r = await this.pool.query(
      `update players set rating = $2, games = games + 1,
        wins = wins + case when $3 then 1 else 0 end,
        losses = losses + case when $4 then 0 else case when $3 then 0 else 1 end end,
        last_seen = now() where id = $1 returning *`,
      [id, rating, won, drawn]
    );
    if (!r.rows.length) throw new Error('no such player');
    return toRow(r.rows[0]);
  }

  async rename(id: string, name: string, tag: string): Promise<PlayerRow> {
    const r = await this.pool.query(
      `update players set name = $2, tag = $3, last_rename = now() where id = $1 returning *`,
      [id, name, tag]
    );
    if (!r.rows.length) throw new Error('no such player');
    return toRow(r.rows[0]);
  }

  async addFlag(id: string): Promise<number> {
    const r = await this.pool.query(
      `update players set flags = flags + 1 where id = $1 returning flags`, [id]
    );
    return r.rows.length ? (r.rows[0].flags as number) : 0;
  }

  async leaderboard(limit: number): Promise<LeaderboardRow[]> {
    const r = await this.pool.query(
      `select *, row_number() over (order by rating desc, created_at asc) as rank
       from players order by rating desc, created_at asc limit $1`, [limit]
    );
    return r.rows.map((row) => ({ ...toRow(row), rank: Number(row.rank) }));
  }

  async rankOf(id: string): Promise<number> {
    const r = await this.pool.query(
      `select count(*)::int + 1 as rank from players p1
       where (select rating from players where id = $1) < p1.rating`, [id]
    );
    return r.rows.length ? (r.rows[0].rank as number) : 0;
  }

  async countPlayers(): Promise<number> {
    const r = await this.pool.query(`select count(*)::int as n from players`);
    return r.rows[0].n as number;
  }

  async recordMatch(m: Omit<MatchRow, 'createdAt'>): Promise<void> {
    await this.pool.query(
      `insert into matches (id, p1, p2, winner, p1_rating_before, p2_rating_before,
        p1_delta, p2_delta, towers_p1, towers_p2, duration_s, ended_reason)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [m.id, m.p1, m.p2, m.winner, m.p1RatingBefore, m.p2RatingBefore,
       m.p1Delta, m.p2Delta, m.towersP1, m.towersP2, m.durationS, m.endedReason]
    );
  }

  async addHistory(playerId: string, matchId: string, ratingAfter: number): Promise<void> {
    await this.pool.query(
      `insert into rating_history (player_id, match_id, rating_after)
       values ($1,$2,$3) on conflict do nothing`, [playerId, matchId, ratingAfter]
    );
  }

  async history(playerId: string, limit: number): Promise<RatingPoint[]> {
    const r = await this.pool.query(
      `select match_id as "matchId", rating_after as rating,
        extract(epoch from created_at)::bigint * 1000 as at
       from rating_history where player_id = $1 order by created_at desc limit $2`,
      [playerId, limit]
    );
    return (r.rows as RatingPoint[]).reverse();
  }
}
