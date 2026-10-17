# Public launch checklist (ranked comes LAST)

## A. Done in repo (verify with one command each)
- [x] Balance v2: 1000-match AI sim, no card outside 58/42 (docs/BALANCE_1000_v2.md)
- [x] `npm run test:all` (sim, part5, roster, determinism, elo, assets)
- [x] `npm run test:scale` (reference-scale audit)
- [x] `npm --prefix server run test` (REST, mirror, woweta, match, latency,
      + 12-seed full-match mirror sweep `server/tests/sweep.ts`)
- [x] `npm --prefix server run test:load` — 100 bots, 50 parallel full
      matches, ~114k msgs, ZERO desyncs, Elo recorded
- [x] `server/package.json` was invalid JSON (trailing comma) — FIXED
- [x] Netcode determinism bugs FIXED (were causing load-test desyncs):
      mfiti owl summons now mirror-aware (`mirrorZ`, wired in client +
      harnesses); all position writes integer-exact (`mround` displacement);
      separation uses sign-symmetric rounding; `flipState` maps winner.
      Proof: sweep 12/12 full matches bit-identical + load 0 desyncs.
- [x] Beta smoke `node tools/beta-smoke.mjs <URL>` + tester FPS brief (docs/BETA.md)
- [x] In-game FPS in F1 overlay for tester reports
- [x] Chichewa review pack generated (docs/CHICHEWA_REVIEW.md) — HUMAN review still open

## B. Staging (needs humans + paid infra, cannot be done in this repo)
- [ ] `npm --prefix server run test:load` (100 bots / 50 parallel matches, ~30s)
- [ ] Render paid web service (Frankfurt, 1c-2g — free tier sleeps) + Neon
      Postgres `DATABASE_URL` + generated `JWT_SECRET`/`ADMIN_KEY` in dashboard
- [ ] Vercel staging project WITH `VITE_API_URL` + `VITE_WS_URL`; `ALLOWED_ORIGINS`
      must list the exact staging domain (render.yaml still points at the placeholder)
- [ ] Ranked playtest group (10–20): matchmaking, reconnect (20s window),
      rematch handshake, Elo deltas, leaderboard, online counter
- [ ] Malawi mobile-data test: note ping + any `[desync]` server lines
- [ ] Redeploy-during-match: SIGTERM drain keeps match alive (max 300s cap)
- [ ] `GET /admin/stats` with `x-admin-key` reachable; per-match + desync logs reviewed

## C. Pre-release (humans)
- [ ] Chichewa review signed off (docs/CHICHEWA_REVIEW.md filled)
- [ ] External CC0/CC-BY GLB + Mixamo batch imported via `src/assets/loader.ts`,
      licences verified on download pages, manifest + CREDITS.md updated
- [ ] Privacy/takedown note for name-only login (names + tags are public on leaderboard)
- [ ] Store/listing screenshots from a real device (not SwiftShader)

## D. Launch day
- [ ] Vercel production WITH env vars, smoke test against the live URL
- [ ] Announce as open beta first; keep AI-only fallback if the server ever goes down
