// Title-screen 3D diorama: Mudzi village at sunset. Reuses the upgraded
// arena pieces (huts, mango, villagers, goats, baobabs, sky dome).
// Slow orbit (0.03 rad/s), dust + birds. Respects prefers-reduced-motion.
// Low quality (or WebGL failure) falls back to a pre-rendered-style still.
import { Suspense, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { SkyDome } from '../render/BattleView';
import { Hut, MangoTree, Villager, GrazingGoat, Chicken, MaizeRow, DistantBaobabs } from '../render/ArenaMudzi';
import type { Quality } from '../state/store';

export function useReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

function Dust() {
  const ref = useRef<THREE.Points>(null!);
  const geo = useRef<THREE.BufferGeometry>(null!);
  const N = 110;
  const pos = useMemo(() => {
    const p = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() - 0.5) * 26;
      p[i * 3 + 1] = Math.random() * 6 + 0.3;
      p[i * 3 + 2] = (Math.random() - 0.5) * 22;
    }
    return p;
  }, []);
  useFrame(({ clock }) => {
    const a = geo.current?.attributes.position as THREE.BufferAttribute | undefined;
    if (!a) return;
    const t = clock.elapsedTime * 0.35;
    for (let i = 0; i < a.count; i++) {
      a.setX(i, a.getX(i) + Math.sin(t + i) * 0.0025 + 0.004);
      if (a.getX(i) > 13) a.setX(i, -13);
    }
    a.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#ffd9a0" size={0.09} transparent opacity={0.65} depthWrite={false} />
    </points>
  );
}

function Birds() {
  const g = useRef<THREE.Group>(null!);
  const wL = useRef<THREE.Group>(null!);
  const wR = useRef<THREE.Group>(null!);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const t = clock.elapsedTime * 0.14;
    // slow loop across the sunset sky
    const k = (t % 40) / 40;
    g.current.position.set(-24 + k * 48, 13 + Math.sin(t * 2) * 0.7, -22);
    const flap = Math.sin(clock.elapsedTime * 7) * 0.55;
    if (wL.current) wL.current.rotation.z = 0.35 + flap;
    if (wR.current) wR.current.rotation.z = -0.35 - flap;
  });
  const wing = (side: 1 | -1) => (
    <group ref={side === 1 ? wR : wL}>
      <mesh position={[side * 0.45, 0, 0]} rotation={[0, 0, side * -0.35]}>
        <boxGeometry args={[0.85, 0.06, 0.28]} />
        <meshBasicMaterial color="#2a1a2a" />
      </mesh>
    </group>
  );
  return (
    <group ref={g}>
      <mesh>
        <sphereGeometry args={[0.16, 6, 6]} />
        <meshBasicMaterial color="#2a1a2a" />
      </mesh>
      {wing(1)}
      {wing(-1)}
    </group>
  );
}

function SunsetWater() {
  const mat = useRef<THREE.MeshStandardMaterial>(null!);
  useFrame(({ clock }) => {
    if (!mat.current) return;
    const t = clock.elapsedTime * 0.8;
    mat.current.color.setHSL(0.58, 0.55, 0.42 + Math.sin(t) * 0.05);
  });
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 2.5]}>
      <planeGeometry args={[16, 2.4]} />
      <meshStandardMaterial ref={mat} color="#4a7a9e" roughness={0.25} metalness={0.5} />
    </mesh>
  );
}

function OrbitRig({ still }: { still: boolean }) {
  useFrame(({ clock, camera }) => {
    const a = still ? 0.7 : 0.7 + clock.elapsedTime * 0.03; // ~0.03 rad/s
    const r = 19;
    camera.position.set(Math.sin(a) * r, 8.5, Math.cos(a) * r);
    camera.lookAt(0, 1.8, 0); // clear sky above the village, nothing clipped
    if (camera instanceof THREE.PerspectiveCamera && camera.fov !== 46) {
      camera.fov = 46;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

/** Sun glow billboard: radial sprite centred exactly on the disc. */
function SunGlow({ position }: { position: [number, number, number] }) {
  const tex = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,233,176,0.9)');
    grad.addColorStop(0.35, 'rgba(255,184,77,0.45)');
    grad.addColorStop(1, 'rgba(255,154,90,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[2.6, 16, 16]} />
        <meshBasicMaterial color="#ffe9b0" fog={false} />
      </mesh>
      <sprite scale={[11, 11, 1]}>
        <spriteMaterial map={tex} transparent opacity={0.9} fog={false} depthWrite={false} />
      </sprite>
    </group>
  );
}

function DioramaScene({ still }: { still: boolean }) {
  return (
    <group>
      <SkyDome top="#3a3f7d" bottom="#ff9a5a" />
      <fog attach="fog" args={['#e8a06a', 30, 80]} />
      {/* low sunset sun: real lit disc + centred soft glow */}
      <SunGlow position={[-14, 5.5, -30]} />
      <hemisphereLight args={['#8a7ab5', '#5a3a22', 1.0]} />
      <directionalLight position={[-14, 9, -6]} intensity={2.3} color="#ffb36b" />
      <directionalLight position={[10, 12, 14]} intensity={0.45} color="#7a8ad0" />
      {/* red-earth village green */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[15, 36]} />
        <meshStandardMaterial color="#9c4a2b" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 2]}>
        <planeGeometry args={[3.2, 20]} />
        <meshStandardMaterial color="#c98d54" roughness={1} />
      </mesh>
      <SunsetWater />
      <Hut x={-4.5} z={-2} s={1.15} ry={0.5} />
      <Hut x={4.6} z={-3} s={1} ry={-0.4} />
      <Hut x={0.5} z={-7.5} s={0.9} ry={0.1} />
      <MangoTree x={-6.4} z={1} s={1.1} />
      <MangoTree x={6.5} z={0.5} s={1.2} />
      <MaizeRow x={-6.5} z={5.5} n={6} />
      <MaizeRow x={6.8} z={5} n={6} />
      {/* villagers kept clear of the centre-front text zone */}
      <Villager x={-5.5} z={2.5} seed={1} />
      <Villager x={5.8} z={3} seed={2} />
      <Villager x={-3} z={-4.5} seed={3} />
      <GrazingGoat x={3.4} z={1.5} seed={5} />
      <GrazingGoat x={-5.5} z={-5.5} seed={6} />
      <Chicken x={1.2} z={2.2} seed={1} />
      <Chicken x={-2.2} z={5.5} seed={2} />
      <DistantBaobabs />
      {!still && <Dust />}
      {!still && <Birds />}
    </group>
  );
}

/** Pre-rendered-style still for low quality / failed WebGL. */
export function TitleStill() {
  return (
    <div className="title-still" aria-hidden>
      <div className="ts-sun" />
      <div className="ts-hills" />
      <div className="ts-hut h1" />
      <div className="ts-hut h2" />
      <div className="ts-tree t1" />
      <div className="ts-tree t2" />
    </div>
  );
}

export function TitleDiorama({ quality }: { quality: Quality }) {
  const stillMode = useReducedMotion();
  const [failed, setFailed] = useState(false);
  const showStill = quality === 'low' || stillMode || failed;
  if (showStill) return <TitleStill />;
  return (
    <Canvas
      dpr={[1, 1.25]}
      gl={{ antialias: true, powerPreference: 'low-power' }}
      camera={{ fov: 46, position: [10, 7.5, 13], near: 0.5, far: 220 }}
      onCreated={({ gl }) => {
        try {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.22;
        } catch { setFailed(true); }
      }}
    >
      <Suspense fallback={null}>
        <OrbitRig still={stillMode} />
        <DioramaScene still={stillMode} />
      </Suspense>
    </Canvas>
  );
}
