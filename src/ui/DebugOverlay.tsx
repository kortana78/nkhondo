import { useEffect, useState } from 'react';
import { viewApi, screenToSim } from '../render/BattleView';
import { CARDS, targetsLabel } from '../../shared/sim/cards';

export function useDebugToggle() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setShow((s) => !s); }
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length >= 3) setShow((s) => !s);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('touchstart', onTouch as EventListener);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('touchstart', onTouch as EventListener);
    };
  }, []);
  return [show, setShow] as const;
}

export function recordPointer(type: string, x: number, y: number, target: Element | null) {
  const tag = target ? `${target.tagName.toLowerCase()}${(target as HTMLElement).className ? '.' + String((target as HTMLElement).className).split(' ').slice(0, 2).join('.') : ''}` : 'null';
  viewApi.debug.lastPointer = { type, x: Math.round(x), y: Math.round(y), target: tag.slice(0, 80) };
  try {
    const p = screenToSim(x, y);
    if (p) {
      viewApi.debug.lastRay = {
        hit: true, x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100,
        tileX: Math.floor(p.x), tileY: Math.floor(p.z),
      };
    } else {
      viewApi.debug.lastRay = { hit: false, x: 0, z: 0, tileX: -1, tileY: -1 };
    }
  } catch {
    viewApi.debug.lastRay = { hit: false, x: 0, z: 0, tileX: -1, tileY: -1 };
  }
}

/** rAF FPS meter for beta perf reports (F1 overlay). Not part of the sim. */
export function useFps() {
  const [fps, setFps] = useState(0);
  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    let raf = 0;
    const loop = () => {
      frames++;
      const now = performance.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return fps;
}

export function DebugOverlay({ selected, energy }: { selected: string | null; energy: number }) {
  const [, force] = useState(0);
  const fps = useFps();
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 300);
    return () => window.clearInterval(id);
  }, []);
  const d = viewApi.debug;
  const b = viewApi.battle;
  let deployStr = 'no card selected';
  let deployOk: boolean | null = null;
  if (b && selected && d.lastRay?.hit) {
    const chk = b.canDeploy(0, selected, d.lastRay.x, d.lastRay.z);
    deployOk = chk.ok;
    deployStr = chk.ok ? 'OK' : `REJECTED: ${chk.reason}`;
  } else if (b && selected && !d.lastRay) {
    deployStr = 'no raycast yet: tap arena';
  } else if (b && selected) {
    const chk = b.canDeploy(0, selected, 9, 6);
    deployStr = `sample (9,6): ${chk.ok ? 'OK' : 'REJECTED: ' + chk.reason}`;
  }
  const reasonHint = (r: string) => {
    switch (r) {
      case 'energy': return 'not enough energy';
      case 'half': return 'wrong zone (must be own half)';
      case 'river': return 'tile blocked (river)';
      case 'arena': return 'outside arena';
      case 'hand': return 'card not in hand';
      case 'over': return 'match over';
      default: return r;
    }
  };
  return (
    <div
      style={{
        position: 'absolute', top: 44, left: 6, zIndex: 50, maxWidth: 340,
        background: 'rgba(0,0,0,0.82)', color: '#9fe8ff', fontSize: 11,
        fontFamily: 'monospace', padding: 8, borderRadius: 8,
        pointerEvents: 'none', whiteSpace: 'pre-wrap', lineHeight: 1.45,
      }}
    >
      <div><b>DEBUG (F1 / 3-finger)</b> fps={fps} tick={b?.tick ?? d.tick} units={b?.units.length ?? d.unitCount}{b ? ` (air ${b.units.filter((u) => u.alive && u.layer === 'air').length} / ground ${b.units.filter((u) => u.alive && u.layer === 'ground').length})` : ''}</div>
      {selected && CARDS[selected] && (
        <div>
          {selected}: {CARDS[selected].type} • ⬢{CARDS[selected].cost} • {CARDS[selected].rarity} • Targets: {targetsLabel(CARDS[selected])}
          {CARDS[selected].subs.map((s) => ` [${s.key}:${s.layer}/${s.canTarget}]`).join('')}
        </div>
      )}
      <div>pointer: {d.lastPointer ? `${d.lastPointer.type} ${d.lastPointer.x},${d.lastPointer.y} tgt=${d.lastPointer.target}` : '···'}</div>
      <div>ray: {d.lastRay ? `${d.lastRay.hit ? 'HIT' : 'MISS'} world ${d.lastRay.x},${d.lastRay.z} tile ${d.lastRay.tileX},${d.lastRay.tileY}` : '···'}</div>
      <div>selected: {selected ?? '···'} energy: {energy}</div>
      <div>deploy: <span style={{ color: deployOk === false ? '#ff7a6a' : '#7dff8a' }}>{deployStr.includes('REJECTED') ? deployStr.split('REJECTED: ').map((s, i) => (i === 1 ? reasonHint(s) : s)).join('REJECTED: ') : deployStr}</span></div>
      <div>combat last {d.lastCombat.length}:</div>
      {d.lastCombat.length === 0 && <div>  (no hits yet)</div>}
      {d.lastCombat.slice(-10).map((c, i) => (
        <div key={i}>  {c.kind} {c.a ?? '?'}→{c.b ?? '?'} dmg={c.dmg ?? '-'} hpAfter={c.hpAfter ?? '-'}</div>
      ))}
    </div>
  );
}
