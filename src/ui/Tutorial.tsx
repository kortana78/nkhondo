import { useEffect, useRef, useState } from 'react';
import { useGame } from '../state/store';
import { t } from './i18n';
import { sfx } from '../audio/engine';
import { viewApi, type HudSnap, type HintSpot } from '../render/BattleView';

interface GuideProps {
  hud: HudSnap | null;
  setSelected: (c: string | null) => void;
  setTutHints: (v: { hints: HintSpot[]; mode: 'own' | 'all' } | null) => void;
  setTutGlow: (v: string | null) => void;
}

const NEED: Record<number, string> = { 1: 'mlonda', 3: 'njuchi', 4: 'rain', 5: 'zikwanje' };
const MARK: Record<number, { hints: HintSpot[]; mode: 'own' | 'all' }> = {
  1: { hints: [{ x: 4.1, z: 12.8 }], mode: 'own' },
  3: { hints: [{ x: 13.9, z: 7 }], mode: 'own' },
  4: { hints: [{ x: 13.9, z: 18 }], mode: 'all' },
  5: { hints: [{ x: 4.1, z: 12.8 }], mode: 'own' },
};

function cheatEnergy() {
  const b = viewApi.battle;
  if (b) { b.energy[0] = 10; b.energyFrac[0] = 0; }
}

function ensureInHand(card: string) {
  const b = viewApi.battle;
  if (!b) return;
  if (!b.hands[0].includes(card)) {
    b.hands[0] = [card, ...b.hands[0].slice(0, 3)];
  }
  cheatEnergy();
}

function enemyWave() {
  const b = viewApi.battle;
  if (!b) return;
  b.energy[1] = 10;
  if (!b.hands[1].includes('fisi')) b.hands[1] = ['fisi', ...b.hands[1].slice(0, 3)];
  b.deploy(1, 'fisi', 13.9, 20.5);
}

function softenEnemyNsanja() {
  const b = viewApi.battle;
  if (!b) return;
  for (const tw of b.towers) {
    if (tw.owner === 1 && tw.kind === 'nsanja' && tw.alive) {
      tw.hp = Math.min(tw.hp, 200);
    }
  }
}

export function TutorialGuide({ hud, setSelected, setTutHints, setTutGlow }: GuideProps) {
  const lang = useGame((s) => s.lang);
  const go = useGame((s) => s.go);
  const setTutorialMode = useGame((s) => s.setTutorialMode);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [ready, setReady] = useState(false);
  const stepRef = useRef(0);
  useEffect(() => { stepRef.current = step; }, [step]);

  const exit = (completed: boolean) => {
    try { localStorage.setItem('nkhondo:tutorial', completed ? '1' : 'skipped'); } catch { /* noop */ }
    setTutHints(null);
    setTutGlow(null);
    setSelected(null);
    setTutorialMode(false);
    sfx.click();
    go('home');
  };

  // wait for the battle, then set up the fixed training hands
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      const b = viewApi.battle;
      tries++;
      if (b) {
        window.clearInterval(id);
        b.energy[0] = 10;
        b.energyFrac[0] = 0;
        b.hands[0] = ['mlonda', 'njuchi', 'rain', 'zikwanje'];
        setReady(true);
      } else if (tries > 50) {
        window.clearInterval(id);
      }
    }, 200);
    return () => window.clearInterval(id);
  }, []);

  // per-step setup: markers, glow, cheats, scripted enemy
  useEffect(() => {
    if (!ready || done) return;
    setTutHints(MARK[step] ?? null);
    const need = NEED[step];
    if (need) {
      ensureInHand(need);
      setTutGlow(need);
    } else if (step === 0) {
      cheatEnergy();
      setTutGlow('energy');
    } else {
      setTutGlow(null);
    }
    if (step === 3) enemyWave();
  }, [step, ready, done, setTutHints, setTutGlow]);

  // step 2 auto-advances after a few seconds of watching
  useEffect(() => {
    if (step !== 2 || done) return;
    const id = window.setTimeout(() => setStep(3), 6000);
    return () => window.clearTimeout(id);
  }, [step, done]);

  // poll step-completion conditions
  useEffect(() => {
    if (!ready || done) return;
    const id = window.setInterval(() => {
      const b = viewApi.battle;
      if (!b) return;
      const s = stepRef.current;
      if (s === 1 && b.units.some((u) => u.owner === 0 && u.card === 'mlonda' && u.alive)) {
        sfx.deploy();
        setStep(2);
      } else if (s === 3 && b.units.some((u) => u.owner === 0 && u.card === 'njuchi' && u.alive)) {
        sfx.deploy();
        setStep(4);
      } else if (s === 4 && b.rains.length > 0) {
        setStep(5);
      } else if (s === 5 && b.units.some((u) => u.owner === 0 && u.card === 'zikwanje')) {
        softenEnemyNsanja();
        setStep(6);
      } else if (s === 6) {
        const h = hud;
        const fallen = h?.towers.some((tw) => tw.owner === 1 && tw.kind === 'nsanja' && !tw.alive);
        const fallenSim = b.towers.some((tw) => tw.owner === 1 && tw.kind === 'nsanja' && !tw.alive);
        if (fallen || fallenSim) {
          setTutHints(null);
          setTutGlow(null);
          setSelected(null);
          try { localStorage.setItem('nkhondo:tutorial', '1'); } catch { /* noop */ }
          setDone(true);
        }
      }
    }, 400);
    return () => window.clearInterval(id);
  }, [ready, done, hud, setTutHints, setTutGlow, setSelected]);

  // if the match itself ends, finish the tutorial too
  useEffect(() => {
    if (hud?.over && !done) {
      setTutHints(null);
      setTutGlow(null);
      try { localStorage.setItem('nkhondo:tutorial', '1'); } catch { /* noop */ }
      setDone(true);
    }
  }, [hud?.over, done, setTutHints, setTutGlow]);

  if (done) {
    return (
      <div className="overlay">
        <div className="result-card win">
          <h1>{t(lang, 'tutDone')}</h1>
          <div className="stars">★★★</div>
          <div className="row">
            <button className="btn big" onClick={() => exit(true)}>{t(lang, 'tutDoneBtn')}</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tut-guide">
      <div className="tut-text">{t(lang, 'tut' + step)}</div>
      <div className="tut-row">
        {(step === 0 || step === 2) && (
          <button className="btn" onClick={() => { sfx.click(); cheatEnergy(); setStep((s) => Math.min(6, s + 1)); }}>
            {t(lang, 'next')}
          </button>
        )}
        <button className="chipbtn" onClick={() => exit(false)}>{t(lang, 'skip')}</button>
      </div>
    </div>
  );
}
