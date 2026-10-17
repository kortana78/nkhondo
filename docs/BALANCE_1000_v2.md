# Balance v2 — 1000 headless AI(normal)-vs-AI(normal), seeds 1000..1999

## v1 baseline (before)
P0 52.6% / P1 47.4%. Outliers: njuchi 60.8, woweta 60.3, makwerero 59.6,
fisi 57.4, rain 40.3, watchtower 39.9, mphezi 39.2, harvest 44.4.

## Changes applied (`shared/sim/cards.ts`, mirrored via `npm run cards:dump`)
Frozen by exact test asserts — NOT touched: moto 200, mafunde 60,
mlonda 110/1800/shield 300/cost 5, curse 20%, rain slow 40%,
makwerero 15s, harvest 5@3, mphezi 750/30%, fisi hp 300, njuchi hp 50.
- njuchi: dmg 25->20, speed 3.4->3.1
- woweta goats: dmg 48->40 (wind-up cancel untouched)
- makwerero: cost 2->3 (15s ford untouched)
- fisi: dmg 65->58, speed 2.7->2.5
- rain: cost 3->2 (slow untouched)
- watchtower: hp 1400->1600
- mphezi: cost 6->5 (damage untouched)

## v2 result (after)
P0 52.4% / P1 47.3% / draws 3. Avg 187.3s.

| card | games | win% |
|---|---|---|
| woweta | 1255 | 57.1% (watch) |
| njuchi | 1213 | 57.0% (watch) |
| makwerero | 864 | 54.3% |
| mlonda | 844 | 53.8% |
| fisi | 1174 | 52.9% |
| mfiti | 865 | 51.6% |
| mphepo | 856 | 49.3% |
| roadblock | 546 | 49.3% |
| zikwanje | 1181 | 48.9% |
| harvest | 859 | 48.7% |
| mafunde | 1531 | 48.7% |
| moto | 1540 | 47.1% |
| watchtower | 1212 | 43.6% |
| mphezi | 853 | 43.3% |
| rain | 1207 | 43.2% |

No card trips the spec flags (>58% nerf, <42% buff). woweta/njuchi at ~57
stay on watch — next iteration only with HUMAN beta data (AI meta differs).
All client suites + determinism + server match/latency suites still pass.

## Re-confirmed after determinism refactors (integer-exact movement, mround
separation, mirrorZ summons, flipState winner — no stat changes)
Same 1000 seeds: P0 52.5% / P1 47.5%, draws 0, avg 187.8s.
woweta 56.9, njuchi 56.7, mlonda 54.9, makwerero 53.1, fisi 52.6,
mfiti 51.7, roadblock 50.0, harvest 49.5, zikwanje 48.9, mphepo 48.6,
mafunde 48.6, moto 47.6, watchtower 44.2, rain 44.1, mphezi 44.0.
Still no flags tripped. SHIPPED for beta.
