# Placement fix — cards valid where necessary, never invalid everywhere

## Symptom
Dragging/tapping a card showed red/invalid on every tile, even on the
player's own half where troops must deploy.

## Root causes found
1. `nudgeDeploy()` teleported far: exact spot failed -> tried fixed
   `[x,14.2]...[9,12]` slots. Near-miss drops on own half (x outside by
   0.2, z=0.2 bottom edge) jumped across the map instead of clamping.
   Enemy-half drops also teleported instead of staying invalid.
2. `BattleScreen` drop handler had inverted screen-half logic:
   `e.clientY < midY` treated the TOP (enemy side) as own side. Own-side
   near-misses got no nudge and showed `Invalid: arena/half`; enemy-side
   drops got a cross-map teleport attempt.
3. `BattleView` tap handler fell back to `hints[0]` after any failure, so
   the preview (red) did not match where the card landed (teleport).
4. Offline `Battle`/`AI` memos depended only on `props.online`, so deck /
   difficulty edits and rematches could reuse a stale `over=true` sim
   (`canDeploy` -> `over` = invalid everywhere).

## Fix
- `shared/sim/battle.ts:nudgeDeploy`: exact first; troops/buildings only
  nudge when already on the player's own side (team0 z<15, team1 z>17).
  Clamp x to 0.5..17.5 and z to own half (0.5..14.5 / 17.5..31.5), snapped
  to 0.5. Enemy-side + river return null (stay invalid). Spells clamp to
  the arena. Server authority uses the same function.
- `src/ui/BattleScreen.tsx`: drop always tries forgiving `doDeploy`
  (exact+nudge); `energy` -> shake+toast, `over/hand/card` -> toast,
  else `Invalid: half/river/arena` only when truly illegal. Removed the
  inverted `midY` gate.
- `src/render/BattleView.tsx`: tap uses exact+nudge only, no teleport to
  hints; red X + reason toast on failure. Added `matchKey` prop, deck +
  difficulty deps, `Scene` key reset, `viewApi.frozen=false` on fresh sim.
- Loading overlay with progress bar while `!hud` (procedural fallback
  ready). No card/HUD icons or layout changed.

## Rules (unchanged, now enforced correctly)
- Troops/buildings: own half only (team0 z<15, team1 z>17), not river,
  inside 0.5..17.5 x 0.5..31.5. Green preview + drop lands there.
- Spells: anywhere inside the arena (roadblock not in river off-bridge).
- No energy -> shake + "Not enough mphamvu". Match over -> "Match over".

## Verify
- `npm run verify` (deploy rules), `npm run test:all` (incl. asset check).
- Manual: tap card -> own half shows green tint + markers; drop on own
  half deploys + energy drops; drop on enemy half with troops shows
  `Invalid: half`; spells drop anywhere.
