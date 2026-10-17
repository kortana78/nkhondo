import { create } from 'zustand';
import { ALL_CARD_IDS, STARTER_DECK } from '../../shared/sim/cards';
import type { Difficulty } from '../../shared/sim/ai';

export type Screen = 'title' | 'home' | 'deck' | 'cards' | 'arenas' | 'settings' | 'battle' | 'howto' | 'about' | 'credits' | 'nameentry' | 'profile' | 'leaderboard' | 'matchmake';
export type Lang = 'en' | 'ch';
export type Quality = 'low' | 'med' | 'high';
export type ArenaId = 'mudzi' | 'msika';

interface GameState {
  screen: Screen;
  deck: string[];
  trophies: number;
  lang: Lang;
  difficulty: Difficulty;
  quality: Quality;
  arena: ArenaId;
  muted: boolean;
  musicVol: number;
  sfxVol: number;
  dmgNumbers: boolean;
  playerName: string;
  barks: boolean;
  reduceFlash: boolean;
  tutorialMode: boolean;
  result: { winner: 0 | 1 | 2; stars: number; delta: number } | null;
  go: (s: Screen) => void;
  setDeck: (d: string[]) => void;
  setLang: (l: Lang) => void;
  setDifficulty: (d: Difficulty) => void;
  setQuality: (q: Quality) => void;
  setArena: (a: ArenaId) => void;
  setMuted: (m: boolean) => void;
  setMusicVol: (v: number) => void;
  setSfxVol: (v: number) => void;
  setDmgNumbers: (v: boolean) => void;
  setPlayerName: (n: string) => void;
  setBarks: (b: boolean) => void;
  setReduceFlash: (v: boolean) => void;
  setTutorialMode: (v: boolean) => void;
  setResult: (r: GameState['result']) => void;
  addTrophies: (d: number) => void;
}

function load<T>(k: string, fb: T): T {
  try {
    const v = localStorage.getItem('nkhondo:' + k);
    return v == null ? fb : (JSON.parse(v) as T);
  } catch { return fb; }
}
function save(k: string, v: unknown) {
  try { localStorage.setItem('nkhondo:' + k, JSON.stringify(v)); } catch { /* noop */ }
}

const savedDeck = load<string[]>('deck', STARTER_DECK).filter((c) => ALL_CARD_IDS.includes(c));
const validDeck = savedDeck.length === 8 ? savedDeck : [...STARTER_DECK];

export const useGame = create<GameState>((set) => ({
  screen: 'title',
  deck: validDeck,
  trophies: load('trophies', 0),
  lang: load<Lang>('lang', 'en'),
  difficulty: load<Difficulty>('diff', 'normal'),
  quality: load<Quality>('quality', 'med'),
  arena: load<ArenaId>('arena', 'mudzi'),
  muted: load('muted', false),
  musicVol: load('musicVol', 0.8),
  sfxVol: load('sfxVol', 0.9),
  dmgNumbers: load('dmgNumbers', true),
  playerName: load('playerName', ''),
  barks: load('barks', true),
  reduceFlash: load('reduceFlash', false),
  tutorialMode: false,
  result: null,
  go: (screen) => set({ screen }),
  setDeck: (deck) => { save('deck', deck); set({ deck }); },
  setLang: (lang) => { save('lang', lang); set({ lang }); },
  setDifficulty: (difficulty) => { save('diff', difficulty); set({ difficulty }); },
  setQuality: (quality) => { save('quality', quality); set({ quality }); },
  setArena: (arena) => { save('arena', arena); set({ arena }); },
  setMuted: (muted) => { save('muted', muted); set({ muted }); },
  setMusicVol: (musicVol) => { save('musicVol', musicVol); set({ musicVol }); },
  setSfxVol: (sfxVol) => { save('sfxVol', sfxVol); set({ sfxVol }); },
  setDmgNumbers: (dmgNumbers) => { save('dmgNumbers', dmgNumbers); set({ dmgNumbers }); },
  setPlayerName: (playerName) => { save('playerName', playerName.slice(0, 16)); set({ playerName: playerName.slice(0, 16) }); },
  setBarks: (barks) => { save('barks', barks); set({ barks }); },
  setReduceFlash: (reduceFlash) => { save('reduceFlash', reduceFlash); set({ reduceFlash }); },
  setTutorialMode: (tutorialMode) => set({ tutorialMode }),
  setResult: (result) => set({ result }),
  addTrophies: (d) => set((s) => {
    const trophies = Math.max(0, s.trophies + d);
    save('trophies', trophies);
    return { trophies };
  }),
}));

export function deckAvg(deck: string[], costOf: (id: string) => number): number {
  return deck.reduce((s, c) => s + costOf(c), 0) / Math.max(1, deck.length);
}
