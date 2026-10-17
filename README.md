# Nkhondo

A lane card battler inspired by Malawian village life. You build a deck of cards based on animals, spirits, and village legends, then cast them on a battlefield between two towers to strip your enemy's king tower to 0 HP before they do the same to yours.

**Play now: [nkhondo.vercel.app](https://nkhondo.vercel.app)**

Nkhondo is free, runs in the browser, works offline after the first load, and supports English and Chichewa.

## How the game works

A match is 3 minutes. Each side has three towers on a lane that splits at a river: a king tower in the middle and two guard towers on the flanks. You spend energy, which regenerates over time, to deploy cards anywhere on your half of the field. Cards fall into four families:

- **Beasts**: units like njuchi (swarming bees), mbuzi (goats), and fisi (hyenas) that march toward enemy towers and fight anything in the way.
- **Spells**: one shot effects like mpheni (lightning) and mvula (rain) that can hit anywhere on the arena.
- **Structures**: defensive buildings like the watchtower that hold ground on your side.
- **Legends**: expensive, powerful named heroes of Malawian folklore that can turn a fight.

When the clock hits 0, the side with more total tower HP left wins. If the match is tied it goes to a 60 second sudden death phase where the first tower lost decides the game.

Guards on the doorstep of Mount Mulanje, called Anamoyo, enchant every card in your deck, and two friendly villagers who never stop gossiping will narrate your match for you.

## Features

- Real time 1v1 matches against ranked bots at four difficulties, or against other players over the net.
- A deterministic simulation running at a fixed 20 ticks per second, so both clients in an online match stay perfectly in sync. The server tests this with a 100 match sweep across 12 seeds on every run.
- 17 unique cards with their own art, stats, and behaviour. Browse them all in the Cards screen.
- Deck builder with 8 card slots. Save multiple decks and switch between them.
- Ranked ladder with a rating, season standings, and a leaderboard.
- Full Chichewa translation. The whole game, menus and all, can be played in ChiCheŵa.
- Match replay and a bug report tool that copies your last 200 actions to the clipboard so you can paste them straight into an issue.
- Sound effects, music, and settings are saved locally. Works offline thanks to a service worker.

## Tech stack

- TypeScript, React 19, Vite
- react-three-fiber (three.js) for the 3D arena and units
- Zustand for state
- Node + ws for the matchmaking server, running the exact same simulation code as the client
- The simulation lives in `shared/sim/` and is pure, synchronous, integer based code: no Math.random, no floating point drift, no async calls. This is what makes deterministic lockstep netcode possible.

## Project structure

```
shared/sim/     Deterministic battle simulation (cards, towers, pathing, spells)
src/ui/         React screens: title, home, deck builder, cards, battle HUD
src/render/     react-three-fiber arena, units, effects
server/         Matchmaking + replay server, plus the test suite
docs/           Balance reports, known issues, beta test plan
tools/          Dev scripts: balance sims, screenshot bots, asset checks
```

## Running it locally

You need Node 20 or newer.

```bash
npm install
npm run dev
```

This starts the client on http://localhost:5173. In a second terminal, the game server:

```bash
cd server
npm install
npm run dev
```

The client has a bot mode that works with no server at all, so you can play against AI without running anything but `npm run dev`.

### Tests

```bash
# full sim test suite: rules, pathing, spells, matches, 12 seed sweep
cd server
npm test
```

The client also runs a balance simulation that plays a thousand matches between real decks in about 2 seconds, used to tune the cards (see `docs/BALANCE_1000_v2.md`).

## Contributing

Contributions are very welcome. The game is at v0.9.0 and there is plenty to do. A few ideas of where to start:

- **Cards**: new card ideas are the fastest way to help. A card is a config object in `shared/sim/cards.ts`, a draw step in `src/render/`, and strings in `src/ui/i18n.ts`.
- **Balance**: run the thousand match sim (`tools/`), pick a card that is off the 58/42 win rate band, and open a PR with the new numbers.
- **Chichewa**: the translation is complete but could always use a native speaker's polish. All strings are in `src/ui/i18n.ts`.
- **Server**: the server is a simple ws relay with deterministic lockstep. Latency compensation, spectator mode, and reconnection are all open problems.
- **Art**: all card art, icons, and fonts are listed in `assets/manifest.json` with licences. Additions welcome if they fit Malawian village life.

Before opening a PR:

```bash
npm run build        # tsc -b && vite build, must be clean
cd server && npm test
```

Issues with screenshots or a replay code from the bug report tool are the fastest to fix.

## Licence

Code is MIT. Art and font assets have their own licences, see `assets/manifest.json`.

## Acknowledgements

Built in Malawi. The cards draw on real village life, the legend of Anamoyo, and the kind of gossip that feels fit to print.
