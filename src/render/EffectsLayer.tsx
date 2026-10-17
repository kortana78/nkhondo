import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { Obstacle, Puddle, RainZone } from '../../shared/sim/battle';
import { WX, WZ, TEAM_COLOR } from './world';

function PuddleMesh({ p }: { p: Puddle }) {
  const rip = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!rip.current) return;
    const s = 1 + Math.sin(clock.elapsedTime * 2.2) * 0.06;
    rip.current.scale.set(s, s, 1);
  });
  return (
    <group position={[WX(p.x), 0, WZ(p.z)]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.032, 0]}>
        <circleGeometry args={[p.r, 26]} />
        <meshStandardMaterial color="#4a2c1c" roughness={0.55} transparent opacity={0.8} />
      </mesh>
      <mesh ref={rip} rotation={[-Math.PI / 2, 0, 0]} position={[0.4, 0.045, -0.3]}>
        <ringGeometry args={[0.5, 0.62, 24]} />
        <meshBasicMaterial color="#9fd4e8" transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-0.7, 0.044, 0.5]}>
        <circleGeometry args={[0.65, 18]} />
        <meshStandardMaterial color="#9fd4e8" roughness={0.15} metalness={0.6} transparent opacity={0.7} />
      </mesh>
    </group>
  );
}

export interface FxItem {
  id: number; kind: 'ring' | 'dust' | 'hit' | 'boom' | 'splash' | 'surge' | 'harvest' | 'blaze' | 'gust' | 'deny' | 'deployRing' | 'projectile' | 'chip' | 'ghost' | 'pulseRing' | 'smoke' | 'bolt' | 'sweep' | 'sting' | 'scorch' | 'grass';
  x: number; z: number; team?: 0 | 1;
  tx?: number; tz?: number; ty?: number;
}

/** air-layer height, mirrors UnitMesh FLY_H (kept local: no import cycle). */
const FLY_H_T = 2;

function FxOne({ fx, age }: { fx: FxItem; age: number }) {
  const color = fx.team != null ? TEAM_COLOR[fx.team] : '#ffffff';
  if (fx.kind === 'deny') {
    // red X ping for invalid deploys
    const o = Math.max(0, 0.95 - age * 1.4);
    return (
      <group position={[WX(fx.x), 0.15, WZ(fx.z)]}>
        {[0.5, -0.5].map((r, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, r]} position={[0, 0.02 * i, 0]}>
            <boxGeometry args={[1.1, 0.16, 0.02]} />
            <meshBasicMaterial color="#ff3b30" transparent opacity={o} depthWrite={false} />
          </mesh>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.85, 28]} />
          <meshBasicMaterial color="#ff3b30" transparent opacity={o} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'deployRing') {
    // 1.0s deploy countdown ring (classic genre feel)
    const k = Math.min(1, age / 1.0);
    const s = 0.9 - k * 0.25;
    return (
      <group position={[WX(fx.x), 0.09, WZ(fx.z)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[s, s + 0.12, 32]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.15, 0.15 + (1 - k) * 0.65, 24, 1, 0, (1 - k) * Math.PI * 2]} />
          <meshBasicMaterial color="#ffe27a" transparent opacity={0.95} depthWrite={false} side={2} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'ring') {
    const s = 0.5 + age * 3.2;
    return (
      <group position={[WX(fx.x), 0.08, WZ(fx.z)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[s, s + 0.22, 32]} />
          <meshBasicMaterial color={color} transparent opacity={Math.max(0, 0.9 - age * 1.1)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'dust') {
    const s = 0.3 + age * 1.8;
    return (
      <mesh position={[WX(fx.x), 0.3 + age * 0.8, WZ(fx.z)]}>
        <sphereGeometry args={[s, 8, 8]} />
        <meshBasicMaterial color="#d8b48f" transparent opacity={Math.max(0, 0.55 - age * 0.7)} depthWrite={false} />
      </mesh>
    );
  }
  if (fx.kind === 'hit') {
    return (
      <group position={[WX(fx.x), 0.8, WZ(fx.z)]}>
        <mesh>
          <octahedronGeometry args={[0.28 + age * 0.9, 0]} />
          <meshBasicMaterial color="#ffe27a" transparent opacity={Math.max(0, 0.9 - age * 2.4)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'smoke') {
    // mfiti: purple-black swirling smoke + night-blue glow
    return (
      <group position={[WX(fx.x), 0, WZ(fx.z)]}>
        {[-0.7, 0, 0.7].map((dx, i) => (
          <mesh key={i} position={[dx, 0.5 + age * 1.1, (i % 2) * 0.7 - 0.35]}>
            <sphereGeometry args={[0.55 + age * 0.7, 8, 8]} />
            <meshBasicMaterial color={i === 1 ? '#2a1a3a' : '#4a2a6a'} transparent opacity={Math.max(0, 0.7 - age * 0.6)} depthWrite={false} />
          </mesh>
        ))}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
          <circleGeometry args={[1.6 - age * 0.4, 24]} />
          <meshBasicMaterial color="#3a5a9a" transparent opacity={Math.max(0, 0.5 - age * 0.45)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'bolt') {
    // mphezi: forked bolt + white flash + scorch handled separately
    return (
      <group position={[WX(fx.x), 0, WZ(fx.z)]}>
        <mesh position={[0.3, 3.5, 0]} rotation={[0, 0, 0.18]}>
          <boxGeometry args={[0.22, 7, 0.22]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={Math.max(0, 1 - age * 3)} depthWrite={false} />
        </mesh>
        <mesh position={[-0.4, 2.2, 0.2]} rotation={[0, 0, -0.35]}>
          <boxGeometry args={[0.12, 3, 0.12]} />
          <meshBasicMaterial color="#c7b8ff" transparent opacity={Math.max(0, 0.9 - age * 2.6)} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[0.9 + age * 1.6, 10, 10]} />
          <meshBasicMaterial color="#fff6d8" transparent opacity={Math.max(0, 0.85 - age * 2.2)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'scorch') {
    // mphezi scorch mark: fades over ~5s
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WX(fx.x), 0.04, WZ(fx.z)]}>
        <circleGeometry args={[0.8, 14]} />
        <meshBasicMaterial color="#14100c" transparent opacity={Math.max(0, 0.6 - age * 0.12)} depthWrite={false} />
      </mesh>
    );
  }
  if (fx.kind === 'sweep') {
    // zikwanje: visible swoosh arc + flying cut grass (leaves, never gore)
    const o = Math.max(0, 0.9 - age * 1.6);
    return (
      <group position={[WX(fx.x), 0.9, WZ(fx.z)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.6 + age * 1.6, 1.0 + age * 1.6, 20, 1, 0, Math.PI * 0.9]} />
          <meshBasicMaterial color="#dff5d0" transparent opacity={o} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        {[-0.9, -0.2, 0.5, 1.0].map((dx, i) => (
          <mesh key={i} position={[dx, age * (1.2 + i * 0.25), (i % 2) * 0.8 - 0.4]} rotation={[age * 4, age * 3, 0]}>
            <boxGeometry args={[0.16, 0.05, 0.22]} />
            <meshBasicMaterial color={i % 2 ? '#5da24a' : '#8ac86a'} transparent opacity={o} depthWrite={false} />
          </mesh>
        ))}
      </group>
    );
  }
  if (fx.kind === 'grass') {
    return (
      <mesh position={[WX(fx.x), 0.25 + age * 0.9, WZ(fx.z)]} rotation={[age * 3, 0, age * 2]}>
        <boxGeometry args={[0.14, 0.05, 0.2]} />
        <meshBasicMaterial color="#6aa84f" transparent opacity={Math.max(0, 0.7 - age * 1.2)} depthWrite={false} />
      </mesh>
    );
  }
  if (fx.kind === 'sting') {
    // njuchi sting spark + tiny buzz ring
    return (
      <group position={[WX(fx.x), FLY_H_T, WZ(fx.z)]}>
        <mesh>
          <octahedronGeometry args={[0.14 + age * 0.5, 0]} />
          <meshBasicMaterial color="#ffe27a" transparent opacity={Math.max(0, 0.9 - age * 2.4)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'boom') {
    const s = 0.6 + age * 4.5;
    return (
      <group position={[WX(fx.x), 0.5, WZ(fx.z)]}>
        <mesh>
          <sphereGeometry args={[s, 10, 10]} />
          <meshBasicMaterial color="#c98d54" transparent opacity={Math.max(0, 0.6 - age * 0.5)} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <octahedronGeometry args={[0.5 + age * 1.4, 0]} />
          <meshBasicMaterial color="#ffe27a" transparent opacity={Math.max(0, 0.9 - age * 1.2)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  // splash (rain hit)
  if (fx.kind === 'splash') {
    return (
      <mesh position={[WX(fx.x), 0.1 + age * 0.5, WZ(fx.z)]}>
        <sphereGeometry args={[0.12 + age * 0.25, 6, 6]} />
        <meshBasicMaterial color="#bfe6f5" transparent opacity={Math.max(0, 0.7 - age * 1.8)} depthWrite={false} />
      </mesh>
    );
  }
  if (fx.kind === 'surge') {
    // lake surge: fast expanding foam ring + spray
    const s = 0.4 + age * 5.2;
    return (
      <group position={[WX(fx.x), 0, WZ(fx.z)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
          <ringGeometry args={[s, s + 0.5, 36]} />
          <meshBasicMaterial color="#bfe6f5" transparent opacity={Math.max(0, 0.95 - age * 1.1)} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
          <circleGeometry args={[Math.max(0.01, s - 0.4), 28]} />
          <meshBasicMaterial color="#3f9fc4" transparent opacity={Math.max(0, 0.5 - age * 0.6)} depthWrite={false} />
        </mesh>
        {[-1.4, -0.5, 0.6, 1.5].map((dx, i) => (
          <mesh key={i} position={[dx, 0.4 + age * (1.6 + i * 0.2), (i % 2) * 1.2 - 0.6]}>
            <sphereGeometry args={[0.22, 6, 6]} />
            <meshBasicMaterial color="#e8f6fd" transparent opacity={Math.max(0, 0.85 - age * 1.2)} depthWrite={false} />
          </mesh>
        ))}
      </group>
    );
  }
  if (fx.kind === 'blaze') {
    // moto: fire burst + lingering scorch mark
    const s = 0.5 + age * 3.6;
    return (
      <group position={[WX(fx.x), 0, WZ(fx.z)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <circleGeometry args={[2.3, 24]} />
          <meshBasicMaterial color="#2a1008" transparent opacity={Math.max(0, 0.55 - age * 0.3)} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.6 + age * 1.2, 0]}>
          <sphereGeometry args={[s, 10, 10]} />
          <meshBasicMaterial color="#ff6a2a" transparent opacity={Math.max(0, 0.65 - age * 0.55)} depthWrite={false} />
        </mesh>
        <mesh position={[0, 0.9 + age * 1.6, 0]}>
          <octahedronGeometry args={[0.5 + age * 1.2, 0]} />
          <meshBasicMaterial color="#ffe27a" transparent opacity={Math.max(0, 0.9 - age * 1.1)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  if (fx.kind === 'gust') {
    // mphepo: fast expanding pale rings + blown dust
    const s = 0.4 + age * 5.6;
    return (
      <group position={[WX(fx.x), 0, WZ(fx.z)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.1, 0]}>
          <ringGeometry args={[s, s + 0.4, 36]} />
          <meshBasicMaterial color="#eef4f6" transparent opacity={Math.max(0, 0.9 - age * 1.2)} depthWrite={false} />
        </mesh>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
          <ringGeometry args={[Math.max(0.01, s - 1.1), Math.max(0.01, s - 0.8), 36]} />
          <meshBasicMaterial color="#cfdde4" transparent opacity={Math.max(0, 0.7 - age * 1.0)} depthWrite={false} />
        </mesh>
        {[-1.6, -0.5, 0.6, 1.6].map((dx, i) => (
          <mesh key={i} position={[dx, 0.3 + age * 0.9, (i % 2) * 1.4 - 0.7]}>
            <sphereGeometry args={[0.2 + age * 0.3, 6, 6]} />
            <meshBasicMaterial color="#d8c9a8" transparent opacity={Math.max(0, 0.6 - age * 0.9)} depthWrite={false} />
          </mesh>
        ))}
      </group>
    );
  }
  if (fx.kind === 'projectile') {
    // ranged tracer: travels from attacker (x,z) to target (tx,tz,ty) over ~0.3s
    const k = Math.min(1, age / 0.3);
    const sx = WX(fx.x) + (WX(fx.tx ?? fx.x) - WX(fx.x)) * k;
    const sz = WZ(fx.z) + (WZ(fx.tz ?? fx.z) - WZ(fx.z)) * k;
    const ty = fx.ty ?? 1.0;
    const arc = Math.sin(k * Math.PI) * 1.2;
    const y = 1.0 + (ty - 1.0) * k + arc;
    return (
      <mesh position={[sx, y, sz]}>
        <sphereGeometry args={[0.12, 6, 6]} />
        <meshBasicMaterial color={fx.team === undefined && ty > 1.5 ? '#c77dff' : '#ffe27a'} transparent opacity={Math.max(0, 0.95 - age)} depthWrite={false} />
      </mesh>
    );
  }
  if (fx.kind === 'chip') {
    // tower chips fly
    return (
      <group position={[WX(fx.x), 1.5, WZ(fx.z)]}>
        {[-0.5, 0, 0.5].map((dx, i) => (
          <mesh key={i} position={[dx + age * (i - 1) * 1.5, age * (2 - i * 0.4), (i % 2) * 0.5 - 0.25]} rotation={[age * 5, age * 4, 0]}>
            <boxGeometry args={[0.18, 0.14, 0.12]} />
            <meshBasicMaterial color={i === 1 ? '#a8502c' : '#7e3a22'} transparent opacity={Math.max(0, 0.9 - age * 1.5)} depthWrite={false} />
          </mesh>
        ))}
      </group>
    );
  }
  if (fx.kind === 'ghost') {
    // fading silhouette after death
    return (
      <mesh position={[WX(fx.x), 0.5, WZ(fx.z)]}>
        <capsuleGeometry args={[0.3, 0.7, 4, 8]} />
        <meshBasicMaterial color={fx.team != null ? TEAM_COLOR[fx.team] : '#ffffff'} transparent opacity={Math.max(0, 0.5 - age * 0.6)} depthWrite={false} />
      </mesh>
    );
  }
  if (fx.kind === 'pulseRing') {
    const s = 0.4 + age * 2.2;
    return (
      <group position={[WX(fx.x), 0.1, WZ(fx.z)]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[s, s + 0.18, 32]} />
          <meshBasicMaterial color="#ffd76a" transparent opacity={Math.max(0, 0.8 - age * 1.0)} depthWrite={false} />
        </mesh>
      </group>
    );
  }
  // harvest: golden motes rising from the fields
  return (
    <group position={[WX(fx.x), 0, WZ(fx.z)]}>
      {[-1.2, -0.4, 0.4, 1.2, 0].map((dx, i) => (
        <mesh key={i} position={[dx, 0.4 + age * 1.8 + (i % 3) * 0.3, ((i * 37) % 20) / 10 - 1]}>
          <octahedronGeometry args={[0.14, 0]} />
          <meshBasicMaterial color="#ffe27a" transparent opacity={Math.max(0, 0.95 - age * 0.8)} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function RainCloud({ r }: { r: RainZone }) {
  const drops = useRef<THREE.Points>(null!);
  const geo = useRef<THREE.BufferGeometry>(null!);
  const ring = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const p = geo.current?.attributes.position as THREE.BufferAttribute | undefined;
    if (p) {
      const t = clock.elapsedTime * 9;
      for (let i = 0; i < p.count; i++) {
        const y = 6 - ((t + i * 0.7) % 6);
        p.setY(i, y);
      }
      p.needsUpdate = true;
    }
    if (ring.current) {
      const k = (clock.elapsedTime * 0.8) % 1;
      const s = r.r * (0.55 + k * 0.45);
      ring.current.scale.set(s / r.r, s / r.r, 1);
      (ring.current.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - k);
    }
  });
  // 350 falling streak particles inside the spell radius (spec: 300-600)
  const N = 350;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (i % 5) * 0.7;
    const rr = Math.sqrt((i % 97) / 97) * (r.r - 0.15);
    pos[i * 3] = WX(r.x) + Math.cos(a) * rr;
    pos[i * 3 + 1] = 6 - (i % 6);
    pos[i * 3 + 2] = WZ(r.z) + Math.sin(a) * rr;
  }
  return (
    <group>
      {/* dark wet ground + puddle reflections */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WX(r.x), 0.03, WZ(r.z)]}>
        <circleGeometry args={[r.r, 28]} />
        <meshStandardMaterial color="#5e2f1c" roughness={0.6} transparent opacity={0.85} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WX(r.x) + 0.8, 0.045, WZ(r.z) - 0.5]}>
        <circleGeometry args={[1.1, 20]} />
        <meshStandardMaterial color="#9fd4e8" roughness={0.1} metalness={0.7} transparent opacity={0.8} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[WX(r.x) - 1.2, 0.045, WZ(r.z) + 0.9]}>
        <circleGeometry args={[0.7, 18]} />
        <meshStandardMaterial color="#9fd4e8" roughness={0.1} metalness={0.7} transparent opacity={0.8} />
      </mesh>
      {/* splash ring on the ground (never blocks towers) */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[WX(r.x), 0.06, WZ(r.z)]}>
        <ringGeometry args={[0.9, 1.05, 40]} />
        <meshBasicMaterial color="#bfe6f5" transparent opacity={0.5} depthWrite={false} />
      </mesh>
      {/* rain shaft */}
      <mesh position={[WX(r.x), 3, WZ(r.z)]}>
        <cylinderGeometry args={[r.r, r.r * 1.05, 6, 20, 1, true]} />
        <meshBasicMaterial color="#7fb8d8" transparent opacity={0.16} depthWrite={false} side={THREE.DoubleSide} />
      </mesh>
      {/* semi-transparent rain cloud hovering above — opacity ~0.6, flattened,
          depthWrite off so it can NEVER block towers */}
      <mesh position={[WX(r.x), 7.4, WZ(r.z)]} scale={[1, 0.55, 1]}>
        <sphereGeometry args={[r.r * 0.7, 12, 8]} />
        <meshStandardMaterial color="#4a5a68" roughness={1} flatShading transparent opacity={0.6} depthWrite={false} />
      </mesh>
      <mesh position={[WX(r.x) - r.r * 0.45, 7.0, WZ(r.z) + 0.4]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[r.r * 0.42, 10, 8]} />
        <meshStandardMaterial color="#5a6a78" roughness={1} flatShading transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh position={[WX(r.x) + r.r * 0.45, 7.0, WZ(r.z) - 0.4]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[r.r * 0.42, 10, 8]} />
        <meshStandardMaterial color="#5a6a78" roughness={1} flatShading transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <points ref={drops}>
        <bufferGeometry ref={geo}>
          <bufferAttribute attach="attributes-position" args={[pos, 3]} />
        </bufferGeometry>
        <pointsMaterial color="#bfe6f5" size={0.14} transparent opacity={0.9} depthWrite={false} />
      </points>
    </group>
  );
}

function Roadblock({ o }: { o: Obstacle }) {
  const pct = Math.max(0, o.hp / o.maxHp);
  return (
    <group position={[WX(o.x), 0, WZ(o.z)]} rotation={[0, 0.06, 0]}>
      {/* drums */}
      {[-1.05, 0, 1.05].map((dx, i) => (
        <group key={i} position={[dx, 0, (i % 2) * 0.25]}>
          <mesh position={[0, 0.45, 0]} castShadow>
            <cylinderGeometry args={[0.34, 0.36, 0.85, 9]} />
            <meshStandardMaterial color={i === 1 ? '#8a4fb5' : '#c96a2e'} roughness={0.8} />
          </mesh>
          <mesh position={[0, 0.9, 0]}>
            <cylinderGeometry args={[0.34, 0.34, 0.05, 9]} />
            <meshStandardMaterial color="#e8d8b0" roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* crates */}
      <mesh position={[-0.55, 0.3, -0.45]} rotation={[0, 0.3, 0]} castShadow>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial color="#a8763e" roughness={0.95} />
      </mesh>
      <mesh position={[0.6, 0.28, -0.5]} rotation={[0, -0.2, 0]} castShadow>
        <boxGeometry args={[0.55, 0.55, 0.55]} />
        <meshStandardMaterial color="#93702f" roughness={0.95} />
      </mesh>
      {/* fallen bicycle */}
      <group position={[0.1, 0.25, 0.55]} rotation={[Math.PI / 2.2, 0, 0.4]}>
        <mesh rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.3, 0.045, 6, 12]} />
          <meshStandardMaterial color="#222" roughness={0.6} />
        </mesh>
      </group>
      {/* hp pips */}
      <mesh position={[0, 1.45, 0]}>
        <planeGeometry args={[1.6 * pct, 0.12]} />
        <meshBasicMaterial color="#e8a020" depthWrite={false} />
      </mesh>
    </group>
  );
}

export function EffectsLayer({ fx, rains, puddles, obstacles, now }: {
  fx: (FxItem & { born: number })[];
  rains: RainZone[];
  puddles: Puddle[];
  obstacles: Obstacle[];
  now: number;
}) {
  return (
    <group>
      {rains.map((r, i) => <RainCloud key={'r' + i} r={r} />)}
      {puddles.map((p, i) => <PuddleMesh key={'p' + i} p={p} />)}
      {obstacles.map((o) => <Roadblock key={o.id} o={o} />)}
      {fx.map((f) => <FxOne key={f.id} fx={f} age={now - f.born} />)}
    </group>
  );
}
