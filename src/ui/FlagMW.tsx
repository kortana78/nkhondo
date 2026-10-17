// Small Malawi flag icon (original simplified SVG). Not a card/HUD icon.
export function FlagMW({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size} height={size * 0.75} viewBox="0 0 30 22" role="img" aria-label="Malawi"
      style={{ borderRadius: 3, boxShadow: '0 1px 3px #00000088', verticalAlign: -2 }}
    >
      <rect x="0" y="0" width="30" height="7" fill="#1a1a1a" />
      <rect x="0" y="7" width="30" height="8" fill="#c22f2f" />
      <rect x="0" y="15" width="30" height="7" fill="#2f7a3d" />
      <g transform="translate(15,11)">
        <circle r="3.4" fill="#e85454" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={Math.cos(a) * 4.1} y1={Math.sin(a) * 4.1}
              x2={Math.cos(a) * 5.6} y2={Math.sin(a) * 5.6}
              stroke="#e85454" strokeWidth="0.9" strokeLinecap="round"
            />
          );
        })}
      </g>
    </svg>
  );
}
