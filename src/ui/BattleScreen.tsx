import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../state/store';
import { t } from './i18n';
import { CARDS } from '../../shared/sim/cards';
import { CardIcon } from './CardIcon';
import { BattleView, screenToSim, assistDeploy, viewApi, type DragState, type HudSnap, type HintSpot, type Floater } from '../render/BattleView';
import { ensureAudio, sfx } from '../audio/engine';
import { deckIsValid } from './screens';
import { TutorialGuide } from './Tutorial';
import { useOnlineBattle } from './useOnlineBattle';
import { net, useOnline } from '../net/online';
import { DebugOverlay, useDebugToggle, recordPointer } from './DebugOverlay';

function fmt(time: number, sudden: boolean): string {
  void sudden;
  const s = Math.max(0, Math.ceil(time));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function BattleScreen() {
  const deck = useGame((s) => s.deck);
  const difficulty = useGame((s) => s.difficulty);
  const quality = useGame((s) => s.quality);
  const lang = useGame((s) => s.lang);
  const muted = useGame((s) => s.muted);
  const barksOn = useGame((s) => s.barks);
  const go = useGame((s) => s.go);
  const addTrophies = useGame((s) => s.addTrophies);
  const arena = useGame((s) => s.arena);
  const trophies = useGame((s) => s.trophies);
  const setMuted = useGame((s) => s.setMuted);
  const setQuality = useGame((s) => s.setQuality);
  const tutorialMode = useGame((s) => s.tutorialMode);
  const [paused, setPaused] = useState(false);
  const autoplay = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('autoplay');
  const [coach, setCoach] = useState(() => {
    try { return !localStorage.getItem('nkhondo:coach'); } catch { return false; }
  });
  const [coachStep, setCoachStep] = useState(0);

  const [hud, setHud] = useState<HudSnap | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [matchKey, setMatchKey] = useState(0);
  const [ended, setEnded] = useState<{ winner: 0 | 1 | 2; stars: number; delta: number } | null>(null);
  const dragStart = useRef<{ x: number; y: number; moved: boolean; wasArmed: boolean }>({ x: 0, y: 0, moved: false, wasArmed: false });
  const hudRef = useRef<HudSnap | null>(null);
  hudRef.current = hud;
  const hintsRef = useRef<HintSpot[]>([]);

  const onHud = useCallback((h: HudSnap) => setHud(h), []);
  const [floaters, setFloaters] = useState<(Floater & { id: number })[]>([]);
  const [flash, setFlash] = useState<string | null>(null);
  const floaterId = useRef(1);
  const flashTimer = useRef<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [tutGlow, setTutGlow] = useState<string | null>(null);
  const [tutHints, setTutHints] = useState<{ hints: HintSpot[]; mode: 'own' | 'all' } | null>(null);
  const [shakeCard, setShakeCard] = useState<string | null>(null);
  const [energyFlash, setEnergyFlash] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1600);
  }, []);
  const denyEnergy = useCallback((card: string) => {
    sfx.error();
    setShakeCard(card);
    setEnergyFlash(true);
    showToast('Not enough mphamvu', true);
    window.setTimeout(() => setShakeCard(null), 450);
    window.setTimeout(() => setEnergyFlash(false), 550);
  }, [showToast]);

  const lastFloaterAt = useRef<Map<number, number>>(new Map());
  const onFloater = useCallback((f: Floater) => {
    const id = floaterId.current++;
    // damage-numbers setting: suppress combat damage text, keep callouts/kills
    if (f.dmg && !useGame.getState().dmgNumbers) return;
    // stack upward with jitter so numbers never cluster; merge hits within
    // 0.15s on the same target; max 3 visible per target; fade in 0.8s.
    const now = performance.now();
    const jitterX = (Math.random() - 0.5) * 26;
    setFloaters((fs) => {
      const tgt = f.tgt ?? -1;
      const same = tgt >= 0 ? fs.filter((x) => (x.tgt ?? -2) === tgt) : [];
      const last = tgt >= 0 ? lastFloaterAt.current.get(tgt) ?? -1e9 : -1e9;
      let text = f.text;
      let list = fs;
      // merge: same target within 150ms and both damage numbers -> sum
      if (tgt >= 0 && now - last < 150 && /^-?\d/.test(text)) {
        const prev = same[same.length - 1];
        if (prev && /^-?\d/.test(prev.text)) {
          const a = parseInt(prev.text.replace(/[^0-9-]/g, ''), 10) || 0;
          const b = parseInt(text.replace(/[^0-9-]/g, ''), 10) || 0;
          const crit = prev.text.includes('!') || text.includes('!');
          text = `${a + b < 0 ? a + b : `-${Math.abs(a) + Math.abs(b)}`}${crit ? '!' : ''}`;
          list = list.filter((x) => x.id !== prev.id);
        }
      }
      // max 3 per target: drop oldest for that target
      if (tgt >= 0 && same.length >= 3) {
        const drop = same[0].id;
        list = list.filter((x) => x.id !== drop);
      }
      const stack = tgt >= 0 ? Math.min(2, same.length) : 0;
      const item = { ...f, text, id, px: f.px + jitterX, py: f.py - stack * 16 };
      const next = list.length > 24 ? [...list.slice(list.length - 24), item] : [...list, item];
      return next;
    });
    if (f.tgt != null) lastFloaterAt.current.set(f.tgt, now);
    window.setTimeout(() => setFloaters((fs) => fs.filter((x) => x.id !== id)), 800);
    // flash the scoring card in hand so each card shows what it just did
    if (f.card) {
      const hand = hudRef.current?.hand ?? [];
      if (hand.includes(f.card)) {
        setFlash(f.card);
        if (flashTimer.current) window.clearTimeout(flashTimer.current);
        flashTimer.current = window.setTimeout(() => setFlash(null), 800);
      }
    }
  }, []);

  const onGameOver = useCallback((winner: 0 | 1 | 2) => {
    // online ranked matches: the server decides + settles Elo; ignore local end
    if (useOnline.getState().match) return;
    const h = hudRef.current;
    const enemyT = h?.towers.filter((x) => x.owner === 1) ?? [];
    const nsanjaDown = enemyT.filter((x) => x.kind === 'nsanja' && !x.alive).length;
    const chiefDown = enemyT.some((x) => x.kind === 'chief' && !x.alive);
    let stars = 0, delta = 0;
    if (winner === 0) {
      stars = chiefDown ? 3 : nsanjaDown + 1;
      delta = difficulty === 'hard' ? 36 : difficulty === 'easy' ? 24 : 30;
    } else if (winner === 2) { stars = 1; delta = 5; }
    else { stars = 0; delta = -20; }
    // tutorial matches never touch trophies
    if (!useGame.getState().tutorialMode) addTrophies(delta);
    setEnded({ winner, stars, delta });
  }, [addTrophies, difficulty]);

  // window-level drag tracking (works for mouse + touch even with pointer capture quirks).
  // Listeners attach ONCE; dragRef mirrors drag state synchronously so even an
  // instant tap (pointerup before React re-renders) can never be missed.
  const dragRef = useRef<DragState | null>(null);
  const [debugShow] = useDebugToggle();
  const snapGrid = (v: number) => Math.round(v * 2) / 2;
  useEffect(() => {
    const rec = (e: PointerEvent) => {
      try { recordPointer(e.type, e.clientX, e.clientY, e.target as Element | null); } catch { /* noop */ }
    };
    const move = (e: PointerEvent) => {
      rec(e);
      const d = dragRef.current;
      if (!d) return;
      if (Math.hypot(e.clientX - dragStart.current.x, e.clientY - dragStart.current.y) > 10) {
        dragStart.current.moved = true;
      }
      const p = screenToSim(e.clientX, e.clientY);
      if (!p || !viewApi.battle) return;
      const sx = snapGrid(p.x), sz = snapGrid(p.z);
      const ok = viewApi.battle.canDeploy(0, d.card, sx, sz).ok;
      dragRef.current = { ...d, sx, sz, valid: ok };
      setDrag(dragRef.current);
    };
    const down = (e: PointerEvent) => { rec(e); };
    const up = (e: PointerEvent) => {
      rec(e);
      const d = dragRef.current;
      if (!d) return;
      dragRef.current = null;
      const wasTap = !dragStart.current.moved;
      const card = d.card;
      if (wasTap) {
        // second tap on an armed card = instant smart-cast at the best spot
        if (dragStart.current.wasArmed && hintsRef.current.length > 0) {
          const h = hintsRef.current[0];
          setDrag(null);
          setSelected(null);
          if (!doDeploy(card, h.x, h.z)) {
            const chk = viewApi.battle?.canDeploy(0, card, h.x, h.z);
            showToast(chk && !chk.ok ? `Invalid: ${chk.reason}` : 'Invalid spot', true);
          }
          return;
        }
        setSelected((s) => (s === card ? null : card));
        setDrag(null);
        return;
      }
      // drag-drop: release outside canvas/arena = cancel (no nudge)
      const el = viewApi.el;
      let outside = false;
      if (el) {
        const r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) outside = true;
      }
      const p = screenToSim(e.clientX, e.clientY);
      setDrag(null);
      setSelected(null);
      if (outside || !p) return;
      if (!viewApi.battle) return;
      const sx = snapGrid(p.x), sz = snapGrid(p.z);
      const chk = viewApi.battle.canDeploy(0, card, sx, sz);
      if (chk.ok) { doDeploy(card, sx, sz); return; }
      if (chk.reason === 'energy') { denyEnergy(card); return; }
      if (chk.reason === 'over' || chk.reason === 'hand' || chk.reason === 'card') {
        showToast(`Invalid: ${chk.reason}`, true);
        return;
      }
      // Forgiving drop: troops/buildings clamp to own half, spells clamp
      // to the arena (nudgeDeploy). Own-half drops near the river/edge
      // still land; only truly enemy-side taps stay invalid.
      // NOTE: own half is the BOTTOM of the screen (larger clientY).
      if (doDeploy(card, sx, sz)) return;
      showToast(`Invalid: ${chk.reason}`, true);
      viewApi.debug.lastRay = { hit: true, x: sx, z: sz, tileX: Math.floor(p.x), tileY: Math.floor(p.z) };
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', down);
      window.removeEventListener('pointerup', up);
    };
  }, [denyEnergy, showToast]);

  const startDrag = (card: string, e: React.PointerEvent) => {
    ensureAudio();
    if (!hud || hud.over) return;
    const cost = CARDS[card].cost;
    if (hud.energy < cost) { denyEnergy(card); return; }
    dragStart.current = { x: e.clientX, y: e.clientY, moved: false, wasArmed: selected === card };
    const p = screenToSim(e.clientX, e.clientY);
    const sx = snapGrid(p?.x ?? 9);
    let sz = snapGrid(p && p.z < 15 ? p.z : 6);
    if (CARDS[card]?.type === 'spell') sz = snapGrid(p?.z ?? 16);
    const valid = viewApi.battle?.canDeploy(0, card, sx, sz).ok ?? false;
    setSelected(null);
    dragRef.current = { card, sx, sz, valid };
    setDrag(dragRef.current);
    sfx.click();
  };

  const setDragPos = useCallback((sx: number, sz: number, valid: boolean) => {
    setDrag((d) => (d ? { ...d, sx, sz, valid } : d));
  }, []);
  const clearSelected = useCallback(() => setSelected(null), []);
  const onlineResult = useOnline((s) => s.result);
  const onlineRematchAsked = useOnline((s) => s.rematchAsked);
  const onlineReconnecting = useOnline((s) => s.reconnecting);
  const onlinePing = useOnline((s) => s.ping);
  const [rematchSent, setRematchSent] = useState(false);

  // ---- online ranked mode (server-authoritative mirror sim) ----
  const on = useOnlineBattle(showToast);
  const onlineMatch = on.match;
  // fresh online match: clear stale overlays/floaters
  useEffect(() => {
    if (onlineMatch) {
      setEnded(null);
      setFloaters([]);
      setHud(null);
      setRematchSent(false);
      setSelected(null);
      setDrag(null);
      useOnline.getState().set({ result: null, rematchAsked: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlineMatch?.matchId]);
  const deployRef = useRef<(card: string, x: number, z: number, quiet?: boolean) => boolean>(assistDeploy);
  deployRef.current = (card, x, z, quiet = false) =>
    on.onlineViewProps ? on.sendDeploy(card, x, z) : assistDeploy(card, x, z, quiet);
  const doDeploy = (card: string, x: number, z: number, quiet = false) => deployRef.current(card, x, z, quiet);

  if (!tutorialMode && !on.match && !deckIsValid(deck)) {
    return (
      <div className="screen center">
        <p>Deck needs 8 cards.</p>
        <button className="btn" onClick={() => go('deck')}>{t(lang, 'deck')}</button>
      </div>
    );
  }

  const energy = hud?.energy ?? 5;
  const frac = hud?.energyFrac ?? 0;
  const total = Math.min(10, energy + frac);
  // suggested drop spots while a card is picked up
  const activeCard = drag?.card ?? selected;
  let hints: HintSpot[] = [];
  let hintMode: 'own' | 'all' | null = null;
  if (activeCard && !hud?.over) {
    const def = CARDS[activeCard];
    if (def.type !== 'spell') {
      hintMode = 'own';
      hints = [{ x: 4.1, z: 12.8 }, { x: 13.9, z: 12.8 }, { x: 9, z: 6 }];
    } else if (activeCard === 'roadblock') {
      hintMode = 'all';
      hints = [{ x: 4.1, z: 12.5 }, { x: 13.9, z: 12.5 }];
    } else if (activeCard === 'harvest') {
      hintMode = 'all';
      hints = [{ x: 9, z: 6 }];
    } else {
      // rain / surge: mark the biggest enemy cluster (sim is milli, hints tiles)
      hintMode = 'all';
      const es = viewApi.battle?.units.filter((u) => u.alive && u.owner === 1) ?? [];
      if (es.length > 0) {
        const cx = es.reduce((s, u) => s + u.x, 0) / es.length / 1000;
        const cz = es.reduce((s, u) => s + u.z, 0) / es.length / 1000;
        hints = [{ x: cx, z: cz }];
      } else {
        hints = [{ x: 9, z: 16 }];
      }
    }
  }
  hintsRef.current = hints;
  // tutorial markers override the normal hints
  const effHints = tutorialMode && tutHints ? tutHints.hints : hints;
  const effMode = tutorialMode && tutHints ? tutHints.mode : hintMode;
  const enemyStars = hud?.towers.filter((x) => x.owner === 1 && !x.alive).length ?? 0;
  const myStars = hud?.towers.filter((x) => x.owner === 0 && !x.alive).length ?? 0;
  // momentum: total remaining tower HP per side — shows where the game is going
  const hpOf = (owner: 0 | 1) => {
    const ts = hud?.towers.filter((x) => x.owner === owner) ?? [];
    const cur = ts.reduce((s, x) => s + Math.max(0, x.hp), 0);
    const max = ts.reduce((s, x) => s + x.maxHp, 0);
    return max > 0 ? cur / max : 0;
  };
  const mom0 = hpOf(0), mom1 = hpOf(1);
  const momLead = !hud ? 0 : Math.abs(mom0 - mom1) < 0.02 ? 0 : mom0 > mom1 ? 1 : -1;
  const myLevel = 1 + Math.floor(trophies / 100);
  const foeLevel = { easy: 2, normal: 5, hard: 8 }[difficulty] ?? 5;

  const openPause = () => { sfx.click(); setDrag(null); setSelected(null); viewApi.frozen = true; setPaused(true); };
  const resume = () => { sfx.click(); setPaused(false); viewApi.frozen = false; };
  const surrender = () => { setPaused(false); onGameOver(1); };
  const quitHome = () => { viewApi.frozen = false; setPaused(false); sfx.click(); go('home'); };

  return (
    <div className={'battle-root' + (tutorialMode ? ' tut-active' : '')}>
      <div className="arena-wrap" key={matchKey}>
        <BattleView
          playerDeck={deck} difficulty={tutorialMode ? 'easy' : difficulty} quality={quality} arena={arena} barksOn={barksOn && !muted}
          autoplay={autoplay} matchKey={matchKey}
          drag={drag} setDragPos={setDragPos} selected={selected} clearSelected={clearSelected}
          hints={effHints} hintMode={effMode}
          online={on.onlineViewProps}
          onFloater={onFloater}
          onHud={onHud} onGameOver={onGameOver}
          onInvalid={(reason, _x, _z) => {
            void _x; void _z;
            const friendly: Record<string, string> = {
              energy: 'Not enough mphamvu', half: 'Deploy on YOUR half',
              river: 'Blocked: river', arena: 'Outside arena',
              hand: 'Card not in hand', over: 'Match over', card: 'Bad card',
            };
            showToast(friendly[reason] ?? `Invalid: ${reason}`, true);
          }}
          onPoor={(card) => denyEnergy(card)}
        />
      </div>

      {/* desktop side panels over a blurred backdrop */}
      <div className="side-panel left">
        <div className="sp-name">{t(lang, 'youName')} <span>Lv {myLevel}</span></div>
        <div className="sp-troph"><CardIcon id="trophy" fallback="🏆" className="ticon" /> {trophies}</div>
        <div className="sp-deck">
          {deck.map((c) => (
            <span key={c} className="sp-mini" style={{ background: CARDS[c].color }} title={CARDS[c].nameEn}>
              <CardIcon id={c} fallback={CARDS[c].icon} />
            </span>
          ))}
        </div>
      </div>
      <div className="side-panel right">
        <div className="sp-name">{t(lang, 'foeName')} <span>Lv {foeLevel}</span></div>
        <div className="sp-diff">{t(lang, difficulty)}</div>
        <div className="sp-towers">
          {(hud?.towers ?? [])
            .filter((tw) => tw.owner === 1)
            .sort((a, b) => (a.kind === 'chief' ? -1 : b.kind === 'chief' ? 1 : a.id - b.id))
            .map((tw) => {
              const label = tw.kind === 'chief' ? 'King' : tw.lane === 0 ? 'Left' : tw.lane === 1 ? 'Right' : `Lane ${tw.lane}`;
              const pct = Math.max(0, tw.hp) / Math.max(1, tw.maxHp);
              return (
                <div key={tw.id} className="sp-tower-row" title={`${label}: ${Math.max(0, Math.round(tw.hp))}/${tw.maxHp}`}>
                  <span className="sp-tower-label">{label}</span>
                  <div className="sp-tower"><i style={{ width: `${pct * 100}%`, background: '#ff6a5a' }} /></div>
                  <span className="sp-tower-hp">{Math.max(0, Math.round(tw.hp))}</span>
                </div>
              );
            })}
        </div>
      </div>

      {debugShow && <DebugOverlay selected={selected} energy={hud?.energy ?? 5} />}

      {/* floating combat text */}
      <div className="floaters">
        {floaters.map((f) => (
          <span key={f.id} className={'floater ' + f.kind} style={{ left: f.px, top: f.py }}>{f.text}</span>
        ))}
      </div>

      {/* top HUD */}
      <div className="hud-top">
        {onlineMatch ? (
          <button
            className="iconbtn sm" title={t(lang, 'forfeit')}
            onClick={() => { sfx.click(); go('home'); }}
          >🏳</button>
        ) : (
          <button className="iconbtn sm" onClick={openPause}>⏸</button>
        )}
        <div className="plate foe">
          {onlineMatch ? (
            <>
              <div className="pname">{onlineMatch.foe.name}#{onlineMatch.foe.tag} <span>{onlineMatch.foe.rating} {t(lang, 'zikho')}</span></div>
              <div className="hud-stars">{'★'.repeat(enemyStars)}{'☆'.repeat(3 - enemyStars)}</div>
            </>
          ) : (
            <>
              <div className="pname">{t(lang, 'foeName')} <span>Lv {foeLevel}</span></div>
              <div className="hud-stars">{'★'.repeat(enemyStars)}{'☆'.repeat(3 - enemyStars)}</div>
            </>
          )}
        </div>
        <div className="hud-mid">
          <div className={'timer' + (hud?.sudden ? ' sudden' : '') + (hud?.doubleEnergy && !hud?.over ? ' hot' : '')}>
            {hud?.over ? '•' : hud?.sudden ? `⚡ ${fmt(Math.max(0, 60 - (hud.time - 180)), true)}` : `⏱ ${fmt(180 - Math.min(180, hud?.time ?? 0), false)}`}
          </div>
          {onlineMatch && (
            <div className={'pingdot' + (onlinePing < 120 ? ' ok' : onlinePing < 250 ? ' mid' : ' bad')} title={`${t(lang, 'ping')}: ${onlinePing}ms`}>
              ● {onlinePing}ms
            </div>
          )}
          {hud && !hud.over && (
            <div className="momentum" title="Tower health">
              <i className="you" style={{ width: `${(mom0 / Math.max(0.001, mom0 + mom1)) * 100}%` }} />
              <span>{momLead > 0 ? t(lang, 'youLead') : momLead < 0 ? t(lang, 'foeLead') : t(lang, 'even')}</span>
            </div>
          )}
        </div>
        <div className="plate you">
          <div className="pname">{t(lang, 'youName')} <span>Lv {myLevel}</span></div>
          <div className="hud-stars">{'★'.repeat(myStars)}{'☆'.repeat(3 - myStars)}</div>
        </div>
      </div>
      {hud?.doubleEnergy && !hud.over && !hud.sudden && (
        <div className="final-banner">🔥 {t(lang, 'final')}</div>
      )}
      {hud?.sudden && !hud.over && (
        <div className="final-banner sudden">⚡ {t(lang, 'suddenDeath')}</div>
      )}

      {/* bottom HUD */}
      <div className="hud-bottom">
        {selected && !drag && !hud?.over && (
          <div className="hintbar">
            {CARDS[selected].type !== 'spell' ? t(lang, 'dropOwn') : t(lang, 'dropAny')}
          </div>
        )}
        {toast && <div className={'deploy-toast' + (toast.err ? ' err' : '')}>{toast.msg}</div>}
        <div className={'mphamvu' + (energyFlash ? ' flash-err' : '') + (tutorialMode && tutGlow === 'energy' ? ' tut-glow' : '')}>
          <div className="esegs">
            {Array.from({ length: 10 }, (_, i) => {
              const fill = Math.min(1, Math.max(0, total - i));
              return <span key={i} className="eseg"><i style={{ transform: `scaleX(${fill})` }} /></span>;
            })}
          </div>
          <b key={energy} className="enum">{energy}</b>
        </div>
        <div className="hand">
          {(hud?.hand ?? []).map((c, i) => {
            const def = CARDS[c];
            const afford = energy >= def.cost;
            return (
              <button
                key={`${c}-${i}`}
                className={'gcard' + (afford ? '' : ' poor') + (selected === c ? ' sel' : '') + (drag?.card === c ? ' dragging' : '') + (flash === c ? ' flash' : '') + (shakeCard === c ? ' shake' : '') + (tutorialMode && tutGlow === c ? ' tut-glow' : '') + ' rar-' + def.rarity}
                style={{ ['--cc' as string]: def.color }}
                onPointerDown={(e) => startDrag(c, e)}
                onContextMenu={(e) => e.preventDefault()}
                title={def.nameEn}
              >
                {!afford && (
                  <span className="gfill"><i style={{ height: `${Math.min(100, (energy / Math.max(1, def.cost)) * 100)}%` }} /></span>
                )}
                <span className="gcost">{def.cost}</span>
                <span className="gicon"><CardIcon id={c} fallback={def.icon} /></span>
                <span className="gname">{def.nameCh}</span>
              </button>
            );
          })}
          <div className="nextcard" title={hud?.next ? `${CARDS[hud.next].nameCh}: ${CARDS[hud.next].nameEn}` : t(lang, 'nextCard')}>
            <span>{t(lang, 'nextCard')}</span>
            <b className="nextport" style={{ borderColor: hud?.next ? CARDS[hud.next].color : '#888' }}>
              {hud?.next ? <CardIcon id={hud.next} fallback={CARDS[hud.next].icon} /> : '?'}
              {hud?.next && <em>{CARDS[hud.next].cost}</em>}
            </b>
            <small>{hud?.next ? CARDS[hud.next].nameCh : ''}</small>
          </div>
        </div>
        {!hud && (
          <div className="load-overlay">
            <div className="load-card">
              <div className="load-title">NKHONDO</div>
              <div className="loadbar"><i /></div>
              <div className="load-sub">Loading arena… (procedural fallback ready)</div>
            </div>
          </div>
        )}
      </div>

      {/* first-battle coach (hidden during the guided tutorial) */}
      {coach && !ended && !tutorialMode && (
        <div className="overlay coach">
          <div className="coach-card">
            <div className="coach-dots">{[0, 1, 2].map((i) => <span key={i} className={i === coachStep ? 'on' : ''} />)}</div>
            <p>{t(lang, 'coach' + coachStep)}</p>
            <button
              className="btn"
              onClick={() => {
                sfx.click();
                if (coachStep < 2) setCoachStep(coachStep + 1);
                else {
                  try { localStorage.setItem('nkhondo:coach', '1'); } catch { /* noop */ }
                  setCoach(false);
                }
              }}
            >
              {coachStep < 2 ? '→' : t(lang, 'gotIt')}
            </button>
          </div>
        </div>
      )}

      {/* pause menu */}
      {paused && !ended && (
        <div className="overlay">
          <div className="pause-card">
            <h1>{t(lang, 'paused')}</h1>
            <button className="btn big" onClick={resume}>{t(lang, 'resume')}</button>
            <div className="pause-row">
              <span>{t(lang, 'sound')}</span>
              <button className={'toggle' + (muted ? '' : ' on')} onClick={() => setMuted(!muted)}>{muted ? 'OFF' : 'ON'}</button>
            </div>
            <div className="seg">
              {(['low', 'med', 'high'] as const).map((q) => (
                <button key={q} className={quality === q ? 'on' : ''} onClick={() => { setQuality(q); sfx.click(); }}>{t(lang, q)}</button>
              ))}
            </div>
            <button className="btn danger" onClick={surrender}>{t(lang, 'surrender')}</button>
          </div>
        </div>
      )}

      {/* guided tutorial */}
      {tutorialMode && (
        <TutorialGuide
          key={matchKey}
          hud={hud}
          setSelected={setSelected}
          setTutHints={setTutHints}
          setTutGlow={setTutGlow}
        />
      )}

      {/* online: starting countdown cover */}
      {onlineMatch && !on.started && !onlineResult && (
        <div className="overlay">
          <div className="pause-card">
            <h1>VS</h1>
            <p>{onlineMatch.foe.name}#{onlineMatch.foe.tag} • {onlineMatch.foe.rating} {t(lang, 'zikho')}</p>
            <div className="spinner" />
          </div>
        </div>
      )}

      {/* online: reconnecting */}
      {onlineMatch && onlineReconnecting && on.started && !onlineResult && (
        <div className="reconnect-bar">{t(lang, 'reconnecting')}</div>
      )}

      {/* online ranked result (server-authoritative) */}
      {onlineMatch && onlineResult && (
        <div className="overlay">
          <div className={'result-card' + (onlineResult.winner === 2 ? ' draw' : onlineResult.winner === on.myTeam ? ' win' : ' lose')}>
            <h1>
              {onlineResult.winner === 2 ? t(lang, 'draw') : onlineResult.winner === on.myTeam ? t(lang, 'victory') : t(lang, 'defeat')}
            </h1>
            <div className={'tdelta' + (onlineResult.youDelta >= 0 ? ' up' : ' down')}>
              {onlineResult.youDelta >= 0 ? '+' : ''}{onlineResult.youDelta} {t(lang, 'zikho')} → {onlineResult.youRating}
            </div>
            <div className="tlabel">{onlineResult.reason}</div>
            {onlineRematchAsked && !rematchSent && <p className="hint">{t(lang, 'rematchAsked')}</p>}
            <div className="row">
              <button className="btn" onClick={() => { sfx.click(); go('home'); }}>{t(lang, 'home')}</button>
              <button
                className="btn big"
                disabled={rematchSent}
                onClick={() => {
                  sfx.horn();
                  net.send({ type: 'rematch' });
                  setRematchSent(true);
                }}
              >
                {rematchSent ? t(lang, 'waitingForFoe') : t(lang, 'rematch')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* result overlay */}
      {ended && (        <div className="overlay">
          <div className={'result-card' + (ended.winner === 0 ? ' win' : ended.winner === 2 ? ' draw' : ' lose')}>
            <h1>{ended.winner === 0 ? t(lang, 'victory') : ended.winner === 2 ? t(lang, 'draw') : t(lang, 'defeat')}</h1>
            <div className="stars">{'★'.repeat(ended.stars)}{'☆'.repeat(3 - ended.stars)}</div>
            <div className="tlabel">{t(lang, 'stars')}</div>
            <div className={'tdelta' + (ended.delta >= 0 ? ' up' : ' down')}>
              {ended.delta >= 0 ? '+' : ''}{ended.delta} <CardIcon id="trophy" fallback="🏆" className="ticon" />
            </div>
            <div className="row">
              <button className="btn" onClick={quitHome}>{t(lang, 'home')}</button>
              <button className="btn big" onClick={() => { viewApi.frozen = false; sfx.horn(); setEnded(null); setSelected(null); setDrag(null); setHud(null); setTutGlow(null); setTutHints(null); setMatchKey((k) => k + 1); }}>
                {t(lang, 'rematch')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

