# Suggested next milestone (after this placement + pipeline fix)

1. Import first GLB batch (CC0, licence verified on page): Quaternius hyena +
   goat, KayKit herder/guard/fighter, Kenney particle textures, Poly Haven
   water/earth. Wire through `src/assets/loader.ts`, keep procedural fallback.
2. Apply balance tweaks from `docs/BALANCE_200.md`, re-run 1000-match sim.
3. Mixamo idle/walk/attack/hit/death retargets for the 4 humanoids; verify
   wind-up (5 ticks) matches animation impact frames.
4. Emotes + Chichewa voice lines (EN subtitles) as an overlay that does NOT
   move existing cards/HUD (hard constraint).
5. Malawi field test: mobile-data ping + desync log review after deploy.
   (Do NOT deploy yet per Part C; interfaces documented in `docs/ONLINE.md`.)
