import { useEffect, useRef, useState } from 'react';
import { useGame, deckAvg } from '../state/store';
import { t } from './i18n';
import { CARDS, CARD_LIST, STARTER_DECK, ALL_CARD_IDS, targetsLabel } from '../../shared/sim/cards';
import type { CardDef } from '../../shared/sim/cards';
import { CardIcon } from './CardIcon';
import { MenuIcon } from './MenuIcons';
import { ensureAudio, sfx, startMusic } from '../audio/engine';
import { TitleDiorama } from './TitleDiorama';
import { FlagMW } from './FlagMW';
import { getManifest } from '../assets/loader';
import { copyBugReport } from './bugreport';
import { api, loadToken, net, onlineEnabled, refreshProfile, useOnline } from '../net/online';
import { ARENA_UNLOCKS } from '../../shared/elo';
import { version as gameVersion } from '../../package.json';
import creditsRaw from '../../assets/CREDITS.md?raw';

const BUILD_DATE = '2026-10-16';

export function startTutorial() {
  ensureAudio();
  startMusic();
  sfx.horn();
  useGame.getState().setTutorialMode(true);
  useGame.getState().go('battle');
}

function tutKey(): string | null {
  try { return localStorage.getItem('nkhondo:tutorial'); } catch { return 'skipped'; }
}

function TopBar({ title, back }: { title: string; back?: boolean }) {
  const go = useGame((s) => s.go);
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  return (
    <div className="topbar">
      {back ? <button className="iconbtn" aria-label={t(lang, 'back')} onClick={() => { sfx.click(); go('home'); }}>‹</button> : <span style={{ width: 44 }} />}
      <h2>{title}</h2>
      <button className="langbtn" aria-label={t(lang, 'language')} onClick={() => setLang(lang === 'en' ? 'ch' : 'en')}>
        {lang === 'en' ? 'CH' : 'EN'}
      </button>
    </div>
  );
}

export function TitleScreen() {
  const go = useGame((s) => s.go);
  const lang = useGame((s) => s.lang);
  const quality = useGame((s) => s.quality);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * 5));
  useEffect(() => {
    const id = window.setInterval(() => setTip((v) => (v + 1) % 5), 5000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div
      className="screen title-screen full"
      onClick={() => {
        ensureAudio();
        startMusic();
        sfx.drumHit();
        if (onlineEnabled() && !loadToken()) go('nameentry');
        else go('home');
      }}
    >
      <div className="title-diorama" aria-hidden>
        <TitleDiorama quality={quality} />
      </div>
      <div className="title-scrim" aria-hidden />
      <div className="title-vignette" aria-hidden />
      <div className="title-content">
        <div className="game-logo title-logo"><span>NKHONDO</span></div>
        <div className="proverb">{t(lang, 'tip' + tip)}</div>
        <button className="btn big pulse" aria-label={t(lang, 'playBig')}>▶ {t(lang, 'playBig')}</button>
        <div className="tap-hint">{t(lang, 'madeInMalawi')} <FlagMW size={18} /></div>
        <div className="title-ver">v{gameVersion}</div>
      </div>
    </div>
  );
}

export function HomeScreen() {
  const go = useGame((s) => s.go);
  const deck = useGame((s) => s.deck);
  const trophies = useGame((s) => s.trophies);
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  const quality = useGame((s) => s.quality);
  const difficulty = useGame((s) => s.difficulty);
  const setDifficulty = useGame((s) => s.setDifficulty);
  const playerName = useGame((s) => s.playerName);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const [offer, setOffer] = useState(() => tutKey() == null);
  const [modeOpen, setModeOpen] = useState(false);
  const tiles = ['deck', 'cards', 'howto', 'arenas'] as const;
  const level = 1 + Math.floor(trophies / 100);
  const playVs = () => { ensureAudio(); startMusic(); sfx.horn(); setModeOpen(false); go('battle'); };
  return (
    <div className="screen home-screen">
      <div className="menu-bg" aria-hidden>
        <TitleDiorama quality={quality} />
      </div>
      <div className="menu-container">
      <header className="menu-header">
        <button className="iconbtn" aria-label={t(lang, 'settings')} title={t(lang, 'settings')} onClick={() => { sfx.click(); go('settings'); }}>⚙</button>
        <div className="game-logo menu-logo"><span>NKHONDO</span></div>
        <div className="seg langseg" role="group" aria-label={t(lang, 'language')}>
          <button className={lang === 'en' ? 'on' : ''} onClick={() => { setLang('en'); sfx.click(); }}>EN</button>
          <button className={lang === 'ch' ? 'on' : ''} onClick={() => { setLang('ch'); sfx.click(); }}>Chichewa</button>
        </div>
      </header>
      <div className="player-strip">
        <label className="pname-edit">
          <span className="pname-label">{t(lang, 'playerName')}</span>
          <input
            value={playerName}
            maxLength={16}
            placeholder={t(lang, 'namePhLocal')}
            onChange={(e) => setPlayerName(e.target.value)}
            aria-label={t(lang, 'playerName')}
          />
        </label>
        <span className="plevel">{t(lang, 'level')} {level}</span>
        <span className="ptroph"><CardIcon id="trophy" fallback="🏆" className="ticon" /> {trophies}</span>
      </div>
      <div className="home-hero">
        {!modeOpen ? (
          <button className="btn big battle-btn" onMouseEnter={() => sfx.hover()} onClick={() => { ensureAudio(); sfx.click(); setModeOpen(true); }}>
            ⚔️ {t(lang, 'playBig')}
          </button>
        ) : (
          <div className="mode-panel">
            <h3>{t(lang, 'modeSelect')}</h3>
            <div className="seg" role="group" aria-label={t(lang, 'vsMdani')}>
              {(['easy', 'normal', 'hard'] as const).map((d) => (
                <button key={d} className={difficulty === d ? 'on' : ''} onClick={() => { setDifficulty(d); sfx.click(); }}>{t(lang, d)}</button>
              ))}
            </div>
            <button className="btn big battle-btn" onMouseEnter={() => sfx.hover()} onClick={playVs}>
              ⚔️ {t(lang, 'vsMdani')}
            </button>
            <button className="btn soon" disabled title={t(lang, 'onlineSoon')}>
              🌐 {t(lang, 'onlineSoon')} <span className="soon-badge">{t(lang, 'comingBadge')}</span>
            </button>
          </div>
        )}
        <span className="deck-label">{t(lang, 'deckLabel')}</span>
        <button className="deck-preview" onClick={() => { sfx.click(); go('deck'); }} aria-label={t(lang, 'deck')}>
          {deck.map((c) => (
            <span key={c} className="mini-card" style={{ background: CARDS[c].color }}><CardIcon id={c} fallback={CARDS[c].icon} /></span>
          ))}
        </button>
      </div>
      <OnlinePanel />
      <div className="menu-grid">
        {tiles.map((k) => (
          <button key={k} className="menu-card" onMouseEnter={() => sfx.hover()} onClick={() => { sfx.click(); go(k); }}>
            <span className="menu-icon"><MenuIcon kind={k} /></span>
            <span>{t(lang, k)}</span>
          </button>
        ))}
      </div>
      <div className="home-foot">
        <button className="linkbtn" onClick={() => { sfx.click(); go('about'); }}>{t(lang, 'about')}</button>
        <span>•</span>
        <button className="linkbtn" onClick={() => { sfx.click(); go('credits'); }}>{t(lang, 'credits')}</button>
      </div>
      </div>
      {offer && (
        <div className="overlay">
          <div className="pause-card">
            <h1>{t(lang, 'playTutorial')}</h1>
            <p>{t(lang, 'tutOfferBody')}</p>
            <button className="btn big" onClick={() => { setOffer(false); startTutorial(); }}>{t(lang, 'yes')}</button>
            <button className="btn" onClick={() => { try { localStorage.setItem('nkhondo:tutorial', 'skipped'); } catch { /* noop */ } setOffer(false); sfx.click(); }}>
              {t(lang, 'skip')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OnlinePanel() {
  const go = useGame((s) => s.go);
  const lang = useGame((s) => s.lang);
  const profile = useOnline((s) => s.profile);
  const stats = useOnline((s) => s.stats);
  useEffect(() => {
    if (!onlineEnabled()) return;
    const t = loadToken();
    if (t && !useOnline.getState().token) {
      useOnline.getState().set({ token: t });
      void refreshProfile().catch(() => undefined);
    }
    net.ensure();
    void api.stats().then((s) => useOnline.getState().set({ stats: s })).catch(() => undefined);
  }, []);
  if (!onlineEnabled()) return null;
  const ranked = () => {
    ensureAudio();
    startMusic();
    sfx.horn();
    go(useOnline.getState().token ? 'matchmake' : 'nameentry');
  };
  return (
    <div className="online-panel">
      <div className="online-status">
        {stats ? `🟢 ${stats.online} ${t(lang, 'online')} · ${stats.inBattle} ⚔️` : '···'}
        {profile ? ` • #${profile.rank || '···'} · ${profile.rating} ${t(lang, 'zikho')}` : ''}
      </div>
      <div className="howto-nav">
        <button className="btn" onClick={ranked}>⚔️ {t(lang, 'rankedBattle')}</button>
        <button className="chipbtn" onClick={() => { sfx.click(); go('leaderboard'); }}>{t(lang, 'leaderboard')}</button>
        <button
          className="chipbtn"
          onClick={() => { sfx.click(); go(profile ? 'profile' : 'nameentry'); }}
        >
          {profile ? `${profile.name}#${profile.tag}` : t(lang, 'profile')}
        </button>
      </div>
    </div>
  );
}

export function DeckScreen() {
  const deck = useGame((s) => s.deck);
  const setDeck = useGame((s) => s.setDeck);
  const lang = useGame((s) => s.lang);
  const [slot, setSlot] = useState<number | null>(null);

  const toggle = (id: string) => {
    if (deck.includes(id)) {
      setDeck(deck.filter((c) => c !== id));
      sfx.click();
    } else if (deck.length < 8) {
      setDeck([...deck, id]);
      sfx.deploy();
    } else if (slot != null) {
      const d = [...deck];
      d[slot] = id;
      setDeck(d);
      setSlot(null);
      sfx.deploy();
    } else {
      sfx.error();
    }
  };

  return (
    <div className="screen">
      <TopBar title={t(lang, 'deck')} back />
      <div className="deck-info">
        <span>{t(lang, 'avgCost')}: <b>{deckAvg(deck, (c) => CARDS[c].cost).toFixed(1)}</b></span>
        <span>{deck.length}/8</span>
        <button className="chipbtn" onClick={() => setDeck([...STARTER_DECK])}>↺</button>
      </div>
      <div className="deck-slots">
        {Array.from({ length: 8 }, (_, i) => {
          const c = deck[i];
          return (
            <button key={i} className={'deck-slot' + (slot === i ? ' sel' : '')} onClick={() => { setSlot(slot === i ? null : i); sfx.click(); }}>
              {c ? <span style={{ background: CARDS[c].color }} className="slot-card"><CardIcon id={c} fallback={CARDS[c].icon} /><small>{CARDS[c].cost}</small></span> : <span className="slot-empty">+</span>}
            </button>
          );
        })}
      </div>
      <p className="hint">{t(lang, 'tapToEdit')}</p>
      <div className="card-grid">
        {CARD_LIST.map((c) => {
          const inDeck = deck.includes(c.id);
          return (
            <button key={c.id} className={'card-pick rar-' + c.rarity + (inDeck ? ' in' : '')} onClick={() => toggle(c.id)}>
              <span className="cost">{c.cost}</span>
              <span className="cicon" style={{ background: c.color }}><CardIcon id={c.id} fallback={c.icon} /></span>
              <span className="cname" title={c.nameEn}>{c.nameCh}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TYPE_ORDER: CardDef['type'][] = ['troop', 'building', 'spell'];

export function CardsScreen() {
  const lang = useGame((s) => s.lang);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="screen">
      <TopBar title={t(lang, 'cards')} back />
      {TYPE_ORDER.map((ty) => {
        const group = CARD_LIST.filter((c) => c.type === ty).sort((a, b) => a.cost - b.cost);
        if (group.length === 0) return null;
        return (
          <div key={ty}>
            <h3 className="grouphead">{t(lang, 'type' + ty[0].toUpperCase() + ty.slice(1))}s</h3>
            <div className="card-list">
              {group.map((c) => {
                const st = cardStats(c);
                const isOpen = open === c.id;
                return (
                  <div key={c.id} className={'card-detail rar-' + c.rarity + (isOpen ? ' open' : '')}>
                    <button
                      className="lib-head"
                      onClick={() => { sfx.click(); setOpen(isOpen ? null : c.id); }}
                      aria-expanded={isOpen}
                    >
                      <span className="cicon lg" style={{ background: c.color }}><CardIcon id={c.id} fallback={c.icon} /></span>
                      <span className="lib-titles">
                        <b>{c.nameEn}</b>
                        <small>⬢{c.cost} • {t(lang, 'type' + c.type[0].toUpperCase() + c.type.slice(1))} • {t(lang, 'targets')}: {targetsLabel(c)}</small>
                      </span>
                      <span className="lib-chev">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {isOpen && (
                      <div className="lib-body">
                        <CardClip c={c} />
                        <CardStatsLine c={c} />
                        <div className="role">{lang === 'ch' ? c.roleCh : c.roleEn}</div>
                        <div className="desc">{lang === 'ch' ? c.descCh : c.descEn}</div>
                        {c.subs.length > 0 && (
                          <div className="statbars">
                            <div className="statbar"><span>{t(lang, 'hp')}</span><i><b style={{ width: `${Math.min(100, st.hp / 25)}%` }} /></i><em>{st.hp}</em></div>
                            <div className="statbar"><span>{t(lang, 'dps')}</span><i><b className="dmg" style={{ width: `${Math.min(100, st.dps / 2)}%` }} /></i><em>{st.dps.toFixed(0)}</em></div>
                          </div>
                        )}
                        <CardMatchup c={c} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Looping "clip": the card portrait acting out its idle motion. */
function CardClip({ c }: { c: CardDef }) {
  const cls = c.id === 'njuchi' || c.id === 'mfiti' ? 'clip fly' : c.id === 'mphezi' ? 'clip zap' : c.id === 'zikwanje' ? 'clip sweep' : 'clip';
  return (
    <div className={cls} style={{ ['--cc' as string]: c.color }}>
      <span className="clip-icon"><CardIcon id={c.id} fallback={c.icon} /></span>
    </div>
  );
}

function CardMatchup({ c }: { c: CardDef }) {
  const lang = useGame((s) => s.lang);
  const mu = matchup(c);
  return (
    <div className="mu">
      <span>👍 {t(lang, 'goodAgainst')}: <b>{t(lang, mu.good)}</b></span>
      <span>👎 {t(lang, 'weakAgainst')}: <b>{t(lang, mu.weak)}</b></span>
    </div>
  );
}

function cardStats(c: CardDef): { hp: number; dps: number } {
  let hp = 0, dps = 0;
  for (const s of c.subs) { hp += s.count * s.hp; dps += (s.count * s.damage) / Math.max(0.1, s.interval); }
  return { hp, dps };
}

const ARENAS = [
  { id: 'mudzi', name: '1. MUDZI', descKey: 'mudziDesc', colors: ['#9c4a2b', '#5d8f3e', '#3f9fc4'], open: true },
  { id: 'msika', name: '2. MSIKA', descKey: 'msikaDesc', colors: ['#e8a020', '#d84f6d', '#2fa8a0'], open: true },
  { id: 'blantyre', name: '3. BLANTYRE', colors: ['#5a5a6e', '#e07b2a', '#2f2f3a'], open: false },
  { id: 'nyanja', name: '4. NYANJA', colors: ['#3f9fc4', '#e8d8a0', '#2fa8a0'], open: false },
  { id: 'tiyi', name: '5. TIYI', colors: ['#3f7a2e', '#cfd8cc', '#5a6a78'], open: false },
  { id: 'nyika', name: '6. NYIKA', colors: ['#7aa05a', '#e8e4da', '#8aa5b5'], open: false },
];

export function ArenasScreen() {
  const lang = useGame((s) => s.lang);
  const arena = useGame((s) => s.arena);
  const setArena = useGame((s) => s.setArena);
  const profile = useOnline((s) => s.profile);
  const rating = profile?.rating ?? 0;
  return (
    <div className="screen">
      <TopBar title={t(lang, 'arenas')} back />
      <p className="hint">{t(lang, 'tapArena')}</p>
      <div className="arena-list">
        {ARENAS.map((a) => {
          const sel = arena === a.id;
          const need = ARENA_UNLOCKS.find((r) => r.arena === a.id)?.rating ?? 0;
          const unlocked = !profile || rating >= need;
          return (
            <button
              key={a.id}
              className={'arena-card asbtn' + (a.open ? '' : ' locked') + (sel ? ' sel' : '')}
              disabled={!a.open}
              onClick={() => { if (a.open && (a.id === 'mudzi' || a.id === 'msika')) { setArena(a.id); sfx.drumHit(); } }}
            >
              <div className="arena-swatches">
                {a.colors.map((c, i) => <span key={i} style={{ background: c }} />)}
              </div>
              <div>
                <b>{a.name} {sel && a.open ? <span className="selbadge">✓ {t(lang, 'selected')}</span> : null}</b>
                <div className="desc">{a.id === 'mudzi' || a.id === 'msika' ? t(lang, a.descKey ?? 'comingSoon') : t(lang, 'comingSoon')}</div>
                {profile && need > 0 && (
                  <div className="desc">{unlocked ? `✓ ${need} ${t(lang, 'zikho')}` : `🔒 ${need} ${t(lang, 'zikho')} (${t(lang, 'needsZikho')})`}</div>
                )}
              </div>
              <span>{a.open ? '✅' : '🔒'}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const s = useGame();
  const lang = s.lang;
  return (
    <div className="screen">
      <TopBar title={t(lang, 'settings')} back />
      <div className="settings">
        <label>{t(lang, 'difficulty')}
          <div className="seg">
            {(['easy', 'normal', 'hard'] as const).map((d) => (
              <button key={d} className={s.difficulty === d ? 'on' : ''} onClick={() => { s.setDifficulty(d); sfx.click(); }}>{t(lang, d)}</button>
            ))}
          </div>
        </label>
        <label>{t(lang, 'quality')}
          <div className="seg">
            {(['low', 'med', 'high'] as const).map((q) => (
              <button key={q} className={s.quality === q ? 'on' : ''} onClick={() => { s.setQuality(q); sfx.click(); }}>{t(lang, q)}</button>
            ))}
          </div>
        </label>
        <label>{t(lang, 'language')}
          <div className="seg">
            <button className={lang === 'en' ? 'on' : ''} onClick={() => s.setLang('en')}>English</button>
            <button className={lang === 'ch' ? 'on' : ''} onClick={() => s.setLang('ch')}>Chichewa</button>
          </div>
        </label>
        <label>{t(lang, 'musicVol')} <b>{Math.round(s.musicVol * 100)}%</b>
          <input
            type="range" min={0} max={1} step={0.05} value={s.musicVol}
            onChange={(e) => { s.setMusicVol(parseFloat(e.target.value)); sfx.hover(); }}
            aria-label={t(lang, 'musicVol')}
          />
        </label>
        <label>{t(lang, 'sfxVol')} <b>{Math.round(s.sfxVol * 100)}%</b>
          <input
            type="range" min={0} max={1} step={0.05} value={s.sfxVol}
            onChange={(e) => { s.setSfxVol(parseFloat(e.target.value)); sfx.click(); }}
            aria-label={t(lang, 'sfxVol')}
          />
        </label>
        <label className="row">{t(lang, 'dmgNumbers')}
          <button className={'toggle' + (s.dmgNumbers ? ' on' : '')} onClick={() => { s.setDmgNumbers(!s.dmgNumbers); sfx.click(); }}>{s.dmgNumbers ? 'ON' : 'OFF'}</button>
        </label>
        <label className="row">{t(lang, 'sound')}
          <button className={'toggle' + (s.muted ? '' : ' on')} onClick={() => s.setMuted(!s.muted)}>{s.muted ? t(lang, 'soundOff') : t(lang, 'soundOn')}</button>
        </label>
        <label className="row">{t(lang, 'barks')}
          <button className={'toggle' + (s.barks ? ' on' : '')} onClick={() => s.setBarks(!s.barks)}>{s.barks ? 'ON' : 'OFF'}</button>
        </label>
        <label className="row">{t(lang, 'reduceFlash')}
          <button className={'toggle' + (s.reduceFlash ? ' on' : '')} onClick={() => s.setReduceFlash(!s.reduceFlash)}>{s.reduceFlash ? 'ON' : 'OFF'}</button>
        </label>
        <div className="hint">{t(lang, 'settingsNote')}</div>
        <div className="verline">
          <span>{t(lang, 'version')}: <b>v{gameVersion}</b></span>
        </div>
      </div>
    </div>
  );
}

export function deckIsValid(deck: string[]): boolean {
  return deck.length === 8 && deck.every((c) => ALL_CARD_IDS.includes(c));
}

/* ---------------- How to Play ---------------- */

function HowtoArt({ page }: { page: number }) {
  if (page === 0) {
    return (
      <div className="howto-art">
        <span className="ha tower foe float-a"><CardIcon id="watchtower" fallback="🗼" /></span>
        <span className="ha chief foe float-b"><CardIcon id="trophy" fallback="🏠" /></span>
        <span className="ha vs">⚔️</span>
        <span className="ha chief you float-a"><CardIcon id="trophy" fallback="🏠" /></span>
        <span className="ha tower you float-b"><CardIcon id="watchtower" fallback="🗼" /></span>
      </div>
    );
  }
  if (page === 1) {
    return (
      <div className="howto-art">
        <div className="ha-bar"><i className="fill" /><i className="fill" /><i className="fill" /><i className="fill" /><i className="fill dim" /><i className="fill dim" /><i className="fill dim" /><i className="fill dim" /><i className="fill dim" /><i className="fill dim" /></div>
        <span className="ha enum">5</span>
      </div>
    );
  }
  if (page === 2) {
    return (
      <div className="howto-art">
        {['mlonda', 'njuchi', 'rain', 'moto'].map((c, i) => (
          <span key={c} className={'ha mini' + (i === 0 ? ' sel' : '')} style={{ background: CARDS[c].color }}>
            <CardIcon id={c} fallback={CARDS[c].icon} />
          </span>
        ))}
      </div>
    );
  }
  if (page === 3) {
    return (
      <div className="howto-art">
        <span className="ha walk"><CardIcon id="mlonda" fallback="🛡️" /></span>
        <span className="ha arrow">➡️</span>
        <span className="ha walk d1"><CardIcon id="fisi" fallback="🐕" /></span>
        <span className="ha tower foe"><CardIcon id="watchtower" fallback="🗼" /></span>
      </div>
    );
  }
  if (page === 4) {
    return (
      <div className="howto-art">
        <span className="ha"><CardIcon id="mlonda" fallback="🛡️" /></span>
        <span className="ha"><CardIcon id="watchtower" fallback="🗼" /></span>
        <span className="ha"><CardIcon id="rain" fallback="🌧️" /></span>
      </div>
    );
  }
  if (page === 6) {
    return (
      <div className="howto-art">
        <span className="ha"><CardIcon id="mfiti" fallback="🦉" /></span>
        <span className="ha ring" />
        <span className="ha"><CardIcon id="njuchi" fallback="🐝" /></span>
        <span className="ha"><CardIcon id="mphezi" fallback="⚡" /></span>
      </div>
    );
  }
  return (
    <div className="howto-art">
      <span className="ha big">👆</span>
      <span className="ha big">⏸️</span>
    </div>
  );
}

function matchup(c: CardDef): { good: string; weak: string } {
  if (c.id === 'mfiti') return { good: 'muTanks', weak: 'muFast' };
  if (c.id === 'zikwanje') return { good: 'muSwarms', weak: 'muAir' };
  if (c.id === 'njuchi') return { good: 'muRanged', weak: 'muArea' };
  if (c.id === 'mphezi') return { good: 'muTanks', weak: 'muFast' };
  if (c.id === 'mafunde') return { good: 'muSwarms', weak: 'muTowers' };
  if (c.type === 'spell') {
    if (c.id === 'harvest') return { good: 'muTroops', weak: 'muFast' };
    if (c.id === 'roadblock' || c.id === 'makwerero') return { good: 'muFast', weak: 'muAir' };
    return { good: 'muSwarms', weak: 'muTowers' };
  }
  if (c.type === 'building') return { good: 'muAir', weak: 'muArea' };
  const maxHp = c.subs.reduce((m, s) => Math.max(m, s.hp), 0);
  if (maxHp >= 1500) return { good: 'muSwarms', weak: 'muAir' };
  if (c.subs.some((s) => s.ranged)) return { good: 'muTanks', weak: 'muFast' };
  if (c.subs.some((s) => s.layer === 'air')) return { good: 'muRanged', weak: 'muArea' };
  if (c.subs.some((s) => s.speed >= 2.5)) return { good: 'muRanged', weak: 'muArea' };
  return { good: 'muTroops', weak: 'muArea' };
}

function CardStatsLine({ c }: { c: CardDef }) {
  const lang = useGame((s) => s.lang);
  if (c.type === 'spell' && c.spell) {
    const sp = c.spell;
    const bits: string[] = [`⬢${c.cost}`, `${t(lang, 'targets')}: ${targetsLabel(c)}`];
    if (sp.radius > 0) bits.push(`~${sp.radius}`);
    if (sp.duration > 0) bits.push(`${sp.duration}s`);
    if (sp.damage) bits.push(`${sp.damage}`);
    if (sp.energyGain) bits.push(`+${sp.energyGain}⚡`);
    return <span className="statline">{bits.join(' • ')}</span>;
  }
  const st = cardStats(c);
  const rng = Math.max(...c.subs.map((s) => s.range));
  const spd = Math.max(...c.subs.map((s) => s.speed));
  return (
    <span className="statline">
      ⬢{c.cost} • {t(lang, 'targets')}: {targetsLabel(c)} • {st.hp}{t(lang, 'hp')} • {st.dps.toFixed(0)}{t(lang, 'dps')} • {t(lang, 'range')} {rng} • {t(lang, 'speed')} {spd}
    </span>
  );
}

function CardLibrary() {
  const lang = useGame((s) => s.lang);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="howto-lib">
      <p className="hint">{t(lang, 'tapCardDetail')}</p>
      {CARD_LIST.map((c) => {
        const mu = matchup(c);
        const isOpen = open === c.id;
        return (
          <div key={c.id} className="lib-card">
            <button
              className="lib-head"
              onClick={() => { sfx.click(); setOpen(isOpen ? null : c.id); }}
              aria-expanded={isOpen}
            >
              <span className="cicon" style={{ background: c.color }}><CardIcon id={c.id} fallback={c.icon} /></span>
              <span className="lib-titles">
                <b title={c.nameEn}>{c.nameCh}</b>
                <small>{c.nameEn} • ⬢{c.cost} • {t(lang, 'type' + c.type[0].toUpperCase() + c.type.slice(1))}</small>
              </span>
              <span className="lib-chev">{isOpen ? '▾' : '▸'}</span>
            </button>
            {isOpen && (
              <div className="lib-body">
                <CardStatsLine c={c} />
                <div className="role">{lang === 'ch' ? c.roleCh : c.roleEn}</div>
                <div className="desc">{lang === 'ch' ? c.descCh : c.descEn}</div>
                <div className="mu">
                  <span>👍 {t(lang, 'goodAgainst')}: <b>{t(lang, mu.good)}</b></span>
                  <span>👎 {t(lang, 'weakAgainst')}: <b>{t(lang, mu.weak)}</b></span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const HOWTO_PAGES = 8;

export function HowToScreen() {
  const lang = useGame((s) => s.lang);
  const [page, setPage] = useState(0);
  const touchX = useRef<number | null>(null);
  const goPage = (p: number) => {
    sfx.click();
    setPage(Math.max(0, Math.min(HOWTO_PAGES - 1, p)));
  };
  return (
    <div className="screen">
      <TopBar title={t(lang, 'howto')} back />
      <div
        className="howto-pager"
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchX.current == null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (dx < -40) goPage(page + 1);
          else if (dx > 40) goPage(page - 1);
        }}
      >
        <h3>{t(lang, 'hp' + page + 't')}</h3>
        {page !== 5 && <HowtoArt page={page} />}
        <p className="howto-body">{t(lang, 'hp' + page + 'b')}</p>
        {page === 5 && <CardLibrary />}
      </div>
      <div className="howto-dots" role="tablist" aria-label={t(lang, 'howto')}>
        {Array.from({ length: HOWTO_PAGES }, (_, i) => (
          <button key={i} role="tab" aria-selected={i === page} aria-label={`${i + 1}`} className={i === page ? 'on' : ''} onClick={() => goPage(i)} />
        ))}
      </div>
      <div className="howto-nav">
        <button className="chipbtn" disabled={page === 0} onClick={() => goPage(page - 1)}>‹ {t(lang, 'back')}</button>
        <button className="chipbtn" disabled={page === HOWTO_PAGES - 1} onClick={() => goPage(page + 1)}>{t(lang, 'next')} ›</button>
      </div>
      <button className="btn" onClick={startTutorial}>{t(lang, 'replayTutorial')}</button>
      <p className="hint">{t(lang, 'reviewNote')}</p>
    </div>
  );
}

/* ---------------- About ---------------- */

const GLOSSARY_KEYS = ['gNkhondo', 'gMphamvu', 'gNsanja', 'gMfumu', 'gNyumba', 'gZikho', 'gNyenyezi', 'gMudzi', 'gMsika', 'gMvula', 'gTiyeni'];

export function AboutScreen() {
  const lang = useGame((s) => s.lang);
  return (
    <div className="screen">
      <TopBar title={t(lang, 'aboutTitle')} back />
      <div className="about-body">
        <p>{t(lang, 'aboutB1')}</p>
        <p>{t(lang, 'aboutB2')}</p>
        <p>{t(lang, 'aboutB3')}</p>
        <p>{t(lang, 'aboutB4')}</p>
        <div className="verline">
          <span>{t(lang, 'version')}: <b>{gameVersion}</b></span>
          <span>{t(lang, 'buildDate')}: <b>{BUILD_DATE}</b></span>
        </div>
        <h3>{t(lang, 'glossary')}</h3>
        <ul className="glossary">
          {GLOSSARY_KEYS.map((k) => <li key={k}>{t(lang, k)}</li>)}
        </ul>
        <p className="hint">{t(lang, 'reviewNote')}</p>
        <BugButton />
      </div>
    </div>
  );
}

function BugButton() {
  const lang = useGame((s) => s.lang);
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="bugbox">
      <button
        className="chipbtn"
        onClick={async () => {
          sfx.click();
          const ok = await copyBugReport();
          setMsg(t(lang, 'bugCopied') + (ok ? '' : ' (copy failed: screenshot this page)'));
          window.setTimeout(() => setMsg(null), 4000);
        }}
      >
        🐞 {t(lang, 'reportBug')}
      </button>
      {msg && <p className="hint">{msg}</p>}
    </div>
  );
}

/* ---------------- Credits ---------------- */

interface CredSection { title: string; items: string[] }

function parseCredits(md: string): CredSection[] {
  const sections: CredSection[] = [];
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('### ') || line.startsWith('## ')) {
      sections.push({ title: line.replace(/^###? /, ''), items: [] });
      continue;
    }
    const cur = sections[sections.length - 1];
    if (!cur) continue;
    if (line.startsWith('| ')) {
      const cells = line.split('|').map((c) => c.trim()).filter(Boolean);
      if (cells.length === 0 || cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
      if (cells.length >= 3 && cells[0] !== 'File') {
        cur.items.push(`${cells[1]}: ${cells[2]} (${cells[0]})`);
      }
    } else if (line.startsWith('- ')) {
      cur.items.push(line.slice(2));
    } else if (line.length > 0 && !line.startsWith('#')) {
      cur.items.push(line);
    }
  }
  return sections.filter((s) => s.items.length > 0);
}

export function CreditsScreen() {
  const lang = useGame((s) => s.lang);
  const sections = parseCredits(creditsRaw);
  return (
    <div className="screen">
      <TopBar title={t(lang, 'creditsTitle')} back />
      <div className="about-body">
        <p>{t(lang, 'credGame')}</p>
        <div className="verline">
          <span>{t(lang, 'version')}: <b>{gameVersion}</b></span>
        </div>
        {sections.map((s) => (
          <div key={s.title}>
            <h3>{s.title}</h3>
            <ul className="glossary">
              {s.items.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </div>
        ))}
        <div>
          <h3>Asset manifest</h3>
          <ul className="glossary">
            {getManifest().entries.filter((e) => /cc0|cc-by|mixamo/i.test(e.licence)).map((e) => (
              <li key={e.id}>{e.id}: {e.author} ({e.licence}), {e.sourceUrl}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
