import { CARD_ART } from './cardArt';

/** Real SVG card art; falls back to the sim emoji if an asset is missing. */
export function CardIcon({ id, fallback, className }: { id: string; fallback: string; className?: string }) {
  const src = CARD_ART[id];
  if (!src) return <span className={className}>{fallback}</span>;
  return <img src={src} alt="" draggable={false} className={className} />;
}
