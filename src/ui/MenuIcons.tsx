// Original gold menu icons in the Nkhondo house style (stroke-based, gold).
export function MenuIcon({ kind }: { kind: 'howto' | 'deck' | 'cards' | 'arenas' | 'settings' }) {
  const common = {
    width: 34, height: 34, viewBox: '0 0 34 34', fill: 'none',
    stroke: '#e8a020', strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round',
  } as const;
  if (kind === 'howto') {
    return (
      <svg {...common}>
        <circle cx="17" cy="17" r="13" />
        <path d="M13.5 13.5a3.7 3.7 0 1 1 5.4 3.3c-1.2.7-1.9 1.3-1.9 2.7" />
        <circle cx="17" cy="23.6" r="0.4" fill="#e8a020" />
      </svg>
    );
  }
  if (kind === 'deck') {
    return (
      <svg {...common}>
        <rect x="7" y="13" width="20" height="13" rx="2" />
        <path d="M10 13V9.5A2.5 2.5 0 0 1 12.5 7h13A2.5 2.5 0 0 1 28 9.5V20" />
        <path d="M7 19.5h20" />
      </svg>
    );
  }
  if (kind === 'cards') {
    return (
      <svg {...common}>
        <path d="M17 8.5C14.5 6.8 11 6.5 7.5 7.5v17c3.5-1 7-0.7 9.5 1 2.5-1.7 6-2 9.5-1v-17c-3.5-1-7-0.7-9.5 1z" />
        <path d="M17 8.5v17" />
      </svg>
    );
  }
  if (kind === 'arenas') {
    return (
      <svg {...common}>
        <path d="M5 26V16a12 12 0 0 1 24 0v10" />
        <path d="M5 26h24" />
        <path d="M10 26v-6M17 26V12M24 26v-6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="17" cy="17" r="4.5" />
      <path d="M17 5.5v4M17 24.5v4M5.5 17h4M24.5 17h4M9 9l2.8 2.8M22.2 22.2L25 25M25 9l-2.8 2.8M11.8 22.2L9 25" />
    </svg>
  );
}
