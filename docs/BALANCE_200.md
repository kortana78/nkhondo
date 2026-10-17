# Balance — 200 headless AI(normal)-vs-AI(normal)

Command: `npm run sim:200` (seeds 1000..1199)
Date run: 2026-10-16. No stat changes applied in this milestone (record only).

P0 wins 109 (54.5%), P1 91 (45.5%), draws 0. Avg match 185.1s. Sim 22 matches/s.

| card | games | win% in winning deck | flag |
|---|---|---|---|
| makwerero | 169 | 64.5% | NERF? |
| njuchi | 232 | 61.2% | NERF? |
| woweta | 253 | 60.9% | NERF? |
| roadblock | 103 | 59.2% | NERF? |
| fisi | 232 | 59.1% | NERF? |
| mphepo | 171 | 55.0% | watch |
| zikwanje | 249 | 48.6% | ok |
| mfiti | 168 | 48.2% | ok |
| mafunde | 304 | 47.4% | ok |
| moto | 310 | 47.1% | ok |
| mlonda | 169 | 46.7% | ok |
| harvest | 175 | 45.1% | watch |
| mphezi | 177 | 38.4% | BUFF? |
| watchtower | 249 | 38.2% | BUFF? |
| rain | 239 | 37.7% | BUFF? |

Guide: 47-53% ideal. >55% nerf candidate, <45% buff candidate.

Suggested next balance pass (not applied here to keep deterministic tests green):
- makwerero: ford 15s -> 12s; njuchi: hp 50 -> 42; woweta goats dmg 48 -> 42;
  roadblock hp 650 -> 550; fisi dmg 65 -> 60.
- mphezi: 750 -> 800 (tower 225 -> 240) or cost 6 -> 5; watchtower hp 1400 -> 1550;
  rain slow 40% -> 45% or cost 3 -> 2.
- Re-run 1000-match sim after any tweak; AI decks use meta mix so re-check.
