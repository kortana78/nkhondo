import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { WX, WZ } from './world';

// MSIKA arena: Limbe market at noon. Dusty square, concrete canal with 2
// footbridges (same gameplay geometry as Mudzi), stalls with chitenje
// umbrellas, tomato/mandasi baskets, painted signs (fictional names),
// parked bicycles, minibuses passing on the east road, shoppers.

const SQUARE = '#c9a06a';
const SQUARE_D = '#b08a58';
const TARMAC = '#4a4a52';
const CANAL = '#5a8a9a';

function signTexture(text: string, bg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#fdf6e3'; g.lineWidth = 6; g.strokeRect(8, 8, 240, 80);
  g.fillStyle = '#fdf6e3'; g.font = 'bold 32px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const CHITENJE = ['#d84f6d', '#e8a020', '#2fa8a0', '#8a4fb5', '#c22f2f', '#3f6fb5'];

function Stall({ x, z, ci, ry = 0 }: { x: number; z: number; ci: number; ry?: number }) {
  const col = CHITENJE[ci % CHITENJE.length];
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      {/* table */}
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.2, 0.12, 1.3]} />
        <meshStandardMaterial color="#7a5a34" roughness={0.95} />
      </mesh>
      {[[-1, -0.55], [1, -0.55], [-1, 0.55], [1, 0.55]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.35, p[1]]}>
          <boxGeometry args={[0.1, 0.7, 0.1]} />
          <meshStandardMaterial color="#5a3a22" roughness={1} />
        </mesh>
      ))}
      {/* umbrella pole + canopy */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 1.9, 6]} />
        <meshStandardMaterial color="#4e3018" roughness={1} />
      </mesh>
      <mesh position={[0, 2.6, 0]} castShadow>
        <coneGeometry args={[1.9, 0.75, 8]} />
        <meshStandardMaterial color={col} roughness={0.85} flatShading side={THREE.DoubleSide} />
      </mesh>
      {/* tomato basket */}
      <group position={[-0.6, 0.81, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.28, 0.22, 0.18, 9]} />
          <meshStandardMaterial color="#8a5a30" roughness={1} />
        </mesh>
        {[[-0.1, 0.12, 0], [0.1, 0.12, 0.05], [0, 0.12, -0.1], [0.02, 0.22, 0]].map((p, i) => (
          <mesh key={i} position={[p[0], p[1], p[2]]}>
            <sphereGeometry args={[0.09, 7, 7]} />
            <meshStandardMaterial color="#d83a2e" roughness={0.55} />
          </mesh>
        ))}
      </group>
      {/* mandasi pile */}
      <group position={[0.35, 0.81, 0.1]}>
        {[[-0.12, 0.07, 0], [0.12, 0.07, 0.05], [0, 0.07, -0.12], [0, 0.2, 0]].map((p, i) => (
          <mesh key={i} position={[p[0], p[1], p[2]]} castShadow>
            <sphereGeometry args={[0.11, 7, 7]} />
            <meshStandardMaterial color="#e0b46a" roughness={0.8} />
          </mesh>
        ))}
      </group>
      {/* chitenje rolls */}
      {[0.75].map((px, i) => (
        <mesh key={i} position={[px, 0.95, -0.3]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.11, 0.11, 0.9, 8]} />
          <meshStandardMaterial color={CHITENJE[(ci + 2) % CHITENJE.length]} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

function PaintedSign({ x, z, text, bg, ry = 0 }: { x: number; z: number; text: string; bg: string; ry?: number }) {
  const tex = useMemo(() => signTexture(text, bg), [text, bg]);
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      {[[-0.9], [0.9]].map((p, i) => (
        <mesh key={i} position={[p[0], 1, 0]}>
          <cylinderGeometry args={[0.06, 0.06, 2, 6]} />
          <meshStandardMaterial color="#5a3a22" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 1.9, 0]} castShadow>
        <boxGeometry args={[2.3, 0.9, 0.08]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
    </group>
  );
}

function ParkedBike({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]}>
      {[-0.5, 0.5].map((dz, i) => (
        <mesh key={i} position={[0, 0.35, dz]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.34, 0.045, 6, 12]} />
          <meshStandardMaterial color="#222" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.06, 0.06, 1.0]} />
        <meshStandardMaterial color="#2f7fe0" roughness={0.5} />
      </mesh>
    </group>
  );
}

function Minibus({ x, dir, off, body }: { x: number; dir: 1 | -1; off: number; body: string }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const span = 46;
    const z = (((clock.elapsedTime * 3.2 * dir + off) % span) + span) % span - 23;
    g.current.position.set(x, 0, dir === 1 ? z : -z);
  });
  return (
    <group ref={g}>
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[1.7, 1.5, 4.2]} />
        <meshStandardMaterial color={body} roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <boxGeometry args={[1.74, 0.5, 3.6]} />
        <meshStandardMaterial color="#20303c" roughness={0.25} metalness={0.4} />
      </mesh>
      <mesh position={[0, 0.35, 1.2]}>
        <boxGeometry args={[1.72, 0.3, 0.1]} />
        <meshStandardMaterial color="#e8a020" roughness={0.6} />
      </mesh>
      {[[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]].map((p, i) => (
        <mesh key={i} position={[p[0], 0.35, p[1]]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.35, 0.35, 0.2, 10]} />
          <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function Shopper({ x, z, seed }: { x: number; z: number; seed: number }) {
  const g = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (g.current) g.current.position.y = Math.abs(Math.sin(clock.elapsedTime * 2 + seed)) * 0.03;
  });
  const skin = ['#6b4226', '#8d5a33', '#5a341e'][seed % 3];
  const cloth = CHITENJE[seed % CHITENJE.length];
  return (
    <group ref={g} position={[x, 0, z]} rotation={[0, seed * 1.3, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.8, 7]} />
        <meshStandardMaterial color={cloth} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.12, 0]}>
        <sphereGeometry args={[0.2, 9, 9]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>
      <mesh position={[0.3, 0.5, 0.1]}>
        <boxGeometry args={[0.28, 0.24, 0.28]} />
        <meshStandardMaterial color="#a8763e" roughness={1} />
      </mesh>
    </group>
  );
}

export function ArenaMsika() {
  return (
    <group>
      {/* noon sun disc, high */}
      <mesh position={[6, 26, -30]}>
        <sphereGeometry args={[1.8, 12, 12]} />
        <meshBasicMaterial color="#fff6dc" fog={false} />
      </mesh>
      {/* hazy skyline blocks far north */}
      {[[-16, -30, 6, 5], [-6, -32, 8, 7], [5, -31, 6, 4], [15, -30, 7, 6]].map((b, i) => (
        <mesh key={i} position={[b[0] as number, (b[3] as number) / 2, b[1] as number]}>
          <boxGeometry args={[b[2] as number, b[3] as number, 5]} />
          <meshStandardMaterial color={['#c9b8a0', '#d8c8b0', '#bfae96'][i % 3]} roughness={1} />
        </mesh>
      ))}

      {/* dusty market square */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[26, 40]} />
        <meshStandardMaterial color={SQUARE} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 0]}>
        <planeGeometry args={[18.6, 32]} />
        <meshStandardMaterial color={SQUARE_D} roughness={1} />
      </mesh>
      {/* lane paths */}
      {[WX(4.1), WX(13.9)].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, 0]}>
          <planeGeometry args={[2.2, 32]} />
          <meshStandardMaterial color="#d8b078" roughness={1} />
        </mesh>
      ))}
      {/* centre motif */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[1.5, 1.75, 32]} />
        <meshStandardMaterial color="#7a1f1f" roughness={1} />
      </mesh>
      {/* arena border */}
      {[
        { x: 0, z: -16, w: 18.6, d: 0.35 }, { x: 0, z: 16, w: 18.6, d: 0.35 },
        { x: -9.15, z: 0, w: 0.35, d: 32 }, { x: 9.15, z: 0, w: 0.35, d: 32 },
      ].map((b, i) => (
        <mesh key={i} position={[b.x, 0.03, b.z]}>
          <boxGeometry args={[b.w, 0.07, b.d]} />
          <meshStandardMaterial color="#fdf6e3" roughness={0.9} />
        </mesh>
      ))}

      {/* concrete canal + footbridges (same gameplay geometry) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, WZ(16)]}>
        <planeGeometry args={[18.6, 2]} />
        <meshStandardMaterial color={CANAL} roughness={0.4} />
      </mesh>
      {[4.1, 13.9].map((bx) => (
        <group key={bx} position={[WX(bx), 0, WZ(16)]}>
          <mesh position={[0, 0.08, 0]} receiveShadow castShadow>
            <boxGeometry args={[2.6, 0.14, 2.7]} />
            <meshStandardMaterial color="#9a9aa2" roughness={0.9} />
          </mesh>
          {[-1.1, 1.1].map((px) => (
            <mesh key={px} position={[px, 0.55, 0]}>
              <boxGeometry args={[0.09, 0.9, 2.5]} />
              <meshStandardMaterial color="#2f7fe0" roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}

      {/* east tarmac road + minibuses */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12.6, -0.005, 0]}>
        <planeGeometry args={[4.2, 42]} />
        <meshStandardMaterial color={TARMAC} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[12.6, 0.0, 0]}>
        <planeGeometry args={[0.25, 42]} />
        <meshBasicMaterial color="#f2e3c2" />
      </mesh>
      <Minibus x={11.6} dir={1} off={0} body="#f2f2f2" />
      <Minibus x={13.7} dir={-1} off={20} body="#e8a020" />

      {/* stalls */}
      <Stall x={-12.2} z={8} ci={0} ry={0.4} />
      <Stall x={-12.4} z={-2} ci={1} ry={-0.3} />
      <Stall x={-12} z={-11} ci={2} ry={0.2} />
      <Stall x={7.5} z={-18.6} ci={3} ry={0} />
      <Stall x={-7.5} z={18.6} ci={4} ry={Math.PI} />
      <Stall x={-12.3} z={14} ci={5} ry={0.5} />

      {/* painted signs (fictional) */}
      <PaintedSign x={-11.5} z={-6.5} text="MAYA CHIPS" bg="#7a1f1f" ry={0.3} />
      <PaintedSign x={8} z={18.8} text="ZOVALA MODA" bg="#2f7fe0" ry={Math.PI - 0.2} />
      <PaintedSign x={-8} z={-18.8} text="NKHANI BOOKS" bg="#2f7a3e" ry={0.15} />

      {/* parked bicycles */}
      <ParkedBike x={-10.6} z={3.5} ry={0.4} />
      <ParkedBike x={-10.2} z={4.6} ry={-0.2} />
      <ParkedBike x={10.4} z={-4} ry={2.8} />

      {/* poles + wire */}
      {[[-10.8, -14], [-10.8, 0], [-10.8, 14]].map((p, i) => (
        <mesh key={i} position={[p[0], 3, p[1]]} castShadow>
          <cylinderGeometry args={[0.09, 0.11, 6, 6]} />
          <meshStandardMaterial color="#4e3018" roughness={1} />
        </mesh>
      ))}
      {[-7, 7].map((z, i) => (
        <mesh key={i} position={[-10.8, 5.8, z]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 14, 4]} />
          <meshStandardMaterial color="#222" roughness={1} />
        </mesh>
      ))}

      {/* shoppers + chickens */}
      <Shopper x={-6} z={12} seed={1} />
      <Shopper x={5.5} z={-9} seed={2} />
      <Shopper x={-4} z={-13} seed={3} />
      <Shopper x={6.8} z={10.5} seed={4} />
      <Shopper x={0.5} z={14.5} seed={5} />

      <mesh visible={false}><boxGeometry args={[0.01, 0.01, 0.01]} /><meshBasicMaterial /></mesh>
    </group>
  );
}

export const __MSIKA_UNUSED = SQUARE;
