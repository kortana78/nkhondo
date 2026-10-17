import { useCallback, useEffect, useState } from 'react';
import { useGame } from './state/store';
import { TitleScreen, HomeScreen, DeckScreen, CardsScreen, ArenasScreen, SettingsScreen, HowToScreen, AboutScreen, CreditsScreen } from './ui/screens';
import { NameEntryScreen, ProfileScreen, LeaderboardScreen, MatchmakeScreen } from './ui/onlineScreens';
import { BattleScreen } from './ui/BattleScreen';
import { LoadingScreen, type LoadState } from './ui/LoadingScreen';
import { loadWorldAssets } from './assets/loader';
import { setMuted, applyVolumes } from './audio/engine';
import { initBugLog } from './ui/bugreport';

export default function App() {
  const screen = useGame((s) => s.screen);
  const muted = useGame((s) => s.muted);
  const musicVol = useGame((s) => s.musicVol);
  const sfxVol = useGame((s) => s.sfxVol);
  const [booted, setBooted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<LoadState>({ frac: 0, label: '…', error: null });

  useEffect(() => { setMuted(muted); }, [muted]);
  useEffect(() => { applyVolumes(musicVol, sfxVol); }, [musicVol, sfxVol]);
  useEffect(() => { initBugLog(); }, []);

  const boot = useCallback(async (cancelled: { off: boolean }) => {
    try {
      setLoad({ frac: 0, label: '…', error: null });
      await loadWorldAssets((p) => {
        if (!cancelled.off) setLoad({ frac: p.loaded / Math.max(1, p.total), label: p.id, error: null });
      });
      try { await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* noop */ }
      if (!cancelled.off) {
        setLoad({ frac: 1, label: 'done', error: null });
        setBooted(true);
      }
    } catch (e) {
      if (!cancelled.off) {
        setLoad((s) => ({ ...s, error: String((e as Error)?.message ?? e) }));
      }
    }
  }, []);

  useEffect(() => {
    const cancelled = { off: false };
    setBooted(false);
    void boot(cancelled);
    return () => { cancelled.off = true; };
  }, [attempt, boot]);

  // deep-link for testing/screenshots: ?s=battle&autoplay=1&arena=msika
  useEffect(() => {
    if (!booted) return;
    try {
      const q = new URLSearchParams(window.location.search);
      const s = q.get('s');
      const a = q.get('arena');
      if (a === 'msika' || a === 'mudzi') useGame.getState().setArena(a);
      if (s === 'battle') useGame.getState().go('battle');
    } catch { /* noop */ }
  }, [booted]);

  const wide = !booted || screen === 'title' || screen === 'home';
  return (
    <div className={'app' + (wide ? ' wide' : '')}>
      {!booted && <LoadingScreen state={load} onRetry={() => setAttempt((a) => a + 1)} />}
      {booted && screen === 'title' && <TitleScreen />}
      {booted && screen === 'home' && <HomeScreen />}
      {booted && screen === 'deck' && <DeckScreen />}
      {booted && screen === 'cards' && <CardsScreen />}
      {booted && screen === 'arenas' && <ArenasScreen />}
      {booted && screen === 'settings' && <SettingsScreen />}
      {booted && screen === 'howto' && <HowToScreen />}
      {booted && screen === 'about' && <AboutScreen />}
      {booted && screen === 'credits' && <CreditsScreen />}
      {booted && screen === 'nameentry' && <NameEntryScreen />}
      {booted && screen === 'profile' && <ProfileScreen />}
      {booted && screen === 'leaderboard' && <LeaderboardScreen />}
      {booted && screen === 'matchmake' && <MatchmakeScreen />}
      {booted && screen === 'battle' && <BattleScreen />}
    </div>
  );
}
