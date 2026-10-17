import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { WX, WZ } from './world';

// MUDZI arena, polish pass: textured laterite ground, edged arena (fences,
// walls, maize, rocks, bushes), shader stream with banks + reeds,
// plank-and-log bridges, layered hills + mountain silhouette, one tree style,
// ambient edge life. All procedural & original.

const LATERITE = '#9c4a2b';
const GRASS = '#5d8f3e';
const GRASS_D = '#4a7430';
const PATH = '#c98d54';
const SAND = '#d8b078';

function seededRand(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Laterite ground texture: splotches, cracks, worn lane strips. */
function groundTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 768;
  const g = c.getContext('2d')!;
  g.fillStyle = LATERITE; g.fillRect(0, 0, 512, 768);
  const rnd = seededRand(7);
  for (let i = 0; i < 1400; i++) {
    const r = 1 + rnd() * 5;
    g.fillStyle = rnd() < 0.5 ? `rgba(60,26,12,${0.05 + rnd() * 0.1})` : `rgba(230,160,110,${0.04 + rnd() * 0.08})`;
    g.beginPath(); g.arc(rnd() * 512, rnd() * 768, r, 0, Math.PI * 2); g.fill();
  }
  // cracks
  g.strokeStyle = 'rgba(46,20,10,0.55)'; g.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    let x = rnd() * 512, y = rnd() * 768;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  // worn lane strips (lanes at world x -4.9 / +4.9 of a 26-wide plane)
  for (const u of [0.312, 0.688]) {
    const x = u * 512;
    g.fillStyle = 'rgba(215,150,95,0.5)';
    g.fillRect(x - 26, 0, 52, 768);
    g.fillStyle = 'rgba(120,70,35,0.35)';
    g.fillRect(x - 32, 0, 6, 768); g.fillRect(x + 26, 0, 6, 768);
  }
  // pebble dots
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(210,190,170,${0.25 + rnd() * 0.3})`;
    g.beginPath(); g.arc(rnd() * 512, rnd() * 768, 1 + rnd() * 2, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function Hut({ x, z, s = 1, ry = 0 }: { x: number; z: number; s?: number; ry?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0]} scale={s}>
      <mesh position={[0, 0.7, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.25, 1.35, 1.4, 8]} />
        <meshStandardMaterial color="#b06038" roughness={0.95} />
      </mesh>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[1.28, 1.28, 0.18, 8]} />
        <meshStandardMaterial color="#7e3a22" roughness={1} />
      </mesh>
      <mesh position={[0, 2.15, 0]} castShadow>
        <coneGeometry args={[1.9, 1.5, 8]} />
        <meshStandardMaterial color="#c9a45c" roughness={1} />
      </mesh>
      <mesh position={[0, 2.95, 0]}>
        <coneGeometry args={[0.28, 0.35, 6]} />
        <meshStandardMaterial color="#8a6a35" roughness={1} />
      </mesh>
      <mesh position={[0, 0.55, 1.3]}>
        <boxGeometry args={[0.55, 1.0, 0.08]} />
        <meshStandardMaterial color="#4a2c14" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** One consistent tree style: mango (trunk + 3 canopy blobs + fruit). */
export function MangoTree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.32, 2.2, 6]} />
        <meshStandardMaterial color="#5a3a22" roughness={1} />
      </mesh>
      {[[0, 2.6, 0, 1.7], [0.9, 2.1, 0.4, 1.2], [-0.9, 2.2, -0.3, 1.25]].map((p, i) => (
        <mesh key={i} position={[p[0], p[1], p[2]]} castShadow>
          <icosahedronGeometry args={[p[3], 1]} />
          <meshStandardMaterial color={i === 0 ? '#3f7a2e' : '#4d8a36'} roughness={1} flatShading />
        </mesh>
      ))}
      {[[0.5, 2.0, 0.9], [-0.4, 2.3, 0.7], [0.1, 1.9, -0.9]].map((p, i) => (
        <mesh key={'m' + i} position={[p[0], p[1], p[2]]}>
          <sphereGeometry args={[0.14, 6, 6]} />
          <meshStandardMaterial color="#e8a020" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

export function MaizeRow({ x, z, n = 6 }: { x: number; z: number; n?: number }) {
  const stalks = useMemo(() => Array.from({ length: n }, (_, i) => ({ dx: (Math.sin(i * 12.9) * 0.15), h: 0.9 + (i % 3) * 0.12 })), [n]);
  return (
    <group position={[x, 0, z]}>
      {stalks.map((s, i) => (
        <group key={i} position={[(i - n / 2) * 0.55 + s.dx, 0, 0]}>
          <mesh position={[0, s.h / 2, 0]}>
            <cylinderGeometry args={[0.03, 0.04, s.h, 5]} />
            <meshStandardMaterial color="#4d7a2e" roughness={1} />
          </mesh>
          <mesh position={[0.12, s.h * 0.8, 0]} rotation={[0, 0, -0.5]}>
            <coneGeometry args={[0.16, 0.7, 5]} />
            <meshStandardMaterial color="#63a047" roughness={1} flatShading />
          </mesh>
          <mesh position={[-0.12, s.h * 0.7, 0]} rotation={[0, 0, 0.5]}>
            <coneGeometry args={[0.16, 0.7, 5]} />
            <meshStandardMaterial color="#558c3a" roughness={1} flatShading />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function Chicken({ x, z, seed }: { x: number; z: number; seed: number }) {
  const g = useRef<THREE.Group>(null!);
  const off = useMemo(() => (seed * 1.37) % 6.28, [seed]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + off;
    if (!g.current) return;
    g.current.position.y = Math.abs(Math.sin(t * 6)) * 0.03;
    g.current.rotation.y = Math.sin(t * 0.4) * 1.2 + seed;
    const head = g.current.children[1] as THREE.Mesh | undefined;
    if (head) head.position.y = 0.32 + Math.max(0, Math.sin(t * 3)) * -0.1;
  });
  return (
    <group ref={g} position={[x, 0, z]}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <sphereGeometry args={[0.14, 8, 8]} />
        <meshStandardMaterial color="#f2ede2" roughness={0.9} />
      </mesh>
      <mesh position={[0.1, 0.32, 0]}>
        <sphereGeometry args={[0.08, 8, 8]} />
        <meshStandardMaterial color="#f2ede2" roughness={0.9} />
      </mesh>
      <mesh position={[0.16, 0.32, 0]} rotation={[0, 0, -0.6]}>
        <coneGeometry args={[0.035, 0.09, 5]} />
        <meshStandardMaterial color="#e07b2a" roughness={0.8} />
      </mesh>
    </group>
  );
}

export function GrazingGoat({ x, z, seed }: { x: number; z: number; seed: number }) {
  const g = useRef<THREE.Group>(null!);
  const off = useMemo(() => (seed * 2.11) % 6.28, [seed]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.7 + off;
    if (g.current) g.current.rotation.y = seed + Math.sin(t * 0.3) * 0.6;
  });
  return (
    <group ref={g} position={[x, 0, z]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.55, 0.35, 0.28]} />
        <meshStandardMaterial color="#e8e2d4" roughness={1} />
      </mesh>
      <mesh position={[0.32, 0.5, 0]}>
        <boxGeometry args={[0.2, 0.22, 0.2]} />
        <meshStandardMaterial color="#e8e2d4" roughness={1} />
      </mesh>
      {[0.24, 0.38].map((hx, i) => (
        <mesh key={i} position={[hx, 0.66, 0]} rotation={[0, 0, -0.4 + i * 0.8]}>
          <coneGeometry args={[0.035, 0.18, 5]} />
          <meshStandardMaterial color="#8a7a5c" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function Smoke({ x, z, h = 4 }: { x: number; z: number; h?: number }) {
  const m = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    const t = (clock.elapsedTime * 0.25) % 1;
    if (!m.current) return;
    m.current.position.y = t * h + 1;
    const s = 0.5 + t * 1.4;
    m.current.scale.set(s, s, s);
    (m.current.material as THREE.MeshBasicMaterial).opacity = 0.28 * (1 - t);
  });
  return (
    <mesh ref={m} position={[x, 1, z]}>
      <sphereGeometry args={[0.5, 8, 8]} />
      <meshBasicMaterial color="#dddddd" transparent opacity={0.2} depthWrite={false} />
    </mesh>
  );
}

/** Cheap villager: chitenje dress, head, basket; gentle sway. */
export function Villager({ x, z, seed }: { x: number; z: number; seed: number }) {
  const g = useRef<THREE.Group>(null!);
  const skin = ['#6b4226', '#8d5a33', '#5a341e'][seed % 3];
  const cloth = ['#d84f6d', '#e8c832', '#2fa8a0'][seed % 3];
  useFrame(({ clock }) => {
    if (g.current) g.current.rotation.z = Math.sin(clock.elapsedTime * 1.4 + seed) * 0.04;
  });
  return (
    <group ref={g} position={[x, 0, z]} rotation={[0, seed * 2.1, 0]}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.3, 0.85, 7]} />
        <meshStandardMaterial color={cloth} roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.1, 0]}>
        <sphereGeometry args={[0.19, 9, 9]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>
      {seed % 2 === 0 && (
        <mesh position={[0, 1.34, 0]}>
          <cylinderGeometry args={[0.24, 0.18, 0.14, 8]} />
          <meshStandardMaterial color="#a8763e" roughness={1} />
        </mesh>
      )}
    </group>
  );
}

function BicycleLean({ x, z, ry = 0 }: { x: number; z: number; ry?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, ry, 0.22]}>
      {[-0.5, 0.5].map((dz, i) => (
        <mesh key={i} position={[0, 0.35, dz]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[0.34, 0.045, 6, 12]} />
          <meshStandardMaterial color="#1c1c1c" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.55, 0]} rotation={[0, 0, 0.15]}>
        <boxGeometry args={[0.06, 0.06, 1.0]} />
        <meshStandardMaterial color="#c22f2f" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.85, 0.42]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[0.34, 0.05, 0.08]} />
        <meshStandardMaterial color="#5a3a22" roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Animated stream water: scrolling normals + foam at the banks. */
function StreamWater() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 } },
    transparent: true,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float t;
      void main(){
        float w1 = sin((vUv.x*24.0 + t*1.6) + sin(vUv.y*10.0 + t)*0.8)*0.5+0.5;
        float w2 = sin((vUv.x*47.0 - t*2.2) + vUv.y*22.0)*0.5+0.5;
        vec3 deep = vec3(0.14,0.38,0.52);
        vec3 shal = vec3(0.36,0.66,0.78);
        vec3 col = mix(deep, shal, w1*0.45 + w2*0.2);
        float glint = smoothstep(0.93, 1.0, sin(vUv.x*90.0 + t*3.0)*sin(vUv.y*40.0 - t*2.0));
        col += glint*0.7;
        // foam at both banks: scrolling white edge
        float edge = smoothstep(0.06, 0.0, vUv.y) + smoothstep(0.94, 1.0, vUv.y);
        float foam = edge * (0.5 + 0.5 * sin(vUv.x*60.0 + t*2.5));
        col = mix(col, vec3(0.92,0.96,0.97), clamp(foam, 0.0, 0.85));
        gl_FragColor = vec4(col, 0.93);
      }`,
  }), []);
  const foamA = useRef<THREE.Mesh>(null!);
  const foamB = useRef<THREE.Mesh>(null!);
  useFrame(({ clock }) => {
    mat.uniforms.t.value = clock.elapsedTime;
    const o = 0.35 + Math.sin(clock.elapsedTime * 2.5) * 0.12;
    for (const m of [foamA.current, foamB.current]) {
      if (m) (m.material as THREE.MeshBasicMaterial).opacity = o;
    }
  });
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, WZ(16)]}>
        <planeGeometry args={[18.6, 2.2]} />
        <primitive object={mat} attach="material" />
      </mesh>
      {/* foam lines hugging both banks */}
      <mesh ref={foamA} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, WZ(16) - 1.02]}>
        <planeGeometry args={[18.6, 0.16]} />
        <meshBasicMaterial color="#eef6fa" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={foamB} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, WZ(16) + 1.02]}>
        <planeGeometry args={[18.6, 0.16]} />
        <meshBasicMaterial color="#eef6fa" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Distant baobab silhouette ring (background depth behind the hills). */
export function DistantBaobabs() {
  const trees: { x: number; z: number; s: number }[] = [
    { x: -34, z: -44, s: 2.6 }, { x: -18, z: -48, s: 3.1 }, { x: 0, z: -50, s: 3.4 },
    { x: 18, z: -47, s: 2.9 }, { x: 34, z: -43, s: 2.5 },
  ];
  return (
    <group>
      {trees.map((t, i) => (
        <group key={i} position={[t.x, 0, t.z]} scale={t.s}>
          <mesh position={[0, 1.6, 0]}>
            <cylinderGeometry args={[0.5, 0.7, 3.2, 7]} />
            <meshStandardMaterial color="#7a5a40" roughness={1} flatShading />
          </mesh>
          <mesh position={[0, 3.6, 0]}>
            <sphereGeometry args={[1.3, 7, 6]} />
            <meshStandardMaterial color="#4d7a36" roughness={1} flatShading transparent opacity={0.92} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Reeds() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const spots = useMemo(() => {
    const rnd = seededRand(31);
    const out: { x: number; z: number; s: number }[] = [];
    for (let i = 0; i < 64; i++) {
      const x = -9 + rnd() * 18;
      if (Math.abs(x + 4.9) < 1.9 || Math.abs(x - 4.9) < 1.9) continue; // keep bridges clear
      out.push({ x, z: WZ(16) + (rnd() < 0.5 ? -1 : 1) * (1.25 + rnd() * 0.35), s: 0.7 + rnd() * 0.7 });
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach((p, i) => {
      e.set((i % 5 - 2) * 0.06, 0, (i % 7 - 3) * 0.06); q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, 0.35 * p.s, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length] as unknown as [undefined, undefined, number]}>
      <coneGeometry args={[0.045, 0.85, 5]} />
      <meshStandardMaterial color="#3f7a2e" roughness={1} />
    </instancedMesh>
  );
}

function GrassTufts() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const spots = useMemo(() => {
    const rnd = seededRand(77);
    const out: { x: number; z: number; s: number; r: number }[] = [];
    for (let i = 0; i < 150; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      out.push({ x: side * (9.9 + rnd() * 3.0), z: -19 + rnd() * 38, s: 0.7 + rnd() * 0.8, r: rnd() * 6.28 });
    }
    return out;
  }, []);
  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    spots.forEach((p, i) => {
      e.set(0, p.r, 0); q.setFromEuler(e);
      m.compose(new THREE.Vector3(p.x, 0.14, p.z), q, new THREE.Vector3(p.s, p.s, p.s));
      ref.current.setMatrixAt(i, m);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  }, [spots]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, spots.length] as unknown as [undefined, undefined, number]}>
      <coneGeometry args={[0.1, 0.42, 4]} />
      <meshStandardMaterial color="#548c39" roughness={1} flatShading />
    </instancedMesh>
  );
}

export function ArenaMudzi() {
  const ground = useMemo(() => groundTexture(), []);
  const clouds = useMemo(() => [
    { x: -14, y: 16, z: -20, s: 2.2 }, { x: 6, y: 19, z: -26, s: 3 },
    { x: 16, y: 15, z: 6, s: 1.8 }, { x: -4, y: 21, z: -30, s: 2.6 },
  ], []);
  const cloudRefs = useRef<(THREE.Group | null)[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 0.08;
    cloudRefs.current.forEach((c, i) => {
      if (!c) return;
      c.position.x = clouds[i].x + Math.sin(t + i * 2) * 2;
    });
  });
  return (
    <group>
      {/* sun disc */}
      <mesh position={[-18, 20, -30]}>
        <sphereGeometry args={[2.4, 12, 12]} />
        <meshBasicMaterial color="#ffdf9e" fog={false} />
      </mesh>
      {clouds.map((c, i) => (
        <group key={i} ref={(el) => { cloudRefs.current[i] = el; }} position={[c.x, c.y, c.z]} scale={c.s}>
          <mesh><sphereGeometry args={[1.4, 8, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.85} fog={false} /></mesh>
          <mesh position={[1.4, -0.2, 0]}><sphereGeometry args={[1, 8, 8]} /><meshBasicMaterial color="#ffffff" transparent opacity={0.85} fog={false} /></mesh>
          <mesh position={[-1.4, -0.25, 0]}><sphereGeometry args={[0.9, 8, 8]} /><meshBasicMaterial color="#fdf3e3" transparent opacity={0.85} fog={false} /></mesh>
        </group>
      ))}
      {/* far mountain silhouette (aerial perspective via fog) */}
      <mesh position={[2, 0, -58]}>
        <coneGeometry args={[30, 17, 7]} />
        <meshStandardMaterial color="#8fa3b8" roughness={1} flatShading />
      </mesh>
      <mesh position={[-30, 0, -52]}>
        <coneGeometry args={[18, 11, 6]} />
        <meshStandardMaterial color="#9db0c2" roughness={1} flatShading />
      </mesh>
      <DistantBaobabs />
      {/* near hills layer */}
      {[[-26, -34, 14, '#7a9a6a'], [-8, -38, 18, '#6a8a5e'], [12, -36, 15, '#7a9a6a'], [28, -30, 12, '#8aa578']].map((h, i) => (
        <mesh key={i} position={[h[0] as number, 0, h[1] as number]}>
          <coneGeometry args={[h[2] as number, 9, 7]} />
          <meshStandardMaterial color={h[3] as string} roughness={1} flatShading />
        </mesh>
      ))}

      {/* textured laterite ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[26, 40]} />
        <meshStandardMaterial map={ground} roughness={1} />
      </mesh>
      {/* grass verges */}
      {[[-11.5, 0], [11.5, 0]].map((p, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[p[0], 0, 0]} receiveShadow>
          <planeGeometry args={[7, 40]} />
          <meshStandardMaterial color={GRASS} roughness={1} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 18.5]} receiveShadow>
        <planeGeometry args={[26, 3]} />
        <meshStandardMaterial color={GRASS_D} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, -18.5]} receiveShadow>
        <planeGeometry args={[26, 3]} />
        <meshStandardMaterial color={GRASS_D} roughness={1} />
      </mesh>
      {/* worn lane paths */}
      {[WX(4.1), WX(13.9)].map((x, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, 0]}>
          <planeGeometry args={[2.2, 32]} />
          <meshStandardMaterial color={PATH} roughness={1} />
        </mesh>
      ))}
      {/* centre motif */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, 0]}>
        <ringGeometry args={[1.5, 1.75, 32]} />
        <meshStandardMaterial color="#f2e3c2" roughness={1} />
      </mesh>

      {/* stream banks + water + reeds */}
      {[WZ(16) - 1.35, WZ(16) + 1.35].map((z, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, z]} receiveShadow>
          <planeGeometry args={[18.6, 0.7]} />
          <meshStandardMaterial color={SAND} roughness={1} />
        </mesh>
      ))}
      <StreamWater />
      <Reeds />

      {/* plank-and-log bridges with rails */}
      {[4.1, 13.9].map((bx) => (
        <group key={bx} position={[WX(bx), 0, WZ(16)]}>
          {Array.from({ length: 7 }, (_, i) => (
            <mesh key={i} position={[-1.05 + i * 0.35, 0.1, 0]} receiveShadow castShadow>
              <boxGeometry args={[0.3, 0.1, 2.7]} />
              <meshStandardMaterial color={i % 2 ? '#8a5a30' : '#7a4e28'} roughness={0.95} />
            </mesh>
          ))}
          {[-1.35, 1.35].map((px) => (
            <group key={px}>
              <mesh position={[px, 0.35, 0]} rotation={[Math.PI / 2, 0, 0]}>
                <cylinderGeometry args={[0.09, 0.09, 2.9, 6]} />
                <meshStandardMaterial color="#5a3a22" roughness={1} />
              </mesh>
              {[-1.2, 1.2].map((pz, j) => (
                <mesh key={j} position={[px, 0.45, pz]} castShadow>
                  <cylinderGeometry args={[0.07, 0.08, 0.85, 5]} />
                  <meshStandardMaterial color="#5a3a22" roughness={1} />
                </mesh>
              ))}
            </group>
          ))}
        </group>
      ))}

      {/* arena edging: west fence, east stone wall, maize, rocks, bushes */}
      {Array.from({ length: 27 }, (_, i) => (
        <mesh key={'fp' + i} position={[-10.3, 0.5, -16 + i * 1.23]} castShadow>
          <cylinderGeometry args={[0.07, 0.09, 1.0, 5]} />
          <meshStandardMaterial color="#5a3a22" roughness={1} />
        </mesh>
      ))}
      {[0.35, 0.75].map((y, i) => (
        <mesh key={'fr' + i} position={[-10.3, y, 0]}>
          <boxGeometry args={[0.08, 0.08, 32.5]} />
          <meshStandardMaterial color="#6a4526" roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        i % 3 === 1 ? null : (
          <mesh key={'sw' + i} position={[10.3, 0.32, -14 + i * 3.4]} rotation={[0, (i % 2) * 0.06, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.6, 0.64, 3.0]} />
            <meshStandardMaterial color="#9a9a9e" roughness={1} flatShading />
          </mesh>
        )
      ))}
      {[[-11.6, 14.5], [11.6, -14.5], [11.6, 15], [-11.6, -14.5]].map((p, i) => (
        <MaizeRow key={'m' + i} x={p[0]} z={p[1]} n={6} />
      ))}
      {[[-10.6, -8, 0.5], [10.7, 4, 0.65], [-10.9, 12, 0.4], [10.6, -11, 0.55], [-10.4, 2, 0.35]].map((p, i) => (
        <mesh key={'rk' + i} position={[p[0], 0.14, p[1]]} rotation={[i, i * 2, 0]} castShadow>
          <dodecahedronGeometry args={[p[2], 0]} />
          <meshStandardMaterial color="#8e8e92" roughness={1} flatShading />
        </mesh>
      ))}
      {[[-10.7, -4, 0.8], [10.8, 11, 0.9], [-10.5, 10, 0.7], [10.6, -4, 0.75], [-10.8, -11, 0.85], [10.9, 0, 0.7]].map((p, i) => (
        <mesh key={'bu' + i} position={[p[0], 0.3, p[1]]} scale={[1, 0.7, 1]} castShadow>
          <icosahedronGeometry args={[p[2], 1]} />
          <meshStandardMaterial color={i % 2 ? '#3f7a2e' : '#4d8a36'} roughness={1} flatShading />
        </mesh>
      ))}
      <GrassTufts />

      {/* dressing outside the lines */}
      <Hut x={-12.5} z={8} s={1.1} ry={0.5} />
      <Hut x={12.8} z={11} s={0.95} ry={-0.4} />
      <Hut x={-13} z={-9} s={1} ry={0.2} />
      <Hut x={13.2} z={-7} s={1.15} ry={-0.7} />
      <MangoTree x={-11.5} z={-2} s={1.1} />
      <MangoTree x={11.8} z={1} s={1.25} />
      <MangoTree x={-12} z={-15} s={0.9} />
      <MangoTree x={12.4} z={-14} s={1.0} />
      <MangoTree x={-12.2} z={15.5} s={1.05} />

      <Smoke x={-12.5} z={8} />
      <Smoke x={13.2} z={-7} />
      <BicycleLean x={-11.2} z={5.4} ry={0.5} />
      <Villager x={-10.6} z={-5.5} seed={1} />
      <Villager x={11} z={6.5} seed={2} />
      <Villager x={-11} z={11.5} seed={3} />

      {/* ambient life on the edges */}
      <Chicken x={-10.5} z={8} seed={1} />
      <Chicken x={10.8} z={-6} seed={2} />
      <Chicken x={-10.8} z={-12} seed={3} />
      <Chicken x={10.5} z={13} seed={4} />
      <GrazingGoat x={-11} z={-4} seed={5} />
      <GrazingGoat x={11} z={9} seed={6} />
    </group>
  );
}
