import * as THREE from 'three';

// Sim (x: 0..18, z: 0..32, P0 home at low z) -> world (X: -9..9, Z: -16..16, P0 near camera at +Z)
export const WX = (x: number) => x - 9;
export const WZ = (z: number) => 16 - z;
export const SX = (wx: number) => wx + 9;
export const SZ = (wz: number) => 16 - wz;

export const TEAM_COLOR = ['#2f7fe0', '#e04040'];
export const TEAM_DARK = ['#1c4f9c', '#9c2424'];
export const SKINS = ['#6b4226', '#7a4b2a', '#8d5a33', '#5a341e', '#a06a42', '#4e2e1a'];
export const CLOTH = ['#e8c832', '#d84f6d', '#2fa8a0', '#7db35a', '#8a4fb5', '#e8e4da', '#3f6fb5'];
export const CAPS = ['#c22f2f', '#2f7fe0', '#f2f2f2', '#222222', '#e8a020'];

export function hashN(n: number): number {
  let h = (n * 2654435761) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
export function pick<T>(arr: T[], n: number, salt = 0): T {
  return arr[Math.floor(hashN(n * 7 + salt * 131) * arr.length) % arr.length];
}

export function shadowed(mat: THREE.Material): THREE.Material {
  mat.userData.shadowed = true;
  return mat;
}

/** tiny billboard HP bar with lagging white ghost + blue shield */
export function HpBar({ pct, ghostPct, shieldPct, w = 1.1, color = '#57d95e' }: { pct: number; ghostPct?: number; shieldPct?: number; w?: number; color?: string }) {
  const fg = w * Math.max(0.001, pct);
  const gh = w * Math.max(0.001, ghostPct ?? pct);
  const sh = shieldPct && shieldPct > 0.001 ? w * Math.min(1, shieldPct) : 0;
  return (
    <group>
      <mesh renderOrder={998}>
        <planeGeometry args={[w, 0.11]} />
        <meshBasicMaterial color="#1a0f0a" transparent opacity={0.85} depthWrite={false} depthTest={false} />
      </mesh>
      {/* lagging white ghost bar */}
      <mesh position={[(gh - w) / 2, 0, 0.0005]} renderOrder={999}>
        <planeGeometry args={[gh, 0.075]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.75} depthWrite={false} depthTest={false} />
      </mesh>
      <mesh position={[(fg - w) / 2, 0, 0.001]} renderOrder={1000}>
        <planeGeometry args={[fg, 0.07]} />
        <meshBasicMaterial color={color} depthWrite={false} depthTest={false} />
      </mesh>
      {sh > 0 && (
        <mesh position={[(sh - w) / 2, 0.09, 0.001]} renderOrder={1001}>
          <planeGeometry args={[sh, 0.045]} />
          <meshBasicMaterial color="#4aa8ff" depthWrite={false} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}
