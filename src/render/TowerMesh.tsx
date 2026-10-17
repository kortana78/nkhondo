import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { Tower } from '../../shared/sim/battle';
import { WX, WZ, TEAM_COLOR, TEAM_DARK, HpBar } from './world';
import { BlobShadow } from './BlobShadow';
import { useGame } from '../state/store';

function badgeTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  const g = c.getContext('2d')!;
  g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2);
  const grad = g.createLinearGradient(0, 0, 0, 96);
  grad.addColorStop(0, '#ffe27a'); grad.addColorStop(1, '#c98a12');
  g.fillStyle = grad; g.fill();
  g.lineWidth = 6; g.strokeStyle = '#5a3a08'; g.stroke();
  g.fillStyle = '#3a2404'; g.font = 'bold 40px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), 48, 51);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function LevelBadge({ level }: { level: number }) {
  const tex = useMemo(() => badgeTexture(level), [level]);
  return (
    <mesh position={[0, 0.42, 0]}>
      <circleGeometry args={[0.26, 20]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} depthTest={false} />
    </mesh>
  );
}

function hpTexture(hp: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 40;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 40);
  g.font = 'bold 26px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 5; g.strokeStyle = '#000000cc';
  g.strokeText(String(hp), 64, 21);
  g.fillStyle = '#ffffff';
  g.fillText(String(hp), 64, 21);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** HP number on the bar (bucketed to 25 so the texture rarely rebuilds). */
function TowerHpNumber({ hp, w }: { hp: number; w: number }) {
  const bucket = Math.max(0, Math.round(hp / 25) * 25);
  const tex = useMemo(() => hpTexture(bucket), [bucket]);
  useEffect(() => () => tex.dispose(), [tex]);
  return (
    <mesh position={[0, 0.02, 0.002]}>
      <planeGeometry args={[w * 0.85, w * 0.27]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} depthTest={false} />
    </mesh>
  );
}

/** Animated defender manning the platform. Thrusts when the tower fires. */
function Defender({ color, swing, seed }: { color: string; swing: number; seed: number }) {
  const g = useRef<THREE.Group>(null!);
  const skin = ['#6b4226', '#8d5a33', '#5a341e'][seed % 3];
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.elapsedTime * 2 + seed;
    g.current.position.y = Math.sin(t) * 0.04;
    g.current.rotation.y = Math.sin(t * 0.4) * 0.5;
  });
  const thrust = swing >= 4 && swing <= 9 ? 0.35 : 0;
  return (
    <group ref={g}>
      <mesh position={[0, 0.28, 0]} castShadow>
        <boxGeometry args={[0.34, 0.5, 0.26]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.68, 0]} castShadow>
        <sphereGeometry args={[0.17, 10, 10]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.14, 0.15, 0.09, 8]} />
        <meshStandardMaterial color="#4e3018" roughness={0.9} />
      </mesh>
      {/* spear, thrusts on fire */}
      <group position={[0.24, 0.4, thrust]} rotation={[0.25, 0, -0.15]}>
        <mesh position={[0, 0.75, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.5, 5]} />
          <meshStandardMaterial color="#6a4526" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.5, 0]}>
          <coneGeometry args={[0.07, 0.22, 5]} />
          <meshStandardMaterial color="#c9c9c9" roughness={0.4} metalness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

/** Cloth team banner with a slow wave. */
function Banner({ color, w = 0.72, h = 0.44, y = 0 }: { color: string; w?: number; h?: number; y?: number }) {
  const m = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!m.current) return;
    const t = clock.elapsedTime * 2.4;
    m.current.rotation.y = Math.sin(t) * 0.35;
    m.current.scale.x = 1 + Math.sin(t * 1.3) * 0.06;
  });
  return (
    <mesh ref={m} position={[w / 2 + 0.05, y, 0]}>
      <planeGeometry args={[w, h, 4, 1]} />
      <meshStandardMaterial color={color} roughness={0.7} emissive={color} emissiveIntensity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

/** Damage cracks + smoke column at 50% / 25% health. */
function DamageState({ pct, r }: { pct: number; r: number }) {
  const puffs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.5;
    puffs.current.forEach((m, i) => {
      if (!m) return;
      const k = (t + i / 3) % 1;
      m.position.y = 2.2 + k * 2.4;
      const s = 0.4 + k * 0.9;
      m.scale.set(s, s, s);
      (m.material as THREE.MeshBasicMaterial).opacity = 0.34 * (1 - k);
    });
  });
  if (pct >= 0.5) return null;
  const heavy = pct < 0.25;
  return (
    <group>
      {/* cracks: dark jagged inlays on the shaft */}
      {[0.4, 1.0, 1.6, ...(heavy ? [0.7, 1.3] : [])].map((y, i) => (
        <mesh key={i} position={[Math.cos(i * 2.4) * r * 0.92, y, Math.sin(i * 2.4) * r * 0.92]} rotation={[0, -i * 2.4 + 0.4, 0.25]}>
          <boxGeometry args={[0.06, 0.55 + (i % 2) * 0.25, 0.05]} />
          <meshBasicMaterial color="#1f0f08" />
        </mesh>
      ))}
      {(heavy ? [0, 1, 2] : [0]).map((i) => (
        <mesh key={'s' + i} ref={(el) => { puffs.current[i] = el; }} position={[(i - 1) * 0.5, 3, 0]}>
          <sphereGeometry args={[0.5, 8, 8]} />
          <meshBasicMaterial color="#555555" transparent opacity={0.3} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function NsanjaTower({ tw }: { tw: Tower }) {
  const pct = Math.max(0, tw.hp / tw.maxHp);
  return (
    <group>
      <BlobShadow s={3.6} opacity={0.5} />
      {/* stone footing */}
      <mesh position={[0, 0.2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.55, 1.75, 0.4, 8]} />
        <meshStandardMaterial color="#8a8a8e" roughness={1} flatShading />
      </mesh>
      {/* fired-brick tapered shaft */}
      <mesh position={[0, 1.35, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.0, 1.38, 2.3, 8]} />
        <meshStandardMaterial color="#a8502c" roughness={0.95} />
      </mesh>
      {[0.6, 1.2, 1.8, 2.3].map((y) => (
        <mesh key={y} position={[0, y, 0]}>
          <cylinderGeometry args={[1.02 + (2.3 - y) * 0.1, 1.02 + (2.3 - y) * 0.1, 0.09, 8]} />
          <meshStandardMaterial color="#7e3a22" roughness={1} />
        </mesh>
      ))}
      {/* team pattern band */}
      <mesh position={[0, 2.42, 0]}>
        <cylinderGeometry args={[1.04, 1.04, 0.24, 8]} />
        <meshStandardMaterial color={TEAM_COLOR[tw.owner]} roughness={0.8} emissive={TEAM_COLOR[tw.owner]} emissiveIntensity={0.2} />
      </mesh>
      {/* wooden platform: deck + brackets + railing */}
      <mesh position={[0, 2.72, 0]} castShadow>
        <cylinderGeometry args={[1.5, 1.3, 0.22, 8]} />
        <meshStandardMaterial color="#7a5230" roughness={0.9} />
      </mesh>
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        return (
          <group key={i}>
            <mesh position={[Math.cos(a) * 1.0, 2.45, Math.sin(a) * 1.0]} rotation={[0, -a, 0.5]}>
              <boxGeometry args={[0.12, 0.5, 0.12]} />
              <meshStandardMaterial color="#4e3018" roughness={0.95} />
            </mesh>
            <mesh position={[Math.cos(a) * 1.42, 3.15, Math.sin(a) * 1.42]} castShadow>
              <boxGeometry args={[0.1, 0.7, 0.1]} />
              <meshStandardMaterial color="#4e3018" roughness={0.95} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, 3.5, 0]}>
        <torusGeometry args={[1.42, 0.05, 6, 8]} />
        <meshStandardMaterial color="#4e3018" roughness={0.95} />
      </mesh>
      {/* thatch cap */}
      <mesh position={[0, 3.95, 0]} castShadow>
        <coneGeometry args={[1.7, 0.85, 8]} />
        <meshStandardMaterial color="#8a6a35" roughness={1} flatShading />
      </mesh>
      {/* banner pole + waving team banner */}
      <mesh position={[-0.6, 4.35, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 1.1, 5]} />
        <meshStandardMaterial color="#4e3018" roughness={1} />
      </mesh>
      <group position={[-0.6, 4.6, 0]}><Banner color={TEAM_COLOR[tw.owner]} /></group>
      {/* defender on the platform */}
      <group position={[0.45, 2.83, 0.2]}><Defender color={TEAM_COLOR[tw.owner]} swing={tw.swing} seed={tw.id} /></group>
      <DamageState pct={pct} r={1.2} />
    </group>
  );
}

function Brazier({ x, z, on }: { x: number; z: number; on: boolean }) {
  const f = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (f.current && on) f.current.scale.setScalar(1 + Math.sin(clock.elapsedTime * 9 + x) * 0.18);
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.45, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.16, 0.7, 7]} />
        <meshStandardMaterial color="#3a3a3e" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.85, 0]}>
        <cylinderGeometry args={[0.26, 0.2, 0.12, 7]} />
        <meshStandardMaterial color="#222" roughness={1} />
      </mesh>
      <mesh ref={f} position={[0, 1.0, 0]}>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshBasicMaterial color={on ? '#ff9a3d' : '#444'} />
      </mesh>
    </group>
  );
}

function ChiefHouse({ tw }: { tw: Tower }) {
  const pct = Math.max(0, tw.hp / tw.maxHp);
  const dim = !tw.active;
  return (
    <group scale={1.22}>
      <BlobShadow s={6.4} opacity={0.5} />
      {/* grander hall */}
      <mesh position={[0, 1.3, -0.4]} castShadow receiveShadow>
        <boxGeometry args={[3.8, 2.6, 2.8]} />
        <meshStandardMaterial color="#a8502c" roughness={0.95} />
      </mesh>
      {/* whitewash base + pattern band */}
      <mesh position={[0, 0.35, -0.4]}>
        <boxGeometry args={[3.86, 0.5, 2.86]} />
        <meshStandardMaterial color="#e8dcc2" roughness={1} />
      </mesh>
      <mesh position={[0, 2.35, -0.4]}>
        <boxGeometry args={[3.86, 0.3, 2.86]} />
        <meshStandardMaterial color={TEAM_COLOR[tw.owner]} roughness={0.8} emissive={TEAM_COLOR[tw.owner]} emissiveIntensity={0.2} />
      </mesh>
      {/* main thatch roof + porch roof */}
      <mesh position={[0, 3.35, -0.4]} castShadow>
        <coneGeometry args={[3.1, 1.7, 8]} />
        <meshStandardMaterial color="#c9a45c" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 2.5, 1.5]} castShadow>
        <coneGeometry args={[1.5, 0.8, 4]} />
        <meshStandardMaterial color="#b08c46" roughness={1} flatShading />
      </mesh>
      <mesh position={[0, 4.25, -0.4]}>
        <coneGeometry args={[0.34, 0.4, 6]} />
        <meshStandardMaterial color="#8a6a35" roughness={1} />
      </mesh>
      {/* carved doors */}
      {[[-0.7], [0.7]].map((p, i) => (
        <mesh key={i} position={[p[0], 1.05, 1.02]}>
          <boxGeometry args={[0.95, 1.8, 0.1]} />
          <meshStandardMaterial color={dim ? '#5a5a5a' : '#4a2c14'} roughness={0.9} />
        </mesh>
      ))}
      {/* granary hut */}
      <mesh position={[2.7, 0.85, 0.5]} castShadow>
        <cylinderGeometry args={[0.95, 1.0, 1.7, 8]} />
        <meshStandardMaterial color="#b06038" roughness={1} />
      </mesh>
      <mesh position={[2.7, 2.15, 0.5]} castShadow>
        <coneGeometry args={[1.35, 1.05, 8]} />
        <meshStandardMaterial color="#8a6a35" roughness={1} flatShading />
      </mesh>
      {/* kraal fence arc */}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-3.2 + i * 0.8, 0.55, 2.5 - Math.abs(i - 4) * 0.18]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 1.1, 5]} />
          <meshStandardMaterial color="#5a3a22" roughness={1} />
        </mesh>
      ))}
      {/* war drums */}
      {[[-2.2, 1.5], [-1.5, 1.7], [-2.85, 1.4]].map((p, i) => (
        <group key={i} position={[p[0], 0, p[1]]}>
          <mesh position={[0, 0.5, 0]} castShadow>
            <cylinderGeometry args={[0.32, 0.37, 0.8, 8]} />
            <meshStandardMaterial color={TEAM_COLOR[tw.owner]} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.92, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.06, 8]} />
            <meshStandardMaterial color="#e8d8b0" roughness={0.9} />
          </mesh>
        </group>
      ))}
      <Brazier x={1.6} z={1.6} on={tw.active} />
      <Brazier x={-1.6} z={1.6} on={tw.active} />
      {/* tall banner pole + grand banner */}
      <mesh position={[0, 4.6, -0.4]}>
        <cylinderGeometry args={[0.07, 0.07, 2.4, 5]} />
        <meshStandardMaterial color="#4e3018" roughness={1} />
      </mesh>
      <group position={[0, 5.3, -0.4]}><Banner color={dim ? '#777' : TEAM_COLOR[tw.owner]} w={1.15} h={0.68} /></group>
      {tw.active && (
        <mesh position={[0, 5.95, -0.4]}>
          <sphereGeometry args={[0.14, 8, 8]} />
          <meshBasicMaterial color="#ffe27a" />
        </mesh>
      )}
      <DamageState pct={pct} r={2.1} />
    </group>
  );
}

function Rubble({ big }: { big: boolean }) {
  const s = big ? 1.7 : 1.1;
  return (
    <group scale={s}>
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <cylinderGeometry args={[1.1, 1.3, 0.5, 7]} />
        <meshStandardMaterial color="#6e3520" roughness={1} flatShading />
      </mesh>
      {[[0.5, 0.5, 0.4], [-0.6, 0.4, 0.2], [0.1, 0.7, -0.5], [-0.2, 0.45, 0.7]].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]} rotation={[i, i * 2, i * 0.5]} castShadow>
          <boxGeometry args={[0.45, 0.35, 0.4]} />
          <meshStandardMaterial color={i % 2 ? '#a8502c' : '#8a6a35'} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

const FOE_LEVEL: Record<string, number> = { easy: 2, normal: 5, hard: 8 };

export function TowerMesh({ tw }: { tw: Tower }) {
  const g = useRef<THREE.Group>(null!);
  const bar = useRef<THREE.Group>(null!);
  const cam = useThree((s) => s.camera);
  const trophies = useGame((s) => s.trophies);
  const difficulty = useGame((s) => s.difficulty);
  const level = tw.owner === 0 ? 1 + Math.floor(trophies / 100) : (FOE_LEVEL[difficulty] ?? 5);
  const [fall, setFall] = useState(0); // 0 standing .. 1 rubble
  const wasAlive = useRef(tw.alive);
  const hpRef = useRef(tw.hp);
  const shakeT = useRef(0);

  useEffect(() => {
    if (wasAlive.current && !tw.alive) {
      wasAlive.current = false;
      const start = performance.now();
      let raf = 0;
      const anim = () => {
        const k = Math.min(1, (performance.now() - start) / 1100);
        setFall(k);
        if (k < 1) raf = requestAnimationFrame(anim);
      };
      raf = requestAnimationFrame(anim);
      return () => cancelAnimationFrame(raf);
    }
    return undefined;
  }, [tw.alive]);

  useFrame((_, dt) => {
    if (bar.current) bar.current.quaternion.copy(cam.quaternion);
    if (tw.hp < hpRef.current) shakeT.current = 1; // chips + shake on every tower hit
    hpRef.current = tw.hp;
    shakeT.current = Math.max(0, shakeT.current - dt * 6);
    if (g.current && fall > 0 && fall < 1) {
      g.current.rotation.z = fall * 0.5;
      g.current.position.y = -fall * 0.8;
    } else if (g.current && shakeT.current > 0) {
      g.current.position.x = Math.sin(performance.now() * 0.09) * 0.09 * shakeT.current;
    } else if (g.current) {
      g.current.position.x = 0;
    }
  });

  const pct = Math.max(0, tw.hp / tw.maxHp);
  const color = tw.owner === 0 ? '#5aa2ff' : '#ff6a5a';
  const h = tw.kind === 'chief' ? 7.2 : 5.6;
  const barW = tw.kind === 'chief' ? 1.9 : 1.5;
  const flashO = Math.max(0, shakeT.current) * 0.85;
  return (
    <group position={[WX(tw.x), 0, WZ(tw.z)]}>
      {tw.alive || fall < 1 ? (
        <group ref={g} visible={fall < 1}>
          {tw.kind === 'nsanja' ? <NsanjaTower tw={tw} /> : <ChiefHouse tw={tw} />}
          {/* white hit-flash 80ms on every tower hit (never blocks the bar) */}
          {flashO > 0.05 && (
            <mesh position={[0, tw.kind === 'chief' ? 2.5 : 1.8, 0]}>
              <sphereGeometry args={[tw.kind === 'chief' ? 2.4 : 1.5, 10, 10]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={Math.min(0.5, flashO)} depthWrite={false} />
            </mesh>
          )}
          {tw.kind === 'chief' && !tw.active && tw.alive && (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
              <ringGeometry args={[2.9, 3.1, 32]} />
              <meshBasicMaterial color="#999999" transparent opacity={0.4} depthWrite={false} />
            </mesh>
          )}
        </group>
      ) : null}
      {(!tw.alive) && <Rubble big={tw.kind === 'chief'} />}
      {tw.alive && (
        <group ref={bar} position={[0, h, 0]}>
          <HpBar pct={pct} w={barW} color={color} />
          <TowerHpNumber hp={tw.hp} w={barW} />
          <LevelBadge level={level} />
        </group>
      )}
      {/* team base disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
        <ringGeometry args={[tw.kind === 'chief' ? 2.4 : 1.5, tw.kind === 'chief' ? 2.6 : 1.7, 28]} />
        <meshBasicMaterial color={tw.alive ? TEAM_COLOR[tw.owner] : TEAM_DARK[tw.owner]} transparent opacity={0.75} depthWrite={false} />
      </mesh>
    </group>
  );
}
