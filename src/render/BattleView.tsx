import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Battle, TICKS_PER_SEC, nudgeDeploy, toT, type Team } from '../../shared/sim/battle';
import { AIController, type Difficulty } from '../../shared/sim/ai';
import { ALL_CARD_IDS, CARDS } from '../../shared/sim/cards';
import { useGame, type Quality, type ArenaId } from '../state/store';
import { WX, WZ } from './world';
import { ArenaMudzi } from './ArenaMudzi';
import { ArenaMsika } from './ArenaMsika';
import { UnitMesh, type UnitViewData } from './UnitMesh';
import { TowerMesh } from './TowerMesh';
import { EffectsLayer, type FxItem } from './EffectsLayer';
import { sfx, bark, setRaining, setIntensity } from '../audio/engine';

export interface DragState { card: string; sx: number; sz: number; valid: boolean }
export interface HudSnap {
  time: number; sudden: boolean; over: boolean; doubleEnergy: boolean;
  energy: number; energyFrac: number; hand: string[]; next: string;
  towers: { id: number; owner: Team; kind: string; lane: number; hp: number; maxHp: number; alive: boolean }[];
  unitCount: number;
}

// ---- module API shared with HUD (drag/drop + deploy) ----
export interface DebugCombat { a?: number; b?: number; dmg?: number; hpAfter?: number; kind: string; t: number }
export const viewApi: {
  battle: Battle | null;
  camera: THREE.Camera | null;
  el: HTMLCanvasElement | null;
  frozen: boolean;
  debug: {
    tick: number;
    unitCount: number;
    lastCombat: DebugCombat[];
    lastPointer: { type: string; x: number; y: number; target: string } | null;
    lastRay: { hit: boolean; x: number; z: number; tileX: number; tileY: number } | null;
  };
} = {
  battle: null, camera: null, el: null, frozen: false,
  debug: { tick: 0, unitCount: 0, lastCombat: [], lastPointer: null, lastRay: null },
};

export function screenToSim(clientX: number, clientY: number): { x: number; z: number } | null {
  const { camera, el } = viewApi;
  if (!camera || !el) return null;
  const r = el.getBoundingClientRect();
  const nx = ((clientX - r.left) / r.width) * 2 - 1;
  const ny = -((clientY - r.top) / r.height) * 2 + 1;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(new THREE.Vector2(nx, ny), camera);
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const v = new THREE.Vector3();
  if (!ray.ray.intersectPlane(plane, v)) return null;
  return { x: v.x + 9, z: 16 - v.z };
}

export function playerDeploy(card: string, x: number, z: number): boolean {
  const b = viewApi.battle;
  if (!b) return false;
  const ok = b.deploy(0, card, x, z);
  if (!ok) sfx.error();
  return ok;
}

/** Forgiving deploy: exact spot first, else nudge troops/buildings to the
 *  nearest legal point on your half so near-miss drops still land.
 *  (Shared implementation — server authority uses the same code.) */
export function assistDeploy(card: string, x: number, z: number, quiet = false): boolean {
  const b = viewApi.battle;
  if (!b) return false;
  const spot = nudgeDeploy(b, 0, card, x, z);
  if (spot && b.deploy(0, card, spot.x, spot.z)) return true;
  if (!quiet) sfx.error();
  return false;
}

export interface HintSpot { x: number; z: number }
export interface Floater { px: number; py: number; text: string; kind: 'good' | 'bad' | 'kill' | 'boom' | 'callout'; card?: string; tgt?: number; dmg?: boolean }

interface Props {
  playerDeck: string[];
  difficulty: Difficulty;
  quality: Quality;
  arena: ArenaId;
  barksOn: boolean;
  autoplay: boolean;
  /** Rematch counter: forces a fresh offline Battle + AI when it changes. */
  matchKey?: number;
  drag: DragState | null;
  setDragPos: (sx: number, sz: number, valid: boolean) => void;
  selected: string | null;
  hints: HintSpot[];
  hintMode: 'own' | 'all' | null;
  onFloater: (f: Floater) => void;
  clearSelected: () => void;
  onHud: (h: HudSnap) => void;
  onGameOver: (winner: 0 | 1 | 2) => void;
  onInvalid?: (reason: string, x: number, z: number) => void;
  onPoor?: (card: string) => void;
  /** Online ranked mode: external authoritative-sim wiring. When present,
   *  no AI is created and deploys route through deployImpl. */
  online?: {
    battle: Battle;
    beforeStep?: (b: Battle) => void;
    deployImpl?: (card: string, x: number, z: number, quiet?: boolean) => boolean;
    signalFx?: { n: number; kind: FxItem['kind']; x: number; z: number; team: 0 | 1 | undefined } | null;
  } | null;
}

let fxId = 1;
const shake: { v: number } = { v: 0 };
const pulse: { v: number } = { v: 0 };

function CameraRig() {
  const { camera, size } = useThree();
  useFrame(({ clock }) => {
    const aspect = size.width / Math.max(1, size.height);
    const d = aspect < 0.75 ? 1.58 : aspect < 1.1 ? 1.24 : 1.06;
    const zoom = 1 - pulse.v * 0.07;
    const t = clock.elapsedTime;
    const sx = (Math.sin(t * 61.7) + Math.sin(t * 38.3)) * 0.5 * shake.v * 0.45;
    const sy = (Math.sin(t * 55.1) + Math.sin(t * 44.7)) * 0.5 * shake.v * 0.3;
    camera.position.set(sx, 26.5 * d * zoom, 20 * d * zoom + 1);
    camera.lookAt(0, 0, -0.6 + sy);
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 50) {
      camera.fov = 50;
      camera.updateProjectionMatrix();
    }
    shake.v = Math.max(0, shake.v - 0.025);
    pulse.v = Math.max(0, pulse.v - 0.018);
  });
  return null;
}

const ARENA_THEME: Record<ArenaId, {
  sky: string; fog: [string, number, number];
  hemiSky: string; hemiGround: string; hemiInt: number;
  sunPos: [number, number, number]; sunInt: number; sunColor: string;
}> = {
  mudzi: {
    sky: '#aee0f5', fog: ['#cfe8c8', 42, 95],
    hemiSky: '#bcd8ff', hemiGround: '#8a5a35', hemiInt: 0.75,
    sunPos: [-12, 20, 8], sunInt: 1.9, sunColor: '#ffe3b3',
  },
  msika: {
    sky: '#b8dcf2', fog: ['#d8e8ee', 46, 105],
    hemiSky: '#d8ecff', hemiGround: '#9a8a6a', hemiInt: 0.95,
    sunPos: [-3, 27, 7], sunInt: 2.15, sunColor: '#fff6e8',
  },
};

function ArenaLighting({ arena, quality }: { arena: ArenaId; quality: Quality }) {
  const th = ARENA_THEME[arena];
  const sun = useRef<THREE.DirectionalLight>(null!);
  useFrame(({ clock }) => {
    if (!sun.current) return;
    // slow cloud shadows drifting across the warm afternoon sun
    const t = clock.elapsedTime;
    sun.current.intensity = th.sunInt * (1 + 0.07 * Math.sin(t * 0.13) + 0.035 * Math.sin(t * 0.041 + 2));
  });
  // low quality: no SSAO/bloom (no postprocessing pass at all), small shadows.
  // med/high: warm afternoon sun, PCF-soft 2048 shadows, hemisphere fill.
  // (SSAO/bloom stay off — VFX uses emissive glow instead, keeps 60fps.)
  const shadowSize = quality === 'low' ? 512 : 2048;
  return (
    <group>
      <hemisphereLight args={[th.hemiSky, th.hemiGround, th.hemiInt]} />
      <directionalLight
        ref={sun}
        position={th.sunPos} intensity={th.sunInt} color={th.sunColor}
        castShadow={quality !== 'low'}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-16} shadow-camera-right={16}
        shadow-camera-top={20} shadow-camera-bottom={-20}
        shadow-bias={-0.0004}
      />
      {/* cool rim/fill from behind for unit + tower edge separation */}
      <directionalLight position={[10, 12, -20]} intensity={0.55} color="#bcd0ff" />
    </group>
  );
}

/** Warm sky-gradient dome (never flat): horizon cream -> zenith blue. */
export function SkyDome({ top = '#7ec0ee', bottom = '#f5eedd' }: { top?: string; bottom?: string }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, bottom: { value: new THREE.Color(bottom) } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
      void main(){ float h = normalize(vP).y * 0.5 + 0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.65, h)), 1.0); }`,
  }), [top, bottom]);
  return (
    <mesh position={[0, 0, 0]}>
      <sphereGeometry args={[90, 16, 12]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function RegisterApi() {  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    viewApi.camera = camera;
    viewApi.el = gl.domElement;
    // debug/testing hook (screenshots, tutorial): raw sim access
    try { (window as unknown as { __nkhondo?: unknown }).__nkhondo = viewApi; } catch { /* noop */ }
    return () => { viewApi.camera = null; viewApi.el = null; };
  }, [camera, gl]);
  return null;
}

/** sim coords -> screen px (camera is fixed, so spawn-time projection is enough) */
function project(x: number, z: number): { px: number; py: number } | null {
  const { camera, el } = viewApi;
  if (!camera || !el) return null;
  const v = new THREE.Vector3(WX(x), 1.1, WZ(z)).project(camera);
  const r = el.getBoundingClientRect();
  return { px: (v.x * 0.5 + 0.5) * r.width, py: (-v.y * 0.5 + 0.5) * r.height };
}

function Scene({ battle, ai, aiAuto, props }: { battle: Battle; ai: AIController | null; aiAuto: AIController | null; props: Props }) {
  const [snap, setSnap] = useState(0);
  const [fx, setFx] = useState<(FxItem & { born: number })[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const acc = useRef(0);
  const slowUntil = useRef(0);
  const hitStopUntil = useRef(0);
  const overSent = useRef(false);
  const lastHitSfx = useRef(0);
  const nowRef = useRef(0);
  // hover ghost: where an armed (tapped) card would land
  const [ghost, setGhost] = useState<{ x: number; z: number } | null>(null);
  useEffect(() => { if (!props.selected) setGhost(null); }, [props.selected]);

  const pushFx = (kind: FxItem['kind'], x: number, z: number, team: 0 | 1 | undefined, born: number, tx?: number, tz?: number, ty?: number) => {
    const item = { id: fxId++, kind, x, z, team, born, tx, tz, ty };
    setFx((f) => (f.length > 110 ? [...f.slice(f.length - 110), item] : [...f, item]));
  };

  // online ghost signals from the parent (send ack / reject feedback)
  const sigN = props.online?.signalFx?.n ?? 0;
  useEffect(() => {
    const s = props.online?.signalFx;
    if (s && s.n > 0) pushFx(s.kind, s.x, s.z, s.team, nowRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sigN]);

  useFrame((state, rawDt) => {
    if (viewApi.frozen) return; // pause menu: keep rendering, stop stepping
    const dt = Math.min(0.1, rawDt);
    nowRef.current = state.clock.elapsedTime;
    const now = performance.now();
    let scale = now < slowUntil.current ? 0.35 : 1;
    if (now < hitStopUntil.current) scale = 0; // hit-stop freeze (heavy only)
    acc.current += dt * scale;
    const stepLen = 1 / TICKS_PER_SEC;
    let stepped = 0;
    while (acc.current >= stepLen && stepped < 4) {
      acc.current -= stepLen;
      if (battle.over) { acc.current = 0; break; }
      stepped++;
        if (aiAuto) {
          const a0 = aiAuto.update(battle);
          if (a0) battle.deploy(0, a0.card, a0.x, a0.z);
        }
        if (ai) {
          const a = ai.update(battle);
          if (a) battle.deploy(1, a.card, a.x, a.z);
        }
        props.online?.beforeStep?.(battle);
        battle.step();
        const t = state.clock.elapsedTime;
        setIntensity(battle.doubleEnergy);
        viewApi.debug.tick = battle.tick;
        viewApi.debug.unitCount = battle.units.length;
        const drained = battle.drainEvents();
        for (const e of drained) {
          if (e.kind === 'hit' || e.kind === 'miss' || e.kind === 'death' || e.kind === 'summon' || e.kind === 'sting' || e.kind === 'sweep' || e.kind === 'bolt' || e.kind === 'curse' || e.kind === 'knock') {
            let hpAfter: number | undefined;
            if (e.b != null) {
              const uu = battle.units.find((v) => v.id === e.b);
              const ttw = battle.towers.find((v) => v.id === e.b);
              hpAfter = uu ? Math.max(0, Math.round(uu.hp)) : ttw ? Math.max(0, Math.round(ttw.hp)) : undefined;
            }
            viewApi.debug.lastCombat.push({ a: e.a, b: e.b, dmg: e.dmg, hpAfter, kind: e.kind, t: battle.time });
            if (viewApi.debug.lastCombat.length > 10) viewApi.debug.lastCombat.shift();
          }
          if (e.kind === 'deploy' && e.x != null && e.z != null) {
            pushFx('ring', e.x, e.z, e.team, t);
            // unique spawn moment per card — no two feel the same
            if (e.card === 'mfiti') {
              // rises out of swirling smoke at night-blue light
              for (let i = 0; i < 5; i++) pushFx('smoke', e.x + (Math.random() - 0.5) * 1.6, (e.z ?? 0) + (Math.random() - 0.5) * 1.2, e.team, t);
              pushFx('pulseRing', e.x, e.z, e.team, t);
              if (e.team === 0) { sfx.whisper(); sfx.hoot(); sfx.hum(); bark(e.card, props.barksOn); }
              else { sfx.whisper(); sfx.hoot(); }
            } else if (e.card === 'zikwanje') {
              // they step out of tall grass, cutting through it
              for (let i = 0; i < 5; i++) pushFx('grass', e.x + (Math.random() - 0.5) * 2, (e.z ?? 0) + (Math.random() - 0.5) * 1.6, e.team, t);
              pushFx('sweep', e.x, e.z, e.team, t);
              if (e.team === 0) { sfx.shing(); sfx.rustle(); sfx.grunt(); bark(e.card, props.barksOn); }
              else { sfx.shing(); sfx.rustle(); }
            } else if (e.card === 'njuchi') {
              // a tiny hive drops and breaks open; the swarm bursts out
              for (let i = 0; i < 6; i++) pushFx('sting', e.x + (Math.random() - 0.5) * 1.8, (e.z ?? 0) + (Math.random() - 0.5) * 1.8, e.team, t);
              pushFx('chip', e.x, e.z, e.team, t);
              if (e.team === 0) { sfx.buzz(); bark(e.card, props.barksOn); }
              else sfx.buzz();
            } else if (e.card === 'mphezi') {
              // the sky darkens over the radius, then the bolts fall
              pushFx('smoke', e.x, e.z, e.team, t);
              sfx.crackle();
              if (e.team === 0) bark(e.card, props.barksOn);
            } else if (e.card === 'mlonda') {
              pushFx('ring', e.x, e.z, e.team, t);
              pushFx('deployRing', e.x, e.z, e.team, t);
              if (e.team === 0) { sfx.thud(); sfx.drumHit(); bark(e.card, props.barksOn); }
              else sfx.thud();
            } else if (e.card === 'woweta') {
              for (let i = 0; i < 3; i++) pushFx('dust', e.x + (Math.random() - 0.5) * 2.4, (e.z ?? 0) + (Math.random() - 0.5) * 1.2, e.team, t);
              if (e.team === 0) { sfx.bleat(); bark(e.card, props.barksOn); }
              else sfx.bleat();
            } else if (e.card === 'watchtower') {
              pushFx('dust', e.x, e.z, e.team, t);
              pushFx('deployRing', e.x, e.z, e.team, t);
              if (e.team === 0) { sfx.knock(); sfx.drumHit(); bark(e.card, props.barksOn); }
              else sfx.knock();
            } else {
              pushFx('dust', e.x, e.z, e.team, t);
              // 1.0s deploy countdown ring for troops/buildings (classic feel)
              if (e.card && CARDS[e.card] && CARDS[e.card].type !== 'spell') {
                pushFx('deployRing', e.x, e.z, e.team, t);
              }
              if (e.team === 0) {
                if (e.card === 'woweta') sfx.bleat();
                else if (e.card === 'fisi') sfx.slash();
                else if (e.card === 'mlonda') sfx.drumHit();
                else sfx.deploy();
                if (e.card) bark(e.card, props.barksOn);
              } else if (e.card === 'woweta') sfx.bleat();
            }
            if (e.team === 0) {
              // show the used card's name where it landed (spells with their
              // own callout — surge/harvest/blaze/gust/ladder/bolt — skip this one)
              if (e.card && !['mafunde', 'harvest', 'moto', 'mphepo', 'mphezi', 'makwerero', 'mlonda', 'zikwanje', 'njuchi', 'mfiti', 'woweta', 'fisi', 'watchtower'].includes(e.card)) {
                const p = project(e.x, e.z);
                if (p) props.onFloater({ ...p, text: CARDS[e.card]?.nameCh ?? e.card, kind: 'callout', card: e.card });
              } else if (e.card && ['mlonda', 'zikwanje', 'njuchi', 'mfiti', 'woweta', 'fisi', 'watchtower'].includes(e.card)) {
                const p = project(e.x, e.z);
                if (p) props.onFloater({ ...p, text: CARDS[e.card]?.nameCh ?? e.card, kind: 'callout', card: e.card });
              }
            }
          } else if (e.kind === 'hit' && e.x != null && e.z != null) {
            const du = battle.units.find((u) => u.id === e.a);
            const isTowerHit = e.b != null && battle.towers.some((tw) => tw.id === e.b);
            const heavy = (e.dmg != null && e.dmg >= 120) || isTowerHit || du?.card === 'mlonda' || du?.card === 'zikwanje';
            // projectile tracer for ranged attackers (travels visibly, then hits;
            // climbs to air targets). Events are tiles; live state is milli.
            if (du?.ranged && e.a != null) {
              const ax = toT(du.x), az = toT(du.z);
              const tgtU = battle.units.find((u) => u.id === e.b);
              pushFx('projectile', ax, az, undefined, t, e.x, e.z, tgtU?.layer === 'air' ? 2 : 1);
              if (t - lastHitSfx.current > 0.09) { lastHitSfx.current = t; sfx.shoot(); }
            } else if (e.a != null && e.a >= 100) {
              // tower arrows/stones travel
              const tw = battle.towers.find((v) => v.id === e.a);
              if (tw) pushFx('projectile', toT(tw.x), toT(tw.z), undefined, t, e.x, e.z);
            }
            if (heavy) {
              pushFx('hit', e.x, e.z, undefined, t);
              if (t - lastHitSfx.current > 0.06) { lastHitSfx.current = t; sfx.heavy(); }
              else sfx.hit();
              // hit-stop 40-60ms freeze on heavy hits only
              hitStopUntil.current = performance.now() + 50;
              if (isTowerHit) {
                pushFx('chip', e.x, e.z, undefined, t);
                sfx.chips();
                shake.v = Math.min(1, shake.v + 0.18);
              }
            } else {
              if (t - lastHitSfx.current > 0.09) { lastHitSfx.current = t; sfx.hit(true); }
              else sfx.slash();
              if (du && !du.ranged && Math.random() < 0.4) sfx.slash();
            }
            // floating damage numbers for EVERY hit (bigger gold for crits/spells)
            if (e.dmg != null) {
              const p = project(e.x, e.z);
              if (p) {
                const owner = du?.owner ?? battle.towers.find((v) => v.id === e.a)?.owner ?? e.team;
                const crit = (e.dmg >= 150) || du?.card === 'mphezi';
                props.onFloater({
                  ...p,
                  text: crit ? `-${e.dmg}!` : `-${e.dmg}`,
                  kind: crit ? 'boom' : owner === 0 ? 'good' : 'bad',
                  card: du?.card,
                  tgt: e.b,
                  dmg: true,
                });
              }
            }
          } else if (e.kind === 'miss' && e.x != null && e.z != null) {
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: 'MISS', kind: 'callout' });
          } else if (e.kind === 'death' && e.x != null && e.z != null) {
            pushFx('dust', e.x, e.z, undefined, t);
            // fading silhouette + poof + sound (nothing just vanishes)
            const deadTeam = e.team as 0 | 1 | undefined;
            pushFx('ghost', e.x, e.z, deadTeam, t);
            sfx.death();
            if (e.card) {
              // roadblock splinters when destroyed (obstacle deaths have no card)
              if (e.card === 'roadblock') sfx.brick();
              const p = project(e.x, e.z);
              if (p) props.onFloater({ ...p, text: '☠', kind: 'kill', card: e.card });
            } else {
              // obstacle (roadblock) destroyed: splinters
              sfx.brick();
              pushFx('chip', e.x, e.z, undefined, t);
            }
          } else if (e.kind === 'towerFall' && e.x != null && e.z != null) {
            pushFx('boom', e.x, e.z, e.team, t);
            pushFx('dust', e.x, e.z, e.team, t);
            sfx.brick(); sfx.cheer(); sfx.thunder();
            slowUntil.current = performance.now() + 900;
            shake.v = 1; pulse.v = 1;
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: e.team === 0 ? '💥 OURS!' : '💥 THEIRS!', kind: 'boom' });
          } else if (e.kind === 'chiefActive') {
            sfx.horn();
            if (e.x != null && e.z != null) pushFx('ring', e.x, e.z, e.team, t);
          } else if (e.kind === 'summon' && e.x != null && e.z != null) {
            // owls burst out of the smoke
            for (let i = 0; i < 3; i++) pushFx('smoke', e.x + (Math.random() - 0.5) * 1.4, (e.z ?? 0) + (Math.random() - 0.5), e.team, t);
            pushFx('pulseRing', e.x, e.z, e.team, t);
            sfx.hoot(); sfx.hum();
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: '🦉🦉', kind: 'callout', card: 'mfiti' });
          } else if (e.kind === 'sting' && e.x != null && e.z != null) {
            pushFx('sting', e.x, e.z, undefined, t);
            sfx.sting();
          } else if (e.kind === 'sweep' && e.x != null && e.z != null) {
            // wide swoosh trail + cut grass flying
            pushFx('sweep', e.x, e.z, e.team, t);
            for (let i = 0; i < 2; i++) pushFx('grass', e.x + (Math.random() - 0.5) * 1.6, (e.z ?? 0) + (Math.random() - 0.5), e.team, t);
            sfx.sweep(); sfx.shing(); sfx.rustle();
          } else if (e.kind === 'bolt' && e.x != null && e.z != null) {
            // forked bolt + white flash + scorch mark + delayed thunder
            pushFx('bolt', e.x, e.z, e.team, t);
            pushFx('scorch', e.x, e.z, e.team, t);
            sfx.bolt();
            window.setTimeout(() => sfx.thunderHit(), 350);
            hitStopUntil.current = performance.now() + 45;
            shake.v = Math.min(1, shake.v + 0.5);
            try {
              if (!useGame.getState().reduceFlash) pulse.v = Math.min(1, pulse.v + 0.7);
            } catch { /* noop */ }
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: `-${e.dmg ?? 650}!`, kind: 'boom', card: 'mphezi', dmg: true });
          } else if (e.kind === 'curse' && e.x != null && e.z != null) {
            pushFx('pulseRing', e.x, e.z, e.team, t);
            sfx.whisper();
          } else if (e.kind === 'knock') {
            sfx.knock();
            if (e.x != null && e.z != null) pushFx('dust', e.x, e.z, undefined, t);
          } else if (e.kind === 'whistle' && e.x != null && e.z != null) {
            sfx.whistle();
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: '♪', kind: 'callout', card: 'woweta' });
          } else if (e.kind === 'shield' && e.x != null && e.z != null) {
            pushFx('ring', e.x, e.z, e.team, t);
            sfx.hit(true);
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: 'BLOCK', kind: 'callout', card: 'mlonda' });
          } else if (e.kind === 'rain' && e.x != null && e.z != null) {
            for (let i = 0; i < 6; i++) pushFx('splash', e.x + Math.sin(i * 7) * 2, e.z + Math.cos(i * 5) * 2, undefined, t);
            sfx.thunder(); sfx.rainHit();
          } else if (e.kind === 'puddle') {
            // puddles remain — no extra sound
          } else if (e.kind === 'wall') {
            sfx.knock(); sfx.thud();
            if (e.x != null && e.z != null) {
              for (let i = 0; i < 3; i++) pushFx('dust', (e.x ?? 0) + (i - 1) * 1.1, e.z ?? 0, e.team, t);
            }
          } else if (e.kind === 'surge' && e.x != null && e.z != null) {
            pushFx('surge', e.x, e.z, e.team, t);
            sfx.surge();
            shake.v = Math.min(1, shake.v + 0.35);
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: 'SURGE!', kind: 'callout', card: 'mafunde' });
          } else if (e.kind === 'harvest' && e.x != null && e.z != null) {
            pushFx('harvest', e.x, e.z, e.team, t);
            sfx.harvest();
            const p2 = project(e.x, e.z);
            if (p2) props.onFloater({ ...p2, text: '+5⚡', kind: e.team === 0 ? 'good' : 'bad', card: 'harvest' });
          } else if (e.kind === 'blaze' && e.x != null && e.z != null) {
            pushFx('blaze', e.x, e.z, e.team, t);
            sfx.blaze();
            hitStopUntil.current = performance.now() + 45;
            shake.v = Math.min(1, shake.v + 0.45);
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: 'MOTO!', kind: 'callout', card: 'moto' });
          } else if (e.kind === 'gust' && e.x != null && e.z != null) {
            pushFx('gust', e.x, e.z, e.team, t);
            sfx.gust();
            shake.v = Math.min(1, shake.v + 0.3);
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: 'MPEPO!', kind: 'callout', card: 'mphepo' });
          } else if (e.kind === 'ladder' && e.x != null && e.z != null) {
            pushFx('ring', e.x, e.z, e.team, t);
            pushFx('harvest', e.x, e.z, e.team, t);
            sfx.knock();
            const p = project(e.x, e.z);
            if (p) props.onFloater({ ...p, text: 'FORD!', kind: 'callout', card: 'makwerero' });
          } else if (e.kind === 'gameOver' && e.text !== 'sudden') {
            const w = Number(e.text) as 0 | 1 | 2;
            setCelebrate(true);
            setIntensity(false);
            setRaining(false);
            if (w === 0) { sfx.cheer(); sfx.horn(); }
            else if (w === 1) sfx.horn();
            if (!overSent.current) {
              overSent.current = true;
              window.setTimeout(() => props.onGameOver(w), 1700);
            }
          }
        }
        setRaining(battle.rains.length > 0);
    }
    if (stepped > 0 || fx.length > 0) {
      if (stepped > 0) setSnap((s) => s + 1);
      setFx((f) => {
        const t = state.clock.elapsedTime;
        const kept = f.filter((x) => t - x.born < (x.kind === 'scorch' ? 5 : x.kind === 'boom' ? 1.5 : x.kind === 'harvest' ? 1.4 : x.kind === 'blaze' ? 1.3 : x.kind === 'smoke' ? 1.2 : x.kind === 'surge' || x.kind === 'gust' || x.kind === 'deployRing' ? 1.1 : x.kind === 'ring' || x.kind === 'deny' || x.kind === 'pulseRing' ? 1.0 : x.kind === 'sweep' ? 0.9 : x.kind === 'ghost' || x.kind === 'chip' || x.kind === 'grass' ? 0.8 : x.kind === 'bolt' ? 0.6 : x.kind === 'sting' ? 0.5 : x.kind === 'projectile' ? 0.35 : 0.8));
        return kept.length === f.length ? f : kept;
      });
      props.onHud({
        time: battle.time, sudden: battle.suddenDeath, over: battle.over,
        doubleEnergy: battle.doubleEnergy, energy: battle.energy[0],
        energyFrac: battle.energyFrac[0],
        hand: [...battle.hands[0]], next: battle.queues[0][0] ?? battle.hands[0][0],
        towers: battle.towers.map((tw) => ({ id: tw.id, owner: tw.owner, kind: tw.kind, lane: tw.lane, hp: Math.max(0, tw.hp), maxHp: tw.maxHp, alive: tw.alive })),
        unitCount: battle.units.length,
      });
    }
    void snap;
  });

  const snapG = (v: number) => Math.round(v * 2) / 2;
  const deployVia = props.online?.deployImpl ?? assistDeploy;
  const onTap = (e: ThreeEvent<PointerEvent>) => {
    if (props.drag || !props.selected) return;
    e.stopPropagation();
    const card = props.selected;
    const x = snapG(e.point.x + 9);
    const z = snapG(16 - e.point.z);
    const chk = battle.canDeploy(0, card, x, z);
    if (!chk.ok && chk.reason === 'energy') { props.onPoor?.(card); return; }
    // Forgiving tap: exact spot first (assistDeploy clamps near-misses to
    // own half / arena). No teleport to hints[0] — invalid stays invalid
    // so the green/red preview always matches where the card lands.
    if (deployVia(card, x, z, true)) { props.clearSelected(); return; }
    // invalid: red X ping + reason toast (no silent fail)
    const t = nowRef.current;
    pushFx('deny' as FxItem['kind'], x, z, undefined, t);
    sfx.error();
    props.onInvalid?.(chk.reason || 'invalid', x, z);
  };

  // curse flags: units inside an enemy witch aura get the purple wisp
  // (milli-tiles internally; 3000^2 = 3-tile curse radius)
  const witches = battle.units.filter((w) => w.alive && w.sub === 'witch');
  const units: UnitViewData[] = battle.units.map((u) => ({
    id: u.id, card: u.card, sub: u.sub, owner: u.owner, x: toT(u.x), z: toT(u.z),
    hp: u.hp, maxHp: u.maxHp, shield: u.shield, maxShield: u.maxShield,
    lifePct: u.expiresTick > 0 ? Math.max(0, (u.expiresTick - battle.tick) / (40 * 20)) : undefined,
    swing: u.swing, walkPhase: u.walkPhase,
    speed: toT(u.speed), isGoat: u.isGoat, ranged: u.ranged,
    layer: u.layer,
    cursed: u.sub === 'witch' ? false : witches.some((w) => w.owner !== u.owner &&
      (w.x - u.x) ** 2 + (w.z - u.z) ** 2 <= 9000000),
    // subtle blue tint while standing in Mvula rain/puddle (visual only)
    wet: battle.rains.some((r) => (u.x - r.x) ** 2 + (u.z - r.z) ** 2 <= r.r * r.r) ||
      battle.puddles.some((p) => (u.x - p.x) ** 2 + (u.z - p.z) ** 2 <= p.r * p.r),
  }));
  // tile-space views for render (sim storage is milli-tiles)
  const towersT = battle.towers.map((tw) => ({ ...tw, x: toT(tw.x), z: toT(tw.z) }));
  const rainsT = battle.rains.map((r) => ({ ...r, x: toT(r.x), z: toT(r.z), r: toT(r.r) }));
  const puddlesT = battle.puddles.map((p) => ({ ...p, x: toT(p.x), z: toT(p.z), r: toT(p.r) }));
  const obstaclesT = battle.obstacles.map((o) => ({ ...o, x: toT(o.x), z: toT(o.z), hw: toT(o.hw), hd: toT(o.hd) }));

  return (
    <group>
      <RegisterApi />
      <CameraRig />
      <ArenaLighting arena={props.arena} quality={props.quality} />
      {props.arena === 'msika' ? <ArenaMsika /> : <ArenaMudzi />}
      {towersT.map((tw) => <TowerMesh key={tw.id} tw={{ ...tw }} />)}
      {units.map((u) => <UnitMesh key={u.id} u={u} celebrate={celebrate && u.owner === battle.winner} />)}
      <EffectsLayer fx={fx} rains={rainsT} puddles={puddlesT} obstacles={obstaclesT} now={nowRef.current} />
      {props.drag ? (
        <CardPreview card={props.drag.card} sx={props.drag.sx} sz={props.drag.sz} valid={props.drag.valid} />
      ) : props.selected && ghost ? (
        <CardPreview
          card={props.selected} sx={ghost.x} sz={ghost.z}
          valid={battle.canDeploy(0, props.selected, ghost.x, ghost.z).ok}
        />
      ) : null}
      {props.hintMode && (
        <DropHints
          spots={props.hints} mode={props.hintMode}
          onPick={props.selected && !props.drag ? (x, z) => {
            const c = props.selected!;
            const chk = battle.canDeploy(0, c, x, z);
            if (!chk.ok && chk.reason === 'energy') { props.onPoor?.(c); return; }
            if (deployVia(c, x, z)) props.clearSelected();
            else props.onInvalid?.(chk.reason || 'invalid', x, z);
          } : null}
        />
      )}
      {/* tap-to-place catcher (invisible but raycastable) */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}
        onPointerDown={onTap}
        onPointerMove={(e) => {
          if (props.selected && !props.drag) setGhost({ x: snapG(e.point.x + 9), z: snapG(16 - e.point.z) });
        }}
      >
        <planeGeometry args={[19, 33]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

const FORMATION = [
  { x: 0, z: 0 }, { x: 0.9, z: 0.4 }, { x: -0.9, z: 0.4 },
  { x: 0.5, z: -0.9 }, { x: -0.5, z: -0.9 },
];

/** Ground preview of exactly what the card will do: formation ghosts for
 *  troops, range + footprint for buildings, radius for area spells. */
function CardPreview({ card, sx, sz, valid }: { card: string; sx: number; sz: number; valid: boolean }) {
  const color = valid ? '#57d95e' : '#ff4a3a';
  const def = CARDS[card];
  const n = def ? def.subs.reduce((a, s) => a + s.count, 0) : 1;
  const isTroop = def?.type === 'troop';
  const isBldg = def?.type === 'building';
  return (
    <group position={[WX(sx), 0.09, WZ(sz)]}>
      {/* beacon beam: visible above your finger on touch screens */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.16, 0.3, 3.2, 10, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {(card === 'rain' || card === 'mafunde' || card === 'moto' || card === 'mphepo' || card === 'mphezi') && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={card === 'rain' || card === 'mphepo' || card === 'mphezi' ? [3.3, 3.5, 40] : card === 'mafunde' ? [2.8, 3.0, 40] : [2.3, 2.5, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      {card === 'roadblock' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.4, 1.6]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
        </mesh>
      )}
      {isTroop && FORMATION.slice(0, Math.max(1, n)).map((o, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[o.x, 0.01, -o.z]}>
          <circleGeometry args={[0.3, 18]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ))}
      {isBldg && (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.9, 24]} />
            <meshBasicMaterial color={color} transparent opacity={0.3} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[6.4, 6.55, 48]} />
            <meshBasicMaterial color={color} transparent opacity={0.5} depthWrite={false} />
          </mesh>
        </group>
      )}
      {card === 'harvest' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.3, 1.5, 32]} />
          <meshBasicMaterial color="#ffe27a" transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.7, 0.95, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.7, 28]} />
        <meshBasicMaterial color={color} transparent opacity={0.25} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Suggested drop spots + legal-area tint while a card is selected/dragged. */
function DropHints({ spots, mode, onPick }: { spots: HintSpot[]; mode: 'own' | 'all'; onPick: ((x: number, z: number) => void) | null }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const p = 0.75 + Math.sin(clock.elapsedTime * 5) * 0.25;
    g.current.scale.set(p, 1, p);
  });
  return (
    <group>
      {/* legal-area tint: valid green/blue, invalid red */}
      {mode === 'own' ? (
        <group>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 8.25]}>
            <planeGeometry args={[18, 14.5]} />
            <meshBasicMaterial color="#57d95e" transparent opacity={0.10} depthWrite={false} />
          </mesh>
          {/* enemy half + river invalid */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.054, -8.25]}>
            <planeGeometry args={[18, 14.5]} />
            <meshBasicMaterial color="#ff3b30" transparent opacity={0.08} depthWrite={false} />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.056, 0]}>
            <planeGeometry args={[18.6, 2.2]} />
            <meshBasicMaterial color="#ff3b30" transparent opacity={0.14} depthWrite={false} />
          </mesh>
        </group>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]}>
          <planeGeometry args={[18.6, 32]} />
          <meshBasicMaterial color="#e8a020" transparent opacity={0.07} depthWrite={false} />
        </mesh>
      )}
      {/* pulsing suggested markers (tappable while a card is armed) */}
      <group ref={g}>
        {spots.map((s, i) => (
          <group
            key={i}
            position={[WX(s.x), 0.09, WZ(s.z)]}
            onPointerDown={onPick ? (e) => { e.stopPropagation(); onPick(s.x, s.z); } : undefined}
          >
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[0.55, 0.8, 28]} />
              <meshBasicMaterial color="#ffe27a" transparent opacity={0.95} depthWrite={false} />
            </mesh>
            <mesh position={[0, 1.1, 0]}>
              <coneGeometry args={[0.22, 0.5, 4]} />
              <meshBasicMaterial color="#ffe27a" transparent opacity={0.9} depthWrite={false} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

export function BattleView(props: Props) {
  const deckKey = [...props.playerDeck].sort().join(',');
  const offline = useMemo(() => {
    if (props.online) return null;
    const pool = [...ALL_CARD_IDS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const b = new Battle(Date.now() % 100000, [...props.playerDeck], pool.slice(0, 8));
    viewApi.battle = b;
    viewApi.frozen = false;
    return b;
    // matchKey forces a fresh sim on rematch; deckKey/difficulty keep
    // the sim in sync when the player edits the deck or difficulty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.online, props.matchKey, deckKey, props.difficulty]);
  const battle = props.online?.battle ?? offline!;
  const ai = useMemo(() => {
    if (props.online) return null;
    // ?empty=1 (screenshots): no AI on either side; sim untouched
    try {
      if (new URLSearchParams(window.location.search).has('empty')) return null;
    } catch { /* noop */ }
    return new AIController(1, props.difficulty, Date.now() % 100000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.online, props.matchKey, props.difficulty]);
  const aiAuto = useMemo(() => {
    if (props.online) return null;
    try {
      if (new URLSearchParams(window.location.search).has('empty')) return null;
    } catch { /* noop */ }
    return props.autoplay ? new AIController(0, 'normal', (Date.now() % 100000) + 7) : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.online, props.matchKey, props.autoplay]);
  useEffect(() => {
    if (props.online) viewApi.battle = props.online.battle;
    else if (offline) viewApi.battle = offline;
    return () => { viewApi.battle = null; };
  }, [props.online, offline]);
  const th = ARENA_THEME[props.arena];

  return (
    <Canvas
      shadows={props.quality === 'low' ? false : 'soft'}
      dpr={[1, props.quality === 'low' ? 1.25 : props.quality === 'med' ? 1.75 : 2]}
      gl={{ antialias: true, powerPreference: props.quality === 'low' ? 'low-power' : 'high-performance' }}
      camera={{ fov: 50, position: [0, 25.5, 20.5], near: 0.5, far: 220 }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.14;
        try {
          if ('shadowMap' in gl) {
            const sm = (gl as unknown as { shadowMap: { type: number } }).shadowMap;
            sm.type = THREE.PCFSoftShadowMap;
          }
        } catch { /* noop */ }
      }}
    >
      <SkyDome top={props.arena === 'msika' ? '#7ec0ee' : '#79b8e8'} bottom="#f5eedd" />
      <fog attach="fog" args={th.fog} />
      <Scene key={`${props.matchKey ?? 0}-${deckKey}`} battle={battle} ai={ai} aiAuto={aiAuto} props={props} />
    </Canvas>
  );
}
