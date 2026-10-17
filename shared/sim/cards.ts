// Nkhondo card roster. All values live here (mirrored to src/data/cards.json).
// Flying units: layer air + canTarget ground/air/both.

export type CardType = 'troop' | 'building' | 'spell';
export type Targeting = 'any' | 'buildings';
export type Layer = 'ground' | 'air';
export type CanTarget = 'ground' | 'air' | 'both';

export interface SubStat {
  key: string;
  count: number;
  hp: number;
  damage: number;
  /** seconds between strikes */
  interval: number;
  /** tiles */
  range: number;
  /** tiles/sec */
  speed: number;
  /** tiles */
  aggro: number;
  targets: Targeting;
  ranged: boolean;
  layer: Layer;
  canTarget: CanTarget;
  /** cone splash (Zikwanje): radius tiles, arc degrees in front */
  splash?: { radius: number; arcDeg: number };
  /** absorbs this much damage before HP (Mlonda shield) */
  shield?: number;
}

export interface CardDef {
  id: string;
  cost: number;
  type: CardType;
  /** cosmetic only — frame styling, never affects stats */
  rarity: 'common' | 'rare' | 'epic';
  nameEn: string;
  nameCh: string;
  roleEn: string;
  roleCh: string;
  descEn: string;
  descCh: string;
  barkEn: string;
  barkCh: string;
  color: string;
  icon: string;
  subs: SubStat[];
  spell?: {
    radius: number;
    duration: number;
    slowPct?: number;
    rangedMissPct?: number;
    obstacleHp?: number;
    width?: number;
    energyGain?: number;
    push?: number;
    damage?: number;
    /** push runs toward the enemy half instead of radially */
    directional?: boolean;
    /** mphezi: number of sequential strikes */
    strikes?: number;
    /** mphezi: seconds between strikes */
    strikeDelay?: number;
    /** mphezi: stun seconds per strike */
    stun?: number;
  };
}

/** Human-readable targeting label for card info pages. */
export function targetsLabel(c: CardDef): 'Ground' | 'Air' | 'Both' | '•' {
  if (c.type === 'spell') {
    if (c.id === 'harvest' || c.id === 'makwerero' || c.id === 'roadblock') return '•';
    return 'Both';
  }
  const set = new Set(c.subs.map((s) => s.canTarget));
  if (set.size === 1) {
    const v = [...set][0];
    return v === 'ground' ? 'Ground' : v === 'air' ? 'Air' : 'Both';
  }
  if (set.has('both')) return 'Both';
  if (set.has('ground') && set.has('air')) return 'Both';
  return 'Ground';
}

/** Owls summoned by Mfiti (not deployed directly). */
export const MFITI_OWL = {
  key: 'owl',
  hp: 120,
  damage: 40,
  interval: 1.0,
  range: 1.4,
  speed: 3.2,
  aggro: 6.5,
  layer: 'air' as Layer,
  canTarget: 'both' as CanTarget,
};
export const MFITI_SUMMON_PERIOD = 6; // seconds
export const MFITI_SUMMON_COUNT = 2;
export const MFITI_CURSE_RADIUS = 3;
export const MFITI_CURSE_MULT = 0.8; // -20% damage
export const MFITI_SYNERGY_RADIUS = 4;
export const MFITI_SYNERGY_SPEED = 1.15; // +15% speed for allied Afisi
export const NJUCHI_STING_SLOW = 1.15; // +15% attack interval for 1s
export const MPHEZI_TOWER_FACTOR = 0.3;

const G = (canTarget: CanTarget = 'ground'): { layer: Layer; canTarget: CanTarget } =>
  ({ layer: 'ground', canTarget });

export const CARDS: Record<string, CardDef> = {
  mlonda: {
    id: 'mlonda', cost: 5, type: 'troop', rarity: 'epic',
    nameEn: 'Mlonda (Guardian)', nameCh: 'Mlonda',
    roleEn: 'Heavy shield frontline', roleCh: 'Mtsogoleri wachishango',
    descEn: 'Tank. Shield absorbs first 300 damage (blue bar). Slow, huge HP wall. Ground melee: cannot hit air.',
    descCh: 'Wochedwa, wamphamvu. Chishango chimatchinga 300. Sangamenye mbalame.',
    barkEn: "Ndili pano!", barkCh: "Ndili pano!",
    color: '#4a7ec2', icon: '🛡️',
    subs: [
      { key: 'guard', count: 1, hp: 1800, damage: 110, interval: 1.5, range: 1.2, speed: 1.1, aggro: 5.5, targets: 'any', ranged: false, ...G('ground'), shield: 300 },
    ],
  },
  zikwanje: {
    id: 'zikwanje', cost: 4, type: 'troop', rarity: 'rare',
    nameEn: 'Zikwanje (Pangas)', nameCh: 'Zikwanje',
    roleEn: 'Twin bush-clearers, cone splash', roleCh: 'Olimi awiri a panga',
    descEn: '2 farmers with a wide sweeping arc (radius 1.5, 120° cone). Shreds ground swarms. Cannot hit air. Hits shower leaves, not wounds.',
    descCh: 'Alimi awiri. Amadula udzu kutsogolo (1.5, 120°). Sangamenye mbalame.',
    barkEn: "Tiyeni!", barkCh: "Tiyeni!",
    color: '#5da24a', icon: '🌿',
    subs: [
      { key: 'panga', count: 2, hp: 650, damage: 120, interval: 1.2, range: 1.3, speed: 1.7, aggro: 5.5, targets: 'any', ranged: false, ...G('ground'), splash: { radius: 1.5, arcDeg: 120 } },
    ],
  },
  njuchi: {
    id: 'njuchi', cost: 2, type: 'troop', rarity: 'common',
    nameEn: 'Njuchi (Bees)', nameCh: 'Njuchi',
    roleEn: 'Flying swarm, sting slows attacks', roleCh: 'Njuchi 6 zowuluka',
    descEn: '6 flying bees. Fast, hit ground + air. Stings slow enemy attack speed 15% for 1s. Weak to splash and towers.',
    descCh: 'Njuchi 6 zowuluka. Zimachedwetsa kumenya kwa mdani 15%. Fofoka ku moto ndi nsanja.',
    barkEn: "Bzzzz!", barkCh: "Bzzzz!",
    color: '#e8b820', icon: '🐝',
    subs: [
      { key: 'bee', count: 6, hp: 50, damage: 20, interval: 0.8, range: 1.1, speed: 3.1, aggro: 6.5, targets: 'any', ranged: false, layer: 'air', canTarget: 'both' },
    ],
  },
  mfiti: {
    id: 'mfiti', cost: 5, type: 'troop', rarity: 'epic',
    nameEn: 'Mfiti (Witch)', nameCh: 'Mfiti',
    roleEn: 'Summons owls, curse aura', roleCh: 'Mfiti ya usiku ndi akadzidzi',
    descEn: 'Ranged 5, hits ground + air. Every 6s summons 2 flying owls. Curse: enemies within 3 deal -20% damage. Allied Afisi within 4 get +15% speed.',
    descCh: 'Amaponya patali 5. Ma 6s aliwonse atulutsa akadzidzi 2. Tsoka: adani pafupi -20%. Afisi anzake +15% liwiro.',
    barkEn: "Usiku...", barkCh: "Usiku...",
    color: '#6a3fa0', icon: '🦉',
    subs: [
      { key: 'witch', count: 1, hp: 700, damage: 90, interval: 1.4, range: 5.0, speed: 1.4, aggro: 6.5, targets: 'any', ranged: true, layer: 'ground', canTarget: 'both' },
    ],
  },
  woweta: {
    id: 'woweta', cost: 4, type: 'troop', rarity: 'epic',
    nameEn: 'Woweta (Herdmaster)', nameCh: 'Woweta',
    roleEn: 'Herder + 3 goats', roleCh: 'Mbusa ndi mbuzi (3)',
    descEn: 'Herder plus 3 goats. Goats charge the nearest troop, knock it back 1 tile and cancel its attack wind-up. Ground melee: cannot hit air.',
    descCh: 'Mbusa ndi mbuzi zitatu. Mbuzi zimakankha mdani ndi kuletsa kumenya kwake. Sangamenye mbalame.',
    barkEn: "Bwerani!", barkCh: "Bwerani!",
    color: '#7db35a', icon: '🐐',
    subs: [
      { key: 'herder', count: 1, hp: 550, damage: 70, interval: 1.2, range: 1.2, speed: 1.6, aggro: 5.5, targets: 'any', ranged: false, ...G('ground') },
      { key: 'goat', count: 3, hp: 200, damage: 40, interval: 1.1, range: 1.1, speed: 2.3, aggro: 6.5, targets: 'any', ranged: false, ...G('ground') },
    ],
  },
  fisi: {
    id: 'fisi', cost: 4, type: 'troop', rarity: 'common',
    nameEn: 'Afisi (Hyenas)', nameCh: 'Afisi',
    roleEn: 'Fast hyena pair', roleCh: 'Afisi awiri othamanga',
    descEn: 'Two very fast hyenas that run down lone targets and swarm towers. Ground melee: cannot hit air.',
    descCh: 'Afisi awiri othamanga kwambiri. Abwino kuthamangitsa adani. Sangamenye mbalame.',
    barkEn: "Fisi!", barkCh: "Fisi!",
    color: '#a08a5a', icon: '🐕',
    subs: [
      { key: 'hyena', count: 2, hp: 300, damage: 58, interval: 1.0, range: 1.1, speed: 2.5, aggro: 6.0, targets: 'any', ranged: false, ...G('ground') },
    ],
  },
  watchtower: {
    id: 'watchtower', cost: 4, type: 'building', rarity: 'rare', // balance v2: hp 1400->1600 (was 39.9% over 1000 AI matches)
    nameEn: 'Nsanja ya Nkhalango (Watchtower)', nameCh: 'Nsanja ya Nkhalango',
    roleEn: 'Watchtower, hits ground + air (40s)', roleCh: 'Nsanja (40s)',
    descEn: 'HP 1400, range 6.5, 135 damage every 0.9s. Hits ground + air. Lifetime 40s.',
    descCh: 'Moyo 1400, patali 6.5, kuwononga 120. Imenya pansi ndi mlengalenga. Imakhala 40s.',
    barkEn: "Mangani!", barkCh: "Mangani!",
    color: '#a9713f', icon: '🗼',
    subs: [
      { key: 'tower', count: 1, hp: 1600, damage: 135, interval: 0.9, range: 6.5, speed: 0, aggro: 6.5, targets: 'any', ranged: true, layer: 'ground', canTarget: 'both' },
    ],
  },
  rain: {
    id: 'rain', cost: 2, type: 'spell', rarity: 'rare', // balance v2: cost 3->2 (was 40.3% over 1000 AI matches; slow stays 40%)
    nameEn: 'Mvula Yamphamvu (Heavy Rain)', nameCh: 'Mvula Yamphamvu',
    roleEn: 'Heavy rain zone, slows ground + air', roleCh: 'Mvula yamphamvu',
    descEn: 'Radius 3.5, 6s. Enemies slowed 40% (ground and air); ranged miss 30%. Puddles 4s more (10% slow).',
    descCh: 'Mvula yolemera 6s. Imachedwetsa 35% (pansi ndi mlengalenga), kuponya kulakwitsa 30%. Madzi 4s (10%).',
    barkEn: "Mvula!", barkCh: "Mvula!",
    color: '#3f8fd1', icon: '🌧️',
    subs: [],
    spell: { radius: 3.5, duration: 6, slowPct: 40, rangedMissPct: 30 },
  },
  roadblock: {
    id: 'roadblock', cost: 2, type: 'spell', rarity: 'common',
    nameEn: 'Chotchinga (Roadblock)', nameCh: 'Chotchinga',
    roleEn: 'Drum-and-crate wall', roleCh: 'Khoma la ngoma',
    descEn: 'A 3-tile wall of drums, crates and a bicycle. HP 650, lasts 10s, blocks ground pathing. Flying units pass over.',
    descCh: 'Khoma la ngoma ndi mabokosi. Moyo 650, 10s, limatsekereza njira. Zowuluka zimadutsa.',
    barkEn: "Tsekani!", barkCh: "Tsekani!",
    color: '#c96a2e', icon: '🛢️',
    subs: [],
    spell: { radius: 0, duration: 10, obstacleHp: 650, width: 3 },
  },
  harvest: {
    id: 'harvest', cost: 3, type: 'spell', rarity: 'common',
    nameEn: 'Zokolola (Harvest)', nameCh: 'Zokolola',
    roleEn: 'Energy harvest', roleCh: 'Kokolola mphamvu',
    descEn: 'Reap the fields: gain 5 Mphamvu instantly. Cast anywhere.',
    descCh: 'Kololani: pezani Mphamvu 5 pompo. Ponyani paliponse.',
    barkEn: "Zokolola!", barkCh: "Zokolola!",
    color: '#b8a020', icon: '🌾',
    subs: [],
    spell: { radius: 0, duration: 0, energyGain: 5 },
  },
  mafunde: {
    id: 'mafunde', cost: 2, type: 'spell', rarity: 'rare',
    nameEn: 'Mafunde (Waves)', nameCh: 'Mafunde',
    roleEn: 'Radial knockback wave', roleCh: 'Funtho lozungulira',
    descEn: 'Radius 3. A radial surge hurls enemies back 2 tiles (60 damage, 24 to towers, wind-ups cancelled). Hits ground + air.',
    descCh: 'Mphindi 3. Madzi ozungulira amakankha adani 2, kuwononga 60 (24 ku nsanja).',
    barkEn: "Madzi!", barkCh: "Madzi!",
    color: '#1f7ab5', icon: '🌊',
    subs: [],
    spell: { radius: 3.0, duration: 0, push: 2.0, damage: 60 },
  },
  moto: {
    id: 'moto', cost: 4, type: 'spell', rarity: 'rare',
    nameEn: 'Moto (Fire Blast)', nameCh: 'Moto',
    roleEn: 'Fire blast, hits ground + air', roleCh: 'Moto wawukulu',
    descEn: 'Radius 2.5. A fire blast deals 200 damage (80 to towers). Hits ground + air. Cast anywhere.',
    descCh: 'Mphindi 2.5. Moto uwononga 200 (80 ku nsanja). Pansi ndi mlengalenga. Ponyani paliponse.',
    barkEn: "Moto!", barkCh: "Moto!",
    color: '#c22f2f', icon: '🔥',
    subs: [],
    spell: { radius: 2.5, duration: 0, damage: 200 },
  },
  mphepo: {
    id: 'mphepo', cost: 3, type: 'spell', rarity: 'rare',
    nameEn: 'Mphepo ya Nyanja (Lake Wind)', nameCh: 'Mphepo ya Nyanja',
    roleEn: '3-wide line gust', roleCh: 'Mphepo ya mzere',
    descEn: 'A wind sweeps a 3-tile-wide line forward. Pushes troops 2 tiles, 30 damage, interrupts. Hits ground + air.',
    descCh: 'Mphepo ya mzere imakankha adani 2, kuwononga 30, kuyimitsa kumenya. Pansi ndi mlengalenga.',
    barkEn: "Mphepo!", barkCh: "Mphepo!",
    color: '#6aa8d8', icon: '🌪️',
    subs: [],
    spell: { radius: 3.5, duration: 0, push: 2.0, damage: 30, directional: true, width: 3 },
  },
  mphezi: {
    id: 'mphezi', cost: 5, type: 'spell', rarity: 'epic', // balance v2: cost 6->5 (was 39.2% over 1000 AI matches; 750dmg/30% tower unchanged)
    nameEn: 'Mphezi (Lightning)', nameCh: 'Mphezi',
    roleEn: 'Triple lightning strike', roleCh: 'Mphezi katatu',
    descEn: 'Radius 3.5. Lightning strikes the 3 highest-HP enemies one after another (0.3s apart): 750 damage each (225 to towers) + 0.5s stun. Hits ground + air.',
    descCh: 'Mphindi 3.5. Mphezi ikamenya adani 3 amphamvu kwambiri: 750 (225 ku nsanja) + chizungulire 0.5s.',
    barkEn: "Mphezi!", barkCh: "Mphezi!",
    color: '#7a4fd1', icon: '⚡',
    subs: [],
    spell: { radius: 3.5, duration: 0, damage: 750, strikes: 3, strikeDelay: 0.3, stun: 0.5 },
  },
  makwerero: {
    id: 'makwerero', cost: 3, type: 'spell', rarity: 'common', // balance v2: cost 2->3 (was 59.6% over 1000 AI matches; 15s ford unchanged)
    nameEn: 'Makwerero (Ladders)', nameCh: 'Makwerero',
    roleEn: 'River crossing', roleCh: 'Kuwoloka mtsinje',
    descEn: 'Your ground troops ford the river anywhere for 15s: no bridges needed. Flying units never need it. Cast anywhere.',
    descCh: 'Asilikali anu apansi amawoloka mtsinje paliponse kwa 15s. Ponyani paliponse.',
    barkEn: "Kwerani!", barkCh: "Kwerani!",
    color: '#8a5a30', icon: '🪜',
    subs: [],
    spell: { radius: 0, duration: 15 },
  },
};

export const CARD_LIST = Object.values(CARDS);
export const STARTER_DECK: string[] = ['mlonda', 'zikwanje', 'njuchi', 'fisi', 'woweta', 'watchtower', 'rain', 'mphezi'];
/** Three AI archetypes using the new roster. */
export const AI_DECKS: Record<string, string[]> = {
  witchSwarm: ['mfiti', 'fisi', 'njuchi', 'woweta', 'rain', 'moto', 'mafunde', 'watchtower'],
  tankSpells: ['mlonda', 'zikwanje', 'watchtower', 'moto', 'mphezi', 'rain', 'mafunde', 'harvest'],
  fastCycle: ['njuchi', 'zikwanje', 'fisi', 'woweta', 'mphepo', 'mafunde', 'makwerero', 'moto'],
};
export const AI_DECK_LIST = Object.values(AI_DECKS);
export const ALL_CARD_IDS = CARD_LIST.map((c) => c.id);

export interface BalanceConfig {
  energyPeriod: number;
  energyMax: number;
  startEnergy: number;
  regTime: number;
  suddenDeathTime: number;
  nsanjaHp: number;
  chiefHp: number;
  nsanjaDamage: number;
  nsanjaInterval: number;
  nsanjaRange: number;
  chiefDamage: number;
  chiefInterval: number;
  chiefRange: number;
}

export const BALANCE: BalanceConfig = {
  energyPeriod: 2.8,
  energyMax: 10,
  startEnergy: 5,
  regTime: 180,
  suddenDeathTime: 60,
  nsanjaHp: 1800,
  chiefHp: 2800,
  nsanjaDamage: 130,
  nsanjaInterval: 1.0,
  nsanjaRange: 7.0,
  chiefDamage: 150,
  chiefInterval: 1.1,
  chiefRange: 7.0,
};
