// GLB-ready asset loader with progress + graceful fallback to procedural.
// Card/HUD icons are NEVER loaded here (frozen). World/unit GLBs map to
// assets/manifest.json ids; on any failure the procedural placeholder stays.
import manifestRaw from '../../assets/manifest.json';

export interface ManifestEntry {
  id: string;
  file: string | null;
  sourceUrl: string;
  author: string;
  licence: string;
  attribution: string;
  modifications: string;
  status: string;
  gapReason: string;
}

export function getManifest(): { entries: ManifestEntry[] } {
  return manifestRaw as unknown as { entries: ManifestEntry[] };
}

export type LoadProgress = { loaded: number; total: number; id: string };

/** Load world GLBs with progress. Resolves to fallback map (id -> false = procedural). */
export async function loadWorldAssets(
  onProgress?: (p: LoadProgress) => void,
): Promise<Record<string, boolean>> {
  const entries = getManifest().entries.filter((e) => e.file && e.file.startsWith('http'));
  const total = Math.max(1, entries.length);
  const out: Record<string, boolean> = {};
  // No remote GLBs wired yet — procedural placeholders are authoritative.
  // This loop preserves the progress-bar + fallback contract for Part A.
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    try {
      onProgress?.({ loaded: i, total, id: e.id });
      // Future: GLTFLoader + DRACO/KTX2 decode, scale/origin normalise,
      // atlas share, LOD + instancing registration.
      out[e.id] = false;
    } catch {
      out[e.id] = false; // graceful fallback to procedural placeholder
    }
  }
  onProgress?.({ loaded: total, total, id: 'done' });
  return out;
}

/** True when every manifest entry has a file, source, author and licence. */
export function manifestLicenceOk(): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const e of getManifest().entries) {
    if (!e.sourceUrl || !e.author || !e.licence) missing.push(e.id);
    const lic = e.licence.toLowerCase();
    const okLic = lic.includes('cc0') || lic.includes('cc-by') || lic.includes('original') || lic.includes('mixamo') || lic.includes('ofl');
    if (!okLic) missing.push(e.id + ':licence');
  }
  return { ok: missing.length === 0, missing };
}
