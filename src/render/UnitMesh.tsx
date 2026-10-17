import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { WX, WZ, TEAM_COLOR, pick, HpBar } from './world';
import { BlobShadow } from './BlobShadow';

export interface UnitViewData {
  id: number; card: string; sub: string; owner: 0 | 1;
  x: number; z: number; hp: number; maxHp: number;
  shield?: number; maxShield?: number;
  lifePct?: number;
  swing: number; walkPhase: number; speed: number;
  isGoat: boolean; ranged: boolean;
  layer: 'ground' | 'air';
  /** inside an enemy Mfiti curse aura: faint purple wisp */
  cursed?: boolean;
  /** standing in Mvula rain/puddle: subtle blue tint (visual only) */
  wet?: boolean;
}

/** Team ring on the ground: blue = player, red = Mdani. Readable in 1s. */
function TeamRing({ owner, r = 0.62 }: { owner: 0 | 1; r?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.045, 0]}>
      <ringGeometry args={[r, r + 0.13, 28]} />
      <meshBasicMaterial color={TEAM_COLOR[owner]} transparent opacity={0.95} depthWrite={false} />
    </mesh>
  );
}

/** Flying height for air layer (~2 m above ground). */
export const FLY_H = 2;

function Limb({ pos, swing, color, len = 0.5, r = 0.09 }: { pos: [number, number, number]; swing: number; color: string; len?: number; r?: number }) {
  return (
    <mesh position={[pos[0], pos[1] - Math.abs(Math.sin(swing)) * 0.12, pos[2] + Math.sin(swing) * 0.16]} castShadow>
      <cylinderGeometry args={[r, r * 0.85, len, 6]} />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}

function GoatMesh({ u }: { u: UnitViewData }) {
  const g = useRef<THREE.Group>(null!);
  const body = pick(['#e8e2d4', '#d8cfc0', '#b09a7a'], u.id, 3);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 9 + u.walkPhase;
    if (!g.current) return;
    g.current.position.y = Math.abs(Math.sin(t)) * 0.06;
  });
  const lunge = u.swing >= 5 && u.swing <= 7 ? 0.3 : 0;
  const legSwing = Math.sin(u.walkPhase * 2) * 0.18;
  return (
    <group ref={g}>
      <mesh position={[0, 0.42 + lunge * 0.3, lunge]} castShadow>
        <boxGeometry args={[0.62, 0.4, 0.32]} />
        <meshStandardMaterial color={body} roughness={1} emissive={u.wet ? '#2f7fe0' : '#000000'} emissiveIntensity={u.wet ? 0.25 : 0} />
      </mesh>
      <mesh position={[0.36, 0.62 + lunge * 0.3, lunge]} castShadow>
        <boxGeometry args={[0.24, 0.26, 0.24]} />
        <meshStandardMaterial color={body} roughness={1} emissive={u.wet ? '#2f7fe0' : '#000000'} emissiveIntensity={u.wet ? 0.25 : 0} />
      </mesh>
      {[0.3, 0.44].map((hx, i) => (
        <mesh key={i} position={[hx, 0.78, 0]} rotation={[0, 0, -0.35 + i * 0.7]}>
          <coneGeometry args={[0.04, 0.2, 5]} />
          <meshStandardMaterial color="#7a6a4c" roughness={0.9} />
        </mesh>
      ))}
      {/* four legs: quadruped silhouette reads at default zoom */}
      {[[-0.2, -0.1, 0], [-0.2, 0.1, Math.PI], [0.2, -0.1, 0], [0.2, 0.1, Math.PI]].map((p, i) => (
        <mesh key={'leg' + i} position={[p[0], 0.14, p[1]]} rotation={[Math.sin(u.walkPhase * 2 + i * 1.7) * 0.35 + (i < 2 ? legSwing : -legSwing), 0, 0]}>
          <cylinderGeometry args={[0.05, 0.04, 0.3, 5]} />
          <meshStandardMaterial color={body} roughness={1} />
        </mesh>
      ))}
      {/* beard + team collar */}
      <mesh position={[0.44, 0.48, 0]}>
        <coneGeometry args={[0.06, 0.16, 5]} />
        <meshStandardMaterial color="#b09a7a" roughness={1} />
      </mesh>
      <mesh position={[0.18, 0.5, 0]}>
        <boxGeometry args={[0.1, 0.44, 0.36]} />
        <meshStandardMaterial color={TEAM_COLOR[u.owner]} roughness={0.6} emissive={TEAM_COLOR[u.owner]} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

/** Afisi — spotted hyena quadruped: sloping back, blunt head, mane, spots, 4 legs. */
function HyenaMesh({ u }: { u: UnitViewData }) {
  const g = useRef<THREE.Group>(null!);
  const body = pick(['#9a8a68', '#8a7a58', '#a89878'], u.id, 4);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 10 + u.walkPhase;
    if (!g.current) return;
    g.current.position.y = Math.abs(Math.sin(t)) * 0.07;
  });
  const lunge = u.swing >= 5 && u.swing <= 7 ? 0.32 : 0;
  return (
    <group ref={g}>
      {/* sloping body: high shoulders, low hind */}
      <mesh position={[0, 0.46 + lunge * 0.3, lunge]} rotation={[0, 0, -0.1]} castShadow>
        <boxGeometry args={[0.72, 0.4, 0.34]} />
        <meshStandardMaterial color={body} roughness={1} emissive={u.wet ? '#2f7fe0' : '#000000'} emissiveIntensity={u.wet ? 0.25 : 0} />
      </mesh>
      {/* mane ridge */}
      <mesh position={[-0.05, 0.68 + lunge * 0.3, lunge]} rotation={[0, 0, -0.1]}>
        <boxGeometry args={[0.5, 0.12, 0.2]} />
        <meshStandardMaterial color="#4a3a28" roughness={1} />
      </mesh>
      {/* blunt head + rounded ears + snout */}
      <mesh position={[0.42, 0.62 + lunge * 0.3, lunge]} castShadow>
        <boxGeometry args={[0.26, 0.28, 0.26]} />
        <meshStandardMaterial color={body} roughness={1} emissive={u.wet ? '#2f7fe0' : '#000000'} emissiveIntensity={u.wet ? 0.25 : 0} />
      </mesh>
      <mesh position={[0.58, 0.56 + lunge * 0.3, lunge]}>
        <boxGeometry args={[0.14, 0.14, 0.18]} />
        <meshStandardMaterial color="#6a5a40" roughness={1} />
      </mesh>
      {[0.36, 0.5].map((hx, i) => (
        <mesh key={i} position={[hx, 0.8, 0]}>
          <sphereGeometry args={[0.07, 6, 6]} />
          <meshStandardMaterial color="#4a3a28" roughness={1} />
        </mesh>
      ))}
      {/* spots (recoloured wolf/dog pattern stand-in for hyena) */}
      {[[0.1, 0.5], [-0.15, 0.45], [0.2, 0.42], [-0.05, 0.52], [0.28, 0.5]].map((p, i) => (
        <mesh key={'s' + i} position={[p[0], p[1], 0.18]}>
          <sphereGeometry args={[0.05, 5, 5]} />
          <meshStandardMaterial color="#5a4a30" roughness={1} />
        </mesh>
      ))}
      {[[0.1, 0.5], [-0.15, 0.45]].map((p, i) => (
        <mesh key={'s2' + i} position={[p[0], p[1], -0.18]}>
          <sphereGeometry args={[0.05, 5, 5]} />
          <meshStandardMaterial color="#5a4a30" roughness={1} />
        </mesh>
      ))}
      {/* four legs + tail: quadruped silhouette */}
      {[[-0.25, -0.11], [-0.25, 0.11], [0.25, -0.11], [0.25, 0.11]].map((p, i) => (
        <mesh key={'leg' + i} position={[p[0], 0.16, p[1]]} rotation={[Math.sin(u.walkPhase * 2 + i * 1.6) * 0.4, 0, 0]}>
          <cylinderGeometry args={[0.055, 0.045, 0.34, 5]} />
          <meshStandardMaterial color={i < 2 ? '#7a6a4c' : body} roughness={1} />
        </mesh>
      ))}
      <mesh position={[-0.42, 0.5, 0]} rotation={[0, 0, 0.7]}>
        <cylinderGeometry args={[0.04, 0.03, 0.35, 5]} />
        <meshStandardMaterial color="#4a3a28" roughness={1} />
      </mesh>
      {/* team collar: brighter trim */}
      <mesh position={[0.24, 0.52, 0]}>
        <boxGeometry args={[0.1, 0.46, 0.38]} />
        <meshStandardMaterial color={TEAM_COLOR[u.owner]} roughness={0.6} emissive={TEAM_COLOR[u.owner]} emissiveIntensity={0.45} />
      </mesh>
    </group>
  );
}

/** Chunky cute-but-angry bee: striped body, flapping wings, stinger. */
function BeeMesh({ u }: { u: UnitViewData }) {
  const wings = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (!wings.current) return;
    const f = Math.sin(clock.elapsedTime * 40 + u.walkPhase) * 0.7;
    wings.current.rotation.z = f;
  });
  const jab = u.swing >= 5 && u.swing <= 6 ? 0.25 : 0;
  return (
    <group>
      {/* body */}
      <mesh position={[0, 0, jab]} castShadow>
        <sphereGeometry args={[0.3, 10, 10]} />
        <meshStandardMaterial color="#e8b820" roughness={0.7} />
      </mesh>
      {/* black stripes */}
      {[-0.1, 0.12].map((sx, i) => (
        <mesh key={i} position={[sx, 0, jab]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.28, 0.06, 6, 12]} />
          <meshStandardMaterial color="#222222" roughness={0.8} />
        </mesh>
      ))}
      {/* angry eyes */}
      {[-0.12, 0.12].map((ex, i) => (
        <mesh key={'e' + i} position={[0.24, 0.1, ex]}>
          <sphereGeometry args={[0.06, 6, 6]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
        </mesh>
      ))}
      {/* stinger */}
      <mesh position={[-0.34, 0, jab]} rotation={[0, 0, Math.PI / 2]}>
        <coneGeometry args={[0.07, 0.18, 6]} />
        <meshStandardMaterial color="#333" roughness={0.6} />
      </mesh>
      {/* flapping wings */}
      <group ref={wings} position={[0, 0.28, 0]}>
        {[-0.2, 0.2].map((wz, i) => (
          <mesh key={i} position={[0, 0.05, wz]} rotation={[0.5, 0, i === 0 ? 0.5 : -0.5]}>
            <planeGeometry args={[0.28, 0.18]} />
            <meshStandardMaterial color="#dff2ff" transparent opacity={0.65} side={THREE.DoubleSide} roughness={0.3} />
          </mesh>
        ))}
      </group>
      {/* team dot */}
      <mesh position={[0, -0.22, 0]}>
        <sphereGeometry args={[0.07, 6, 6]} />
        <meshBasicMaterial color={TEAM_COLOR[u.owner]} />
      </mesh>
    </group>
  );
}

/** Kadzidzi owl: round body, big eyes, ear tufts, wide wings. */
export function OwlMesh({ u, small }: { u: UnitViewData; small?: boolean }) {
  const g = useRef<THREE.Group>(null!);
  const s = small ? 0.6 : 1.0;
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.rotation.z = Math.sin(clock.elapsedTime * 3 + u.walkPhase) * 0.12;
  });
  const snap = u.swing >= 5 && u.swing <= 6 ? 0.2 : 0;
  return (
    <group ref={g} scale={s}>
      <mesh position={[0, 0, snap]} castShadow>
        <sphereGeometry args={[0.32, 10, 10]} />
        <meshStandardMaterial color="#5a3a28" roughness={1} />
      </mesh>
      {/* ear tufts */}
      {[-0.18, 0.18].map((ex, i) => (
        <mesh key={i} position={[0.05, 0.32, ex]} rotation={[0, 0, -0.3 + i * 0.6]}>
          <coneGeometry args={[0.08, 0.22, 5]} />
          <meshStandardMaterial color="#3a2414" roughness={1} />
        </mesh>
      ))}
      {/* big round eyes */}
      {[-0.13, 0.13].map((ex, i) => (
        <group key={'e' + i} position={[0.26, 0.1, ex]}>
          <mesh>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial color="#ffe9b0" roughness={0.3} emissive="#ffcf5a" emissiveIntensity={0.4} />
          </mesh>
          <mesh position={[0.06, 0, 0]}>
            <sphereGeometry args={[0.045, 6, 6]} />
            <meshBasicMaterial color="#111" />
          </mesh>
        </group>
      ))}
      {/* beak */}
      <mesh position={[0.32, -0.02, 0]} rotation={[0, 0, -Math.PI / 2]}>
        <coneGeometry args={[0.05, 0.12, 5]} />
        <meshStandardMaterial color="#e8a020" roughness={0.7} />
      </mesh>
      {/* wings */}
      {[-0.32, 0.32].map((wz, i) => (
        <mesh key={'w' + i} position={[-0.05, 0, wz]} rotation={[i === 0 ? 0.5 : -0.5, 0, 0]}>
          <boxGeometry args={[0.4, 0.08, 0.24]} />
          <meshStandardMaterial color="#4a2e1c" roughness={1} />
        </mesh>
      ))}
    </group>
  );
}

/** Mfiti — a clearly MYTHICAL night-folklore figure: tall dark layered cloth,
 *  glowing violet eyes, feathered staff, an owl on her shoulder, hovering.
 *  Stylised, never a realistic person. */
function WitchMesh({ u }: { u: UnitViewData }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (!g.current) return;
    g.current.position.y = 0.35 + Math.sin(clock.elapsedTime * 1.8 + u.walkPhase) * 0.1;
    g.current.rotation.y = Math.sin(clock.elapsedTime * 0.7) * 0.2;
  });
  const cast = u.swing >= 0 && u.swing < 5 ? -0.3 : u.swing >= 5 && u.swing <= 6 ? 0.5 : 0;
  return (
    <group>
      <group ref={g}>
        {/* layered dark cloth: three stacked cones */}
        {[0, 1, 2].map((i) => (
          <mesh key={i} position={[0, 0.5 + i * 0.42, 0]} castShadow>
            <coneGeometry args={[0.72 - i * 0.14, 0.62, 7]} />
            <meshStandardMaterial color={i === 1 ? '#4a2a6a' : '#241a30'} roughness={1} flatShading />
          </mesh>
        ))}
        {/* head wrap + glowing eyes */}
        <mesh position={[0, 1.85, 0]} castShadow>
          <sphereGeometry args={[0.26, 10, 10]} />
          <meshStandardMaterial color="#1c1426" roughness={1} />
        </mesh>
        {[-0.1, 0.1].map((ex, i) => (
          <mesh key={'e' + i} position={[0.2, 1.88, ex]}>
            <sphereGeometry args={[0.055, 6, 6]} />
            <meshBasicMaterial color="#c77dff" />
          </mesh>
        ))}
        {/* feathered staff */}
        <group position={[0.45, 0.4, 0.1 + cast * 0.4]} rotation={[cast, 0, -0.1]}>
          <mesh position={[0, 1.1, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 2.2, 5]} />
            <meshStandardMaterial color="#4a2e1c" roughness={1} />
          </mesh>
          {[-0.12, 0, 0.12].map((fz, i) => (
            <mesh key={i} position={[0, 2.3 + (i % 2) * 0.15, fz]} rotation={[0.3, 0, 0.2]}>
              <coneGeometry args={[0.09, 0.4, 5]} />
              <meshStandardMaterial color={i === 1 ? '#8a4fb5' : '#5a3a7a'} roughness={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 2.55, 0]}>
            <sphereGeometry args={[0.09, 8, 8]} />
            <meshBasicMaterial color="#c77dff" />
          </mesh>
        </group>
        {/* owl on her shoulder */}
        <group position={[-0.35, 1.55, 0.3]}>
          <OwlMesh u={u} small />
        </group>
        {/* team sash wisp */}
        <mesh position={[0, 0.9, 0.3]}>
          <boxGeometry args={[0.14, 0.5, 0.03]} />
          <meshStandardMaterial color={TEAM_COLOR[u.owner]} roughness={0.6} emissive={TEAM_COLOR[u.owner]} emissiveIntensity={0.35} />
        </mesh>
      </group>
      {/* curse aura: dark purple ring, radius 3 */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[2.7, 3.0, 40]} />
        <meshBasicMaterial color="#6a2a9a" transparent opacity={0.5} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Zikwanje farmer: straw hat, farm shirt, gumboots, cartoon panga. */
function PangaMesh({ u }: { u: UnitViewData }) {
  const skin = useMemo(() => pick(['#6b4226', '#7a4b2a', '#8d5a33', '#5a341e'], u.id, 1), [u.id]);
  const shirt = useMemo(() => pick(['#5da24a', '#7db35a', '#3f8f5a', '#8ab54a'], u.id, 2), [u.id]);
  const sweep = u.swing >= 0 ? Math.sin((Math.max(0, u.swing) / 10) * Math.PI) : 0;
  return (
    <group>
      <Limb pos={[-0.14, 0.32, 0]} swing={u.walkPhase} color="#2c2c34" />
      <Limb pos={[0.14, 0.32, 0]} swing={u.walkPhase + Math.PI} color="#2c2c34" />
      {/* gumboots */}
      {[-0.14, 0.14].map((bx, i) => (
        <mesh key={i} position={[bx, 0.1, 0.08]}>
          <boxGeometry args={[0.16, 0.2, 0.3]} />
          <meshStandardMaterial color="#2a4a2a" roughness={0.9} />
        </mesh>
      ))}
      {/* torso */}
      <mesh position={[0, 0.72, 0]} castShadow>
        <boxGeometry args={[0.5, 0.55, 0.32]} />
        <meshStandardMaterial color={shirt} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.74, 0.17]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.16, 0.6, 0.03]} />
        <meshStandardMaterial color={TEAM_COLOR[u.owner]} roughness={0.6} emissive={TEAM_COLOR[u.owner]} emissiveIntensity={0.25} />
      </mesh>
      {/* head + straw hat */}
      <mesh position={[0, 1.22, 0]} castShadow>
        <sphereGeometry args={[0.26, 12, 12]} />
        <meshStandardMaterial color={skin} roughness={0.75} />
      </mesh>
      <mesh position={[0, 1.44, 0]} castShadow>
        <coneGeometry args={[0.42, 0.25, 9]} />
        <meshStandardMaterial color="#d8b45a" roughness={1} flatShading />
      </mesh>
      {/* left arm */}
      <Limb pos={[-0.33, 0.72, 0]} swing={u.walkPhase + Math.PI} color={skin} len={0.45} />
      {/* right arm + BIG panga machete (swings with attack — Zikwanje signature) */}
      <group position={[0.33, 0.95, 0.1]} rotation={[0, 0, -0.5 - sweep * 1.6]}>
        <mesh position={[0, -0.2, 0]}>
          <cylinderGeometry args={[0.05, 0.05, 0.4, 5]} />
          <meshStandardMaterial color={skin} roughness={0.8} emissive={u.wet ? '#2f7fe0' : '#000000'} emissiveIntensity={u.wet ? 0.2 : 0} />
        </mesh>
        <mesh position={[0, -0.55, 0.05]}>
          <cylinderGeometry args={[0.04, 0.04, 0.28, 5]} />
          <meshStandardMaterial color="#5a3a22" roughness={0.9} />
        </mesh>
        {/* wide long cartoon panga blade — attack/defend reads at zoom */}
        <mesh position={[0, -0.95, 0.14]} rotation={[0.2, 0, 0.15]}>
          <boxGeometry args={[0.22, 0.72, 0.05]} />
          <meshStandardMaterial color="#d8e4e8" roughness={0.25} metalness={0.7} emissive="#ffffff" emissiveIntensity={0.12} />
        </mesh>
        <mesh position={[0, -1.28, 0.17]} rotation={[0.2, 0, 0.15]}>
          <boxGeometry args={[0.22, 0.08, 0.05]} />
          <meshStandardMaterial color="#8a4fb5" roughness={0.6} />
        </mesh>
      </group>
    </group>
  );
}

export function UnitMesh({ u, celebrate }: { u: UnitViewData; celebrate: boolean }) {
  const g = useRef<THREE.Group>(null!);
  const bar = useRef<THREE.Group>(null!);
  const cam = useThree((s) => s.camera);
  const px = useRef(WX(u.x));
  const pz = useRef(WZ(u.z));
  const hpRef = useRef(u.hp);
  const flash = useRef(0);
  const flashMesh = useRef<THREE.Mesh>(null!);
  const hpFg = useRef<THREE.Mesh>(null!);
  const hpGhost = useRef<THREE.Mesh>(null!);
  const hpShow = useRef(1);
  const ghostShow = useRef(1);
  const born = useRef(-1);

  const skin = useMemo(() => pick(['#6b4226', '#7a4b2a', '#8d5a33', '#5a341e', '#a06a42'], u.id, 1), [u.id]);
  const cloth = useMemo(() => pick(['#e8c832', '#d84f6d', '#2fa8a0', '#7db35a', '#8a4fb5', '#f0ead8', '#3f6fb5'], u.id, 2), [u.id]);
  const cap = useMemo(() => pick(['#c22f2f', '#2f7fe0', '#f2f2f2', '#222222', '#e8a020', 'none'], u.id, 5), [u.id]);
  const hair = useMemo(() => pick(['#141414', '#2a2a2a', '#3d2b1f', 'fade', 'braids'], u.id, 6), [u.id]);
  const big = u.card === 'mlonda' ? 1.38 : 1;
  // reference-scale audit (hut tower = 1.0): humanoid 0.35-0.45, hyena 0.30, goat 0.22.
  // Quadrupeds are modelled small for silhouette clarity, so they get a
  // species scale to land inside ±20% (see tools/scale-audit.ts).
  const species = u.sub === 'hyena' ? 1.8 : u.isGoat ? 1.5 : 1;
  const isTowerBldg = u.card === 'watchtower';
  const flying = u.layer === 'air';
  const isWitch = u.sub === 'witch';
  const isBee = u.sub === 'bee';
  const isOwl = u.sub === 'owl';
  const isPanga = u.sub === 'panga';

  useFrame((state, dt) => {
    if (!g.current) return;
    if (born.current < 0) born.current = state.clock.elapsedTime;
    const age = state.clock.elapsedTime - born.current;
    const dur = isTowerBldg ? 0.8 : u.card === 'mlonda' ? 0.45 : 0.35;
    const pop = age < dur ? 0.3 + 0.7 * (age / dur) : 1;
    g.current.scale.setScalar(pop * big * species);
    const k = 1 - Math.exp(-dt * 10);
    px.current += (WX(u.x) - px.current) * k;
    pz.current += (WZ(u.z) - pz.current) * k;
    const jump = celebrate ? Math.abs(Math.sin(state.clock.elapsedTime * 6 + u.id)) * 0.35 : 0;
    // fly ~2 m up with gentle bobbing; ground units hug the dirt
    const hover = flying
      ? FLY_H + Math.sin(state.clock.elapsedTime * 2.2 + u.walkPhase) * 0.18
      : Math.abs(Math.sin(u.walkPhase)) * 0.05 * Math.min(1, u.speed);
    const thud = u.card === 'mlonda' && age < 0.45 ? Math.sin((age / 0.45) * Math.PI) * 0.08 : 0;
    g.current.position.set(px.current, hover + jump - thud * 0.3, pz.current);
    // face travel/enemy: P0 attacks toward -Z
    const baseRy = u.owner === 0 ? Math.PI : 0;
    let lean = 0;
    if (u.swing >= 0 && u.swing < 5) lean = -0.28; // anticipation wind-up
    else if (u.swing >= 5 && u.swing <= 6) lean = 0.42; // strike
    else if (u.swing > 6) lean = 0.12; // follow-through
    g.current.rotation.y = baseRy;
    g.current.rotation.x = lean * 0.5;
    if (u.hp < hpRef.current) flash.current = 1;
    hpRef.current = u.hp;
    flash.current = Math.max(0, flash.current - dt * 12); // 80ms white flash
    if (flashMesh.current) {
      const f = flash.current;
      flashMesh.current.visible = f > 0.05;
      (flashMesh.current.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, f);
    }
    // smooth HP drain + lagging white ghost
    const target = Math.max(0, u.hp / Math.max(1, u.maxHp));
    hpShow.current += (target - hpShow.current) * (1 - Math.exp(-dt * 10));
    ghostShow.current += (hpShow.current - ghostShow.current) * (1 - Math.exp(-dt * 2.5));
    if (hpFg.current) {
      const w = 0.9, fg = w * Math.max(0.001, hpShow.current);
      hpFg.current.scale.x = Math.max(0.001, hpShow.current);
      hpFg.current.position.x = (fg - w) / 2;
    }
    if (hpGhost.current) {
      const w = 0.9, gh = w * Math.max(0.001, ghostShow.current);
      hpGhost.current.scale.x = Math.max(0.001, ghostShow.current);
      hpGhost.current.position.x = (gh - w) / 2;
    }
    if (bar.current) bar.current.quaternion.copy(cam.quaternion);
  });

  const strikeOffset = u.swing >= 5 && u.swing <= 6 ? 0.28 : 0;
  // HP bar floats just above the unit, wherever it flies
  const barY = (flying ? FLY_H + 0.9 : isWitch ? 2.6 : 1.95 * big);

  const hpBar = (shieldPct: number) => (
    <group ref={bar} position={[0, barY, 0]}>
      <group>
        <mesh renderOrder={998}>
          <planeGeometry args={[0.9, 0.11]} />
          <meshBasicMaterial color="#1a0f0a" transparent opacity={0.85} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh ref={hpGhost} position={[0, 0, 0.0005]} renderOrder={999}>
          <planeGeometry args={[0.9, 0.075]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} depthTest={false} />
        </mesh>
        <mesh ref={hpFg} position={[0, 0, 0.001]} renderOrder={1000}>
          <planeGeometry args={[0.9, 0.07]} />
          <meshBasicMaterial color="#57d95e" depthWrite={false} depthTest={false} />
        </mesh>
        {shieldPct > 0 && (
          <mesh position={[(0.9 * shieldPct - 0.9) / 2, 0.09, 0.001]} renderOrder={1001}>
            <planeGeometry args={[0.9 * shieldPct, 0.045]} />
            <meshBasicMaterial color="#4aa8ff" depthWrite={false} depthTest={false} />
          </mesh>
        )}
      </group>
      {u.lifePct != null && (
        <group position={[0, -0.14, 0]}>
          <mesh>
            <planeGeometry args={[0.9, 0.06]} />
            <meshBasicMaterial color="#1a0f0a" transparent opacity={0.85} depthWrite={false} depthTest={false} />
          </mesh>
          <mesh position={[(0.9 * u.lifePct - 0.9) / 2, 0, 0.001]}>
            <planeGeometry args={[0.9 * Math.max(0.001, u.lifePct), 0.04]} />
            <meshBasicMaterial color="#e8a020" depthWrite={false} depthTest={false} />
          </mesh>
        </group>
      )}
    </group>
  );

  if (u.isGoat) {
    const pctG = Math.max(0, u.hp / u.maxHp);
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
        <BlobShadow s={1.4} opacity={0.45} />
        <TeamRing owner={u.owner} r={0.8} />
        <group ref={g}>
          <GoatMesh u={u} />
          {u.cursed && <Wisp />}
          <mesh ref={flashMesh} position={[0, 0.5, 0]} visible={false}>
            <boxGeometry args={[0.7, 0.7, 0.4]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        {pctG < 0.999 && hpBar(0)}
      </group>
    );
  }

  if (u.sub === 'hyena') {
    const pctH = Math.max(0, u.hp / u.maxHp);
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
        <BlobShadow s={1.7} opacity={0.45} />
        <TeamRing owner={u.owner} r={0.9} />
        <group ref={g}>
          <HyenaMesh u={u} />
          {u.cursed && <Wisp />}
          <mesh ref={flashMesh} position={[0, 0.5, 0]} visible={false}>
            <boxGeometry args={[0.8, 0.7, 0.4]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        {pctH < 0.999 && hpBar(0)}
      </group>
    );
  }

  if (isBee) {
    const pct = Math.max(0, u.hp / u.maxHp);
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
        {/* soft ground shadow far below */}
        <BlobShadow s={0.7} opacity={0.3} />
        <TeamRing owner={u.owner} r={0.4} />
        <group ref={g}>
          <BeeMesh u={u} />
          {u.cursed && <Wisp />}
        </group>
        {(pct < 0.999) && hpBar(0)}
      </group>
    );
  }

  if (isOwl) {
    const pct = Math.max(0, u.hp / u.maxHp);
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
        <BlobShadow s={0.9} opacity={0.3} />
        <TeamRing owner={u.owner} r={0.45} />
        <group ref={g}>
          <OwlMesh u={u} />
          {u.cursed && <Wisp />}
        </group>
        {(pct < 0.999) && hpBar(0)}
      </group>
    );
  }

  if (isWitch) {
    const pct = Math.max(0, u.hp / u.maxHp);
    const shieldPct = 0;
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
        <BlobShadow s={1.6} opacity={0.45} />
        <TeamRing owner={u.owner} r={0.72} />
        <group ref={g}>
          <WitchMesh u={u} />
          <mesh ref={flashMesh} position={[0, 1.2, 0]} visible={false}>
            <boxGeometry args={[0.9, 2.2, 0.7]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        {(pct < 0.999 || shieldPct > 0) && hpBar(shieldPct)}
      </group>
    );
  }

  if (isPanga) {
    const pct = Math.max(0, u.hp / u.maxHp);
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
        <BlobShadow s={1.15} opacity={0.45} />
        <TeamRing owner={u.owner} r={0.6} />
        <group ref={g}>
          <PangaMesh u={u} />
          {u.cursed && <Wisp />}
          <mesh ref={flashMesh} position={[0, 0.8, 0]} visible={false}>
            <boxGeometry args={[0.7, 1.4, 0.5]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
        {(pct < 0.999) && hpBar(0)}
      </group>
    );
  }

  if (isTowerBldg) {
    const pct = Math.max(0, u.hp / u.maxHp);
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
        <BlobShadow s={1.8} opacity={0.45} />
        <TeamRing owner={u.owner} r={0.95} />
        <group ref={g}>
          {[[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]].map((p, i) => (
            <mesh key={i} position={[p[0], 0.5, p[1]]} castShadow>
              <cylinderGeometry args={[0.09, 0.11, 1, 5]} />
              <meshStandardMaterial color="#6a4526" roughness={1} />
            </mesh>
          ))}
          <mesh position={[0, 1.15, 0]} castShadow>
            <boxGeometry args={[1.2, 0.18, 1.2]} />
            <meshStandardMaterial color="#8a5a30" roughness={0.95} />
          </mesh>
          <mesh position={[0, 1.7, 0]} castShadow>
            <coneGeometry args={[0.95, 0.7, 4]} />
            <meshStandardMaterial color="#c9a45c" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, 1.32, 0.62]}>
            <boxGeometry args={[0.3, 0.3, 0.04]} />
            <meshStandardMaterial color={TEAM_COLOR[u.owner]} roughness={0.7} />
          </mesh>
        </group>
        <group ref={bar} position={[0, 2.5, 0]}><HpBar pct={pct} /></group>
      </group>
    );
  }

  const pct = Math.max(0, u.hp / u.maxHp);
  const shieldPct = u.maxShield ? Math.max(0, (u.shield ?? 0) / u.maxShield) : 0;
    return (
      <group position={[WX(u.x), 0, WZ(u.z)]}>
      <BlobShadow s={1.15 * big} opacity={0.45} />
      <TeamRing owner={u.owner} r={0.6 * big} />
      <group ref={g}>
        {/* hit flash white 80ms overlay */}
        <mesh ref={flashMesh} position={[0, 0.8, 0]} visible={false}>
          <boxGeometry args={[0.7, 1.4, 0.5]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
        {/* mlonda shield glow */}
        {shieldPct > 0 && (
          <mesh position={[0, 0.8, 0]}>
            <sphereGeometry args={[0.75 * big, 12, 12]} />
            <meshBasicMaterial color="#4aa8ff" transparent opacity={0.22} depthWrite={false} />
          </mesh>
        )}
        {/* cursed wisp */}
        {u.cursed && <Wisp />}
        {/* legs */}
        <Limb pos={[-0.14, 0.32, 0]} swing={u.walkPhase} color="#2c2c34" />
        <Limb pos={[0.14, 0.32, 0]} swing={u.walkPhase + Math.PI} color="#2c2c34" />
        {/* torso with chitenje colour */}
        <mesh position={[0, 0.72 + strikeOffset * 0.2, strikeOffset]} castShadow>
          <boxGeometry args={[0.5, 0.55, 0.32]} />
          <meshStandardMaterial color={cloth} roughness={0.85} />
        </mesh>
        {/* team sash: bright trim so team reads in 1s + rim pop off red earth */}
        <mesh position={[0, 0.74 + strikeOffset * 0.2, 0.17 + strikeOffset]} rotation={[0, 0, 0.5]}>
          <boxGeometry args={[0.16, 0.6, 0.03]} />
          <meshStandardMaterial color={TEAM_COLOR[u.owner]} roughness={0.55} emissive={TEAM_COLOR[u.owner]} emissiveIntensity={0.5} />
        </mesh>
        {/* arms */}
        <Limb pos={[-0.33, 0.72, strikeOffset]} swing={u.swing >= 0 ? 2.4 : u.walkPhase + Math.PI} color={skin} len={0.45} />
        <Limb pos={[0.33, 0.72, strikeOffset]} swing={u.swing >= 0 ? -2.4 : u.walkPhase} color={skin} len={0.45} />
        {/* big head */}
        <mesh position={[0, 1.22 + strikeOffset * 0.15, strikeOffset]} castShadow>
          <sphereGeometry args={[0.27, 12, 12]} />
          <meshStandardMaterial color={skin} roughness={0.75} />
        </mesh>
        {hair === 'fade' ? (
          <mesh position={[0, 1.42, -0.02]}>
            <sphereGeometry args={[0.2, 8, 8, 0, Math.PI * 2, 0, 1.1]} />
            <meshStandardMaterial color="#141414" roughness={1} />
          </mesh>
        ) : hair === 'braids' ? (
          <mesh position={[0, 1.4, -0.06]}>
            <boxGeometry args={[0.4, 0.14, 0.34]} />
            <meshStandardMaterial color="#141414" roughness={1} />
          </mesh>
        ) : (
          <mesh position={[0, 1.44, -0.03]} scale={[1, 0.55, 1]}>
            <sphereGeometry args={[0.24, 8, 8]} />
            <meshStandardMaterial color={hair} roughness={1} />
          </mesh>
        )}
        {cap !== 'none' && (
          <mesh position={[0, 1.52, 0.02]}>
            <cylinderGeometry args={[0.2, 0.22, 0.1, 8]} />
            <meshStandardMaterial color={cap} roughness={0.8} />
          </mesh>
        )}
        {u.card === 'mlonda' && (
          <mesh position={[0, 0.7, 0.45 + strikeOffset]} castShadow>
            <boxGeometry args={[0.72, 0.95, 0.1]} />
            <meshStandardMaterial color="#7a5c3a" roughness={0.8} emissive={u.wet ? '#2f7fe0' : '#000000'} emissiveIntensity={u.wet ? 0.2 : 0} />
          </mesh>
        )}
        {u.card === 'mlonda' && (
          <mesh position={[0, 0.35, 0.45]} rotation={[0, 0, 0]}>
            <boxGeometry args={[0.5, 0.12, 0.02]} />
            <meshStandardMaterial color={TEAM_COLOR[u.owner]} roughness={0.6} />
          </mesh>
        )}
        {u.sub === 'herder' && (
          <mesh position={[0.42, 0.75, 0.1]} rotation={[0, 0, -0.2]}>
            <cylinderGeometry args={[0.035, 0.035, 1.3, 5]} />
            <meshStandardMaterial color="#6a4526" roughness={1} />
          </mesh>
        )}
      </group>
      {(pct < 0.999 || shieldPct > 0) && hpBar(shieldPct)}
    </group>
  );
}

/** Faint purple wisp orbiting a cursed unit. */
function Wisp() {
  const m = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    if (!m.current) return;
    const t = clock.elapsedTime * 3;
    m.current.position.set(Math.cos(t) * 0.45, 1.1 + Math.sin(t * 1.7) * 0.25, Math.sin(t) * 0.45);
  });
  return (
    <mesh ref={m}>
      <sphereGeometry args={[0.09, 6, 6]} />
      <meshBasicMaterial color="#b45aff" transparent opacity={0.75} depthWrite={false} />
    </mesh>
  );
}
