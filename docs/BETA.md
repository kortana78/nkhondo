# Offline-only friends beta (no ranked yet)

Goal: real-device fun + FPS reports before any public/ranked launch.

## 1. Env (offline forced)
Deploy the static client with NO `VITE_API_URL` and NO `VITE_WS_URL`.
`onlineEnabled()` (src/net/online.ts) is false when either is unset, and
the app degrades to title -> home -> deck -> battle(vs AI) -> results.
Nothing phones home. CORS needs nothing (no API calls are made).

Vercel dashboard: leave both vars UNSET for the beta project. Do NOT copy
staging env vars into it.

## 2. Build + local verify
```
npm run build
npx vite preview --port 4173 --strictPort
node tools/beta-smoke.mjs http://localhost:4173
```
Expect `BETA SMOKE PASSED` and zero console errors. The rAF number it
prints is SwiftShader CPU rendering — ignore it locally; real numbers come
from testers (step 4).

## 3. Deploy (Vercel static)
- New Vercel project from this repo, framework Vite, build `npm run build`,
  output `dist`. No env vars.
- Share the URL + the tester brief (step 4) with 5–10 friends (mix Android
  + desktop, ideally one Malawi mobile-data user).

## 4. Tester brief (copy/paste)
1. Open the link, tap BATTLE, play 3 AI matches (any difficulty).
2. Try: drag-drop AND tap-tap deploy; a spell; pause/resume; rematch.
3. Press F1 (desktop) or 3-finger tap (mobile) mid-battle and report the
   `fps=` number + your quality setting (Settings: Low/Med/High) +
   device + network (WiFi/mobile data).
4. Report: any `Invalid` that felt wrong, any unit you couldn't identify,
   any tower you couldn't see, fun rating 1–5.

## 5. Pass bar for public next step
- 0 console errors in smoke + no tester-reported hard blocks.
- Median reported fps >= 50 at Med; Low fixes the rest.
- woweta/njuchi watch (57% AI) confirmed or denied by HUMAN results.
