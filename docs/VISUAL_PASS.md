# Visual quality + readability pass

Icons frozen: `src/ui/cardArt.ts`, `CardIcon.tsx`, `MenuIcons.tsx`,
`src/assets/icons/*`, `public/icons.svg` untouched.

## 1. Opaque sphere over enemy king hut — FIXED
Source: `RainCloud` in `src/render/EffectsLayer.tsx` — a solid
`sphereGeometry(r*0.85)` at opacity 0.95 sat over the spell target.
Now: flattened cloud meshes at opacity 0.6/0.55 with `depthWrite:false`
(never blocks towers), 350 falling rain particles (spec 300–600),
animated splash ring, rain shaft, wet ground + puddles, and a blue
`wet` tint on units standing in rain/puddle (computed in
`BattleView.tsx`, rendered as emissive in `UnitMesh.tsx`).

## 2. Readability
- Scale audit `tools/scale-audit.ts` (hut tower 5.6 = 1.0): humanoid 0.348,
  mlonda 0.481, hyena 0.257 (species x1.8), goat 0.209 (species x1.5) —
  all inside ±20%. Run `npm run test:scale`.
- Every unit has a team ground ring (blue/red) + team trim with raised
  emissive (0.45–0.5) + existing rim light + blob shadow.
- HP bar appears only after first damage (pct<0.999) for all ground/air
  units incl. goats and hyenas (previously missing); towers always show bars.
- Silhouettes: Zikwanje BIG panga blade (0.72) with swing + sweep arc;
  Woweta staff + 4-legged goats with beard/collar; Mlonda enlarged shield;
  Afisi quadruped (4 legs, tail, snout, mane, spots both flanks).

## 3. Combat feedback
- Damage numbers: jittered, stacked upward, 0.8s fade, merge within 0.15s
  on same target (sums), max 3 per target, gold 26px for crits/spells.
- Towers: team-colour bars + HP number on bar (bucketed texture) + level
  badge; king bar larger (1.9 vs 1.5). White 80ms hit-flash on towers and
  units, dust puffs, projectile tracers, chips + shake on tower hits.
- Destruction: collapse animation, rubble, boom+dust, camera shake,
  slow-mo, HUD stars/crowns.

## 4. Layout
- Canvas fills viewport (`100dvh`, no letterbox); hand + elixir anchored
  bottom with spacing; elixir number 32px legible.
- Right side panel now labelled King/Left/Right with HP numbers
  (was unlabelled bars). Panels collapse under 1100px (unchanged).

## 5. Atmosphere + perf
- Warm afternoon sun (PCF-soft 2048 med/high, 512 low), hemisphere fill,
  ACES warm grading, sky-gradient dome, distant baobabs, water foam at banks.
- No SSAO/bloom passes (keeps 60fps); VFX glows via emissive. Low toggle
  disables shadows + lowers DPR.

## Verification
- `npm run build`, `npm run test:all`, `npm run test:scale` all pass.
- Screenshots: `shots/visual-menu.png`, `shots/visual-spell.png`
  (rain over king hut, towers visible through cloud), 
  `shots/visual-towerfall.png` (rubble + lead). Zero console errors.
- FPS: 4 rAF under SwiftShader CPU rendering (not representative);
  scene is <25k tris / <100 draw calls (instanced grass/reeds), VFX capped
  (110 fx, 24 floaters). Real-GPU 60fps at medium expected; field-measure
  on laptop/phone still to do.
- Not done: external CC0 GLB imports (manifest candidates logged),
  Mixamo retargets (procedural walk/swing used), Malawi field FPS test.
