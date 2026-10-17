// Boot loading screen: real progress from the asset loader, rotating tips,
// clear error + Retry when anything fails.
import { useEffect, useState } from 'react';
import { useGame } from '../state/store';
import { t } from './i18n';
import { TitleStill } from './TitleDiorama';

export interface LoadState {
  frac: number; // 0..1
  label: string;
  error: string | null;
}

export function LoadingScreen({ state, onRetry }: { state: LoadState; onRetry: () => void }) {
  const lang = useGame((s) => s.lang);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * 5));
  useEffect(() => {
    const id = window.setInterval(() => setTip((v) => (v + 1) % 5), 4000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div className="screen loading-screen">
      <div className="loading-bg">
        <TitleStill />
      </div>
      <div className="loading-card">
        <div className="game-logo sm">
          <span>NKHONDO</span>
        </div>
        <div className="loadbar big" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(state.frac * 100)} aria-label={t(lang, 'loading')}>
          <i style={{ width: `${Math.round(state.frac * 100)}%` }} />
        </div>
        <div className="load-sub">{state.error ?? state.label}</div>
        {state.error ? (
          <button className="btn big" onClick={onRetry}>
            ↻ {t(lang, 'retry')}
          </button>
        ) : (
          <div className="proverb">{t(lang, 'tip' + tip)}</div>
        )}
      </div>
    </div>
  );
}
