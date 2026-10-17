import * as THREE from 'three';
import { useMemo } from 'react';

let tex: THREE.CanvasTexture | null = null;

function getTex(): THREE.CanvasTexture {
  if (!tex) {
    const c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
    grad.addColorStop(0, 'rgba(0,0,0,0.62)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0.34)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    tex = new THREE.CanvasTexture(c);
  }
  return tex;
}

/** Cheap soft contact AO disc. */
export function BlobShadow({ s, opacity = 0.5, y = 0.02 }: { s: number; opacity?: number; y?: number }) {
  const t = useMemo(() => getTex(), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[s, s]} />
      <meshBasicMaterial map={t} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
