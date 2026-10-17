# NKHONDO — Online Play (server + deploy + protocol)

Frontend: static Vite build (Vercel). Game server: Node 20 + TypeScript,
REST + WebSocket in one process (`/server`), shared deterministic sim
(`/shared`). Region: Frankfurt (Render). DB: Neon Postgres (free tier).

## 1. Architecture

[Browser, Vercel static] --HTTPS/WSS--> [Render: nkhondo-server] --> [Neon Postgres]

- Client env (Vercel dashboard): `VITE_API_URL=https://<service>.onrender.com`,
  `VITE_WS_URL=wss://<service>.onrender.com/ws`. Unset = offline dev, old flows untouched.
- Server env: `DATABASE_URL` (Neon URL, dashboard), `JWT_SECRET` + `ADMIN_KEY`
  (generated), `ALLOWED_ORIGINS` (Vercel domain + localhost), `PORT` (Render sets it).
- No `DATABASE_URL` = in-memory store (dev/tests only).

## 2. Netcode (why it won't feel laggy)

Deterministic input-sync with server authority (`shared/` imported by both):

- Sim: fixed 20 ticks/s, seeded mulberry32 PRNG (+ per-deck shuffle streams),
  no `Math.random`/`Date.now` in sim. Positions are integer milli-tiles:
  the z-mirrored client computes bit-identical values, so strict comparisons
  (range/aggro/nearest ties) can never flip. Position rounding is
  mirror-symmetric round-half-even (`mround`). HP/energy stay float
  (identical ops both sides).
- Only INPUTS travel: `{type:"deploy", cardId, x, y, clientSeq}`. Server validates
  (hand, Mphamvu, tile, timing, rate, duplicate suppression) and replies
  `{type:"deployed", ..., executeTick = serverTick + 20}` (20 ticks = the 1.0s
  deploy countdown, absorbs ~500ms ping). Both sides apply at exactly
  `executeTick` (sorted by seq).
- Latency hiding: local ghost + countdown ring + sound play instantly on tap.
  Rejects remove the ghost and toast the reason (nothing was ever deducted).
- Clock: server sends `{type:"tick"}` every 5 ticks; client measures RTT with
  ping/pong and fast-forwards (max 300 ticks) if >10 behind.
- Desync safety: every 40 ticks clients send `stateHash()`; the server compares
  against canonical + team-flipped hashes, sends a full snapshot on mismatch
  and logs it. Tower ids are frame-dependent, so the hash normalizes them to
  `(owner, lane)` slots (mirror-aware).
- Bandwidth: a few hundred bytes/s of compact JSON.

## 3. Name-only login

First screen (when online is configured): enter name, Play. Rules: 3-16 chars
`[A-Za-z0-9_ ]`, trimmed, EN+Chichewa profanity filter
(`server/data/badwords.json`). Taken names get a 4-digit tag (`Bwana#4821`).
`POST /api/register` returns `{playerId, name, tag, token, recoveryCode}`;
token is HS256 JWT in `localStorage`. Recovery code (12 chars, scrypt-hashed
server-side) restores on another device (`POST /api/recover`). Rename once per
7 days. Rate limits: 5 registers/IP/hour, 20 WS msg/s/player, 1 deploy/200ms.

## 4. Elo / Zikho (`shared/elo.ts`, unit-tested)

Start 1000, floor 0. `expected = 1/(1+10^((opp-my)/400))`, K = 40 (<30 games),
24 (<2000), 16 above. Rating history per match (profile graph). Leaderboard
`GET /api/leaderboard?limit=100` + own rank. Arena unlocks: Mudzi 0, Msika 400,
Blantyre 800, Nyanja 1200, Tiyi 1600, Nyika 2000 (shown on Arenas screen;
AI matches are unranked and labelled).

## 5. Matchmaking

`{type:"queue", deck}` (server validates the deck, else starter). Rating window
+/-50, +50 per 5s, cap +/-400. After 30s: `ai_offer` for unranked AI or keep
waiting. Match: room `{matchId, seed, decks}` + `match_found` (own team, both
decks, foe name#tag + Zikho) and a 3s countdown, then `match_start`. Decks
shuffle with the match seed (deck-content-keyed streams, mirrors agree).
Cancel anytime.

## 6. Player count

Server tracks open sockets / queue / live rooms / registered. `GET /api/stats`
plus WS `stats` push every 5s. Home shows online count, in-battle count and
own rank.

## 7. Disconnects and fairness

- 20s reconnect window: match runs on, towers defend; reconnect gets a snapshot
  plus pending inputs and resumes. After 20s: forfeit (Elo applies).
- Server validates EVERYTHING; invalid-input strikes flagged in DB (`flags`),
  spammers kicked. Clients never trusted.
- Server decides the result, writes `matches` + `rating_history`, updates Elo,
  sends `match_end` (per-player deltas). Draws split 0.5/0.5.

## 8. Database

`server/src/migrations.ts` (`players`, `matches`, `rating_history`,
`schema_migrations`; index on `players(rating)`). `server/src/db.ts` interface
with `MemoryDb` (dev/tests) and `server/src/pgdb.ts` (Postgres via `pg`,
parameterized queries). Recovery codes scrypt-hashed, never plain.

## 9. Client UI (`src/net/online.ts`, `src/ui/onlineScreens.tsx`, `useOnlineBattle.tsx`)

Name entry (register/recover + one-time recovery code), profile (name#tag,
Zikho, W/L, rank, rating graph, rename, sign-out), leaderboard, matchmaking
(spinner, wait time, rating window, cancel, AI offer), home counter + ranked /
AI / leaderboard entries, in-battle ping (green <120ms, yellow <250ms, red),
opponent name#tag + Zikho, forfeit flag, Reconnecting bar, ranked results
with Zikho delta + rematch handshake.

## 10. Deployment

- Server (Render Blueprint `render.yaml`): `nkhondo-server`, Docker build
  (`server/Dockerfile`, repo-root context), Frankfurt, paid plan (never free),
  health check `/healthz`, `maxShutdownDelaySeconds: 240` (max 300). Graceful
  SIGTERM: stops queueing, tells clients, finishes matches (up to 4 min),
  saves, exits. Secrets via dashboard, never committed.
- Client (Vercel): static build only (`npm run build` gives `dist`), same
  `VITE_*` vars. A commented Render static-site alternative is in `render.yaml`.
- CORS: `ALLOWED_ORIGINS` only (+ localhost dev).
- Scale path (single instance now): in-memory queue/rooms are fine for one
  instance. Later: Render Key Value (Redis) for queue + online count, one
  instance per match routed by matchId, Postgres read replica for leaderboard.
- Logs: per-match lines + `[desync]` lines (room/user/tick). Admin:
  `GET /admin/stats` with `x-admin-key`.

## 11. Tests (all must pass)

- `npm run test:all` — client sim suites (incl. `tools/determinism.ts` and
  `tools/elo-test.ts`).
- `npm --prefix server run test` — REST smoke, lockstep mirror (3000 ticks),
  woweta mirror (goat offsets), full WS match (cheats, reconnect, rematch,
  Elo), latency (300ms + 2 percent loss).
- `npm --prefix server run test:load` — 100 bots, 50 parallel full matches.
- Measured here: loopback load 100 players gives 50 matches in ~29s wall,
  ~14k up / ~113k down messages, zero desyncs; latency ack p95 ~170ms
  (inside the 1s deploy window, feels instant).
- Malawi field test (ping on mobile data + any desyncs) still to do after
  deploy. Redeploy-during-match: SIGTERM drain keeps the match alive; verify
  on staging.

## Monorepo layout

- `/shared` — sim (`sim/`), `cards.json` (generate with `npm run cards:dump`),
  `protocol.ts` (message + REST types), `elo.ts`. Imported by both sides
  (client via relative import, server compiled in).
- `/server` — Node service (`src/`), `Dockerfile`, `tests/`, own
  `package.json`. Build with `npm run build` inside `server/`
  (emits `server/dist`, start with `node server/dist/server/src/index.js`).
- Client is the existing Vite app at the repo root (Vercel builds `dist`
  from root with `npm run build`). No `/client` folder move: same substance
  (shared sim imported by both, one deployable server app) without breaking
  every path.
