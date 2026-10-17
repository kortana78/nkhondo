# NKHONDO — Root Cause Diagnosis (Part 1)

Date: 2026-10-08
Debug overlay: press F1 (desktop) or 3-finger tap (mobile) in battle.
Shows: last pointer (type/x/y/target), raycast (hit/world/tile), selected card + energy,
deploy validation + reason, sim tick + unit count, last 10 combat events.

## Repro (before fix)
- `?s=battle&empty=1` (no AI), tap card center (e.g. 56,836) then arena (240,620):
  tap-tap DID deploy (energy dropped), drag-drop via mouse also deployed.
- Earlier `diag-touch.mjs` tapped (120,780) — 2px above the card top (cards at y782-890)
  so `armed=0`. That miss looked like "tap-tap never works".
- Touch tap on ground at y inside `.hud-bottom` (y734-900) never reached canvas.

## Likely causes 1-7 — verdict

1. **HUD overlay swallows clicks — TRUE (main deploy blocker).**
   - `.hud-top` already `pointer-events:none` (only `.iconbtn` auto) — OK.
   - `.floaters` already `none` — OK.
   - `.hud-bottom` had NO `pointer-events` rule → default `auto`, covering bottom
     ~166px with a gradient background. Own-half deploy zone (player side, near
     camera) projects to the bottom of the screen, i.e. under this div.
     Taps there hit the div, never the WebGL canvas, so no `onTap` / `screenToSim`.
   - Fix: `.hud-bottom{pointer-events:none}` + `auto` only on `.gcard/.nextcard/button`.

2. **Raycast wrong coords — FALSE.**
   - `screenToSim()` uses `el.getBoundingClientRect()` + NDC + correct camera +
     ground plane y=0. `onTap` uses `e.point` inverse of `WX/WZ`
     (`x=wx+9, z=16-wz`). Both match `world.tsx` (`WX=x-9, WZ=16-z`).
   - Verified: same tap that arms a card deploys when ray hits (energy drops).

3. **Touch vs mouse — FALSE (already correct).**
   - Only Pointer Events (`onPointerDown`, `pointermove/up`). No `click`+`touchstart` mix.
   - `touch-action:none` on `.arena-wrap canvas` and `.gcard`. Good for mouse,
     touch, and mobile emulation identically.

4. **Card selection lost — PARTIAL (UX, not state loss).**
   - Selection lives in `BattleScreen` (`selected` + `dragRef` sync mirror) — not
     lost. `startDrag` clears then sets on `pointerup`; ground `onTap` guard
     `if (props.drag) return` is intentional (drag uses window `pointerup` path).
   - Real issue: no feedback on reject. `onTap` calls
     `assistDeploy(..., quiet=true)` then falls back to `hints[0]`; on failure only
     `sfx.error()`. No red X, no reason toast, so invalid taps feel like "nothing".
   - Also second-tap-on-card smart-casts to `hints[0]`, which can surprise.

5. **World→grid conversion — FALSE.**
   - `WX/WZ` inverse verified. `inArena/ownHalf/inRiver` use sim coords directly.
     `canDeploy` rejects correctly (`half/river/arena`), not every tile.

6. **Deploy never reaches sim — FALSE.**
   - `assistDeploy` → `b.deploy` directly (no queue), energy check uses
     `battle.energy[0]`, hand cycles 4→4. Empty-mode test: energy 5→1 on Moto.
   - Sim `verify.ts` all 25 checks pass, including deploy/energy/hand.

7. **Units spawn but never attack — PARTIAL (feedback gap, sim OK).**
   - Sim ticks (20/s, `acc` accumulator, `viewApi.debug.tick` increases unless
     `viewApi.frozen`). Targeting (`aggro` 5.5-6.5), attack cycle
     (anticipation 5 ticks → strike → 10-tick cycle), `damageUnit/damageTower`
     all work — `verify.ts` proves chief activates, towers fall, 20/20 matches end.
   - Render gaps that read as "no damage":
     a) `hit` FX + `sfx.hit()` only when `dmg>=120`. Most unit hits are 30-110 → silent, no flash, no floater.
     b) Floaters only for tower hits + kills. Unit-vs-unit damage numbers missing.
     c) `UnitMesh` hit flash broken: `flash.current` mutated in `useFrame` but
        `flashColor` computed at render time → never re-renders white.
     d) No ghost/white lag bar, no smooth drain, no projectiles (tower arrows,
        Msodzi net arc instant), no hit-stop, no knockback slide.
   - Fix in Part 3: flash via material emissive in `useFrame`, pooled numbers for
     every hit (yellow big for crit/charge), hit-stop 40-60ms heavy only,
     projectiles, death poof+silhouette, tower chips/shake/cracks/smoke/collapse,
     camera shake big-only, layered pitch-varied sound.

## What changed (Part 1)
- `src/render/BattleView.tsx`: `viewApi.debug` (tick/unitCount/lastCombat/pointer/ray),
  combat log keeps last 10 `hit/miss/death/charge/net/knock` with `a→b, dmg, hpAfter`.
- `src/ui/DebugOverlay.tsx` (new): F1 + 3-finger toggle, pointer/ray/selected/
  energy/deploy-reason/tick/units/combat. `recordPointer()` called on
  `pointerdown/move/up`.
- `src/ui/BattleScreen.tsx`: wires debug listeners + overlay.
- `src/index.css`: `.hud-bottom{pointer-events:none}`, `auto` only on cards/buttons.
