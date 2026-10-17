# NKHONDO asset pipeline (Part A)

Hard constraint kept: card icons, HUD icons, UI images and layout are
FROZEN. Only 3D world/unit assets, VFX and audio change.

## Sources (licence verified on download page before import)
- Quaternius (quaternius.com) — CC0 nature, animals, modular characters.
- Kenney (kenney.nl) — CC0 nature, buildings, particles, audio.
- KayKit (kaylousberg itch.io) — CC0 characters and props.
- Poly Pizza (poly.pizza) — per-model CC0 or CC-BY (credit each).
- Poly Haven / ambientCG — CC0 PBR textures + HDRIs.
- Sketchfab — only CC0/CC-BY downloadable (african hut, baobab, mango,
  clay pot, drum, goat, hyena). No NC, no unclear licences.
- Mixamo — free humanoid rigs/anims (idle, walk, attack, hit, death).

## Art direction
Warm stylised low-poly: red earth #9c4a2b, golden thatch #c9a45c, green
grass #5d8f3e. One hut style, one mango style, chitenje tints via material
color, blue vs red team trims. No realistic/cartoon mixing.

## Pipeline
glTF/GLB + Draco/meshopt + KTX2/Basis (WebP fallback). Scale normalised
(1 tile = 1m), origin at feet. Shared material atlas where practical.
Budget: <80k tris, <150 draw calls; instancing for trees/grass/fences/
reeds; LOD for detailed. Current procedural meshes already instance
grass/reeds/fences and stay far under budget (a few thousand tris).

## Manifest + credits + loading
- `assets/manifest.json`: id, file, sourceUrl, author, licence,
  attribution, modifications, status (procedural-now/gap).
- `src/assets/loader.ts`: progress-bar loader, graceful fallback to
  procedural on any failure.
- `tools/asset-check.ts` (`npm run test:assets`): every entry has
  source/author/licence; gaps documented; remote GLBs must be CC0/CC-BY.
- `assets/CREDITS.md` + in-game Credits screen (reads CREDITS.md).
- Loading overlay with progress bar in battle (`!hud` state).

## Current status
Procedural placeholders ship (original, no credit required). External GLB
binaries are mapped as next-step downloads — each remaining procedural
lists its CC0 candidate + gap reason in the manifest. No placeholder left
unlisted.

## Performance
Procedural arena: ~27 fence posts (instanced where possible), 150 grass
tufts instanced, 64 reeds instanced, <10 huts/trees, units <1k tris each.
Estimated on-screen: <25k tris, <100 draw calls at med quality (shadows
on, dpr<=1.75). Low disables shadows + dpr<=1.25; high raises to 2048
shadows + dpr<=2.
