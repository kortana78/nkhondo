// Online screens: name entry (guest register/recover), profile, leaderboard,
// ranked matchmaking. All strings via i18n (EN + Chichewa).
import { useEffect, useState } from 'react';
import { useGame } from '../state/store';
import { t } from './i18n';
import { sfx, ensureAudio, startMusic } from '../audio/engine';
import {
  api, net, refreshProfile, saveToken,
  useOnline,
} from '../net/online';
import type { LeaderboardRes } from '../../shared/protocol';

function TopBar({ title, back }: { title: string; back?: boolean }) {
  const go = useGame((s) => s.go);
  const lang = useGame((s) => s.lang);
  const setLang = useGame((s) => s.setLang);
  return (
    <div className="topbar">
      {back ? <button className="iconbtn" onClick={() => { sfx.click(); go('home'); }}>‹</button> : <span style={{ width: 44 }} />}
      <h2>{title}</h2>
      <button className="langbtn" onClick={() => setLang(lang === 'en' ? 'ch' : 'en')}>
        {lang === 'en' ? 'CH' : 'EN'}
      </button>
    </div>
  );
}

export function NameEntryScreen() {
  const go = useGame((s) => s.go);
  const lang = useGame((s) => s.lang);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'register' | 'recover'>('register');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [recoveryShown, setRecoveryShown] = useState<string | null>(null);

  const submit = async () => {
    setErr('');
    setBusy(true);
    try {
      if (mode === 'register') {
        const r = await api.register(name);
        saveToken(r.token);
        useOnline.getState().set({ token: r.token });
        await refreshProfile();
        net.ensure();
        setRecoveryShown(r.recoveryCode);
      } else {
        const r = await api.recover(code);
        saveToken(r.token);
        useOnline.getState().set({ token: r.token });
        await refreshProfile();
        net.ensure();
        go('home');
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'error');
    } finally {
      setBusy(false);
    }
  };

  if (recoveryShown) {
    return (
      <div className="screen center">
        <h2>{t(lang, 'recoveryTitle')}</h2>
        <p className="hint">{t(lang, 'recoveryOnce')}</p>
        <div className="recovery-code">{recoveryShown}</div>
        <button
          className="btn big"
          onClick={() => {
            try { void navigator.clipboard?.writeText(recoveryShown); } catch { /* noop */ }
            sfx.click();
            go('home');
          }}
        >
          {t(lang, 'gotIt')}
        </button>
      </div>
    );
  }

  return (
    <div className="screen">
      <TopBar title={t(lang, 'online')} back />
      <div className="seg" style={{ marginBottom: 4 }}>
        <button className={mode === 'register' ? 'on' : ''} onClick={() => setMode('register')}>{t(lang, 'play')}</button>
        <button className={mode === 'recover' ? 'on' : ''} onClick={() => setMode('recover')}>{t(lang, 'recover')}</button>
      </div>
      {mode === 'register' ? (
        <>
          <h2>{t(lang, 'enterName')}</h2>
          <input
            className="nameinput" value={name} maxLength={16}
            onChange={(e) => setName(e.target.value)}
            placeholder={t(lang, 'namePh')}
            autoComplete="off"
          />
          <p className="hint">{t(lang, 'nameRules')}</p>
        </>
      ) : (
        <>
          <h2>{t(lang, 'recoverTitle')}</h2>
          <input
            className="nameinput" value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t(lang, 'recoverPh')}
            autoComplete="off"
          />
        </>
      )}
      {err && <p className="err">{err}</p>}
      <button className="btn big" disabled={busy} onClick={() => void submit()}>
        {busy ? '…' : mode === 'register' ? t(lang, 'play') : t(lang, 'recover')}
      </button>
      <p className="hint">{t(lang, 'reviewNote')}</p>
    </div>
  );
}

function RatingGraph({ history }: { history: { rating: number }[] }) {
  if (history.length < 2) return <p className="hint">···</p>;
  const vals = history.map((h) => h.rating);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = Math.max(1, max - min);
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 100},${100 - ((v - min) / span) * 100}`).join(' ');
  return (
    <svg viewBox="0 0 100 100" className="rating-graph" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#e8a020" strokeWidth="3" strokeLinejoin="round" />
    </svg>
  );
}

export function ProfileScreen() {
  const go = useGame((s) => s.go);
  const lang = useGame((s) => s.lang);
  const profile = useOnline((s) => s.profile);
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (useOnline.getState().token) void refreshProfile().catch(() => undefined);
  }, []);
  if (!profile) {
    return (
      <div className="screen center">
        <p>{t(lang, 'signInToPlay')}</p>
        <button className="btn" onClick={() => go('nameentry')}>{t(lang, 'play')}</button>
      </div>
    );
  }
  return (
    <div className="screen">
      <TopBar title={t(lang, 'profile')} back />
      <div className="about-body">
        <h3>{profile.name}#{profile.tag}</h3>
        <div className="verline">
          <span>{t(lang, 'zikho')}: <b>{profile.rating}</b></span>
          <span>{t(lang, 'rank')}: <b>#{profile.rank || '···'}</b></span>
        </div>
        <div className="verline">
          <span>{t(lang, 'games')}: <b>{profile.games}</b></span>
          <span>{t(lang, 'wins')}: <b>{profile.wins}</b></span>
          <span>{t(lang, 'losses')}: <b>{profile.losses}</b></span>
        </div>
        <RatingGraph history={profile.history} />
        <h3>{t(lang, 'renameTitle')}</h3>
        <input className="nameinput" value={newName} maxLength={16} onChange={(e) => setNewName(e.target.value)} placeholder={t(lang, 'namePh')} />
        <button
          className="btn"
          onClick={() => {
            void (async () => {
              try {
                const r = await api.rename(newName);
                setMsg(`${r.name}#${r.tag}`);
                await refreshProfile();
              } catch (e) {
                setMsg(e instanceof Error ? e.message : 'error');
              }
            })();
          }}
        >
          {t(lang, 'renameTitle')}
        </button>
        {msg && <p className="hint">{msg}</p>}
        <button
          className="btn danger"
          onClick={() => {
            saveToken(null);
            net.drop();
            useOnline.getState().set({ token: null, profile: null, match: null, result: null });
            go('home');
          }}
        >
          {t(lang, 'logout')}
        </button>
      </div>
    </div>
  );
}

export function LeaderboardScreen() {
  const lang = useGame((s) => s.lang);
  const [data, setData] = useState<LeaderboardRes | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    void api.leaderboard(100).then(setData).catch((e) => setErr(e instanceof Error ? e.message : 'error'));
  }, []);
  return (
    <div className="screen">
      <TopBar title={t(lang, 'leaderboard')} back />
      {err && <p className="err">{err}</p>}
      {!data && !err && <p className="hint">…</p>}
      {data && (
        <div className="card-list">
          {data.top.map((p, i) => (
            <div key={`${p.name}#${p.tag}`} className="card-detail lb-row">
              <b className="lb-rank">#{i + 1}</b>
              <div>
                <b>{p.name}#{p.tag}</b>
                <div className="role">{p.rating} {t(lang, 'zikho')} • {p.wins}/{p.games}</div>
              </div>
            </div>
          ))}
          {data.you && (
            <div className="card-detail lb-you">
              <b className="lb-rank">#{data.you.rank || '···'}</b>
              <div>
                <b>{data.you.name}#{data.you.tag}</b>
                <div className="role">{data.you.rating} {t(lang, 'zikho')}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MatchmakeScreen() {
  const go = useGame((s) => s.go);
  const lang = useGame((s) => s.lang);
  const deck = useGame((s) => s.deck);
  const queue = useOnline((s) => s.queue);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    net.ensure();
    net.send({ type: 'queue', deck });
    useOnline.getState().set({ queue: { active: true, position: 0, window: 50, aiOffered: false, since: Date.now() }, rematchAsked: false, result: null });
    const off = net.on((m) => {
      const st = useOnline.getState();
      if (m.type === 'queued') {
        st.set({ queue: { ...st.queue, position: m.position, window: m.window } });
      } else if (m.type === 'ai_offer') {
        st.set({ queue: { ...st.queue, aiOffered: true } });
      } else if (m.type === 'match_found') {
        st.set({
          queue: { active: false, position: 0, window: 50, aiOffered: false, since: 0 },
          match: {
            matchId: m.matchId, seed: m.seed, yourTeam: m.yourTeam,
            deck: m.deck, foeDeck: m.foeDeck, foe: m.foe,
          },
          result: null,
          rematchAsked: false,
        });
        ensureAudio();
        startMusic();
        go('battle');
      }
    });
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => {
      off();
      clearInterval(tick);
      const st = useOnline.getState();
      if (st.queue.active && !st.match) {
        net.send({ type: 'dequeue' });
        st.set({ queue: { active: false, position: 0, window: 50, aiOffered: false, since: 0 } });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const waited = Math.max(0, Math.round((now - queue.since) / 1000));
  const cancel = () => {
    net.send({ type: 'dequeue' });
    useOnline.getState().set({ queue: { active: false, position: 0, window: 50, aiOffered: false, since: 0 } });
    sfx.click();
    go('home');
  };
  return (
    <div className="screen center">
      <div className="spinner" aria-label={t(lang, 'queueing')} />
      <h2>{t(lang, 'queueing')}</h2>
      <p className="hint">{waited}s • #{queue.position || '···'} • ±{queue.window}</p>
      {queue.aiOffered ? (
        <div className="howto-nav">
          <button
            className="btn"
            onClick={() => {
              net.send({ type: 'dequeue' });
              useOnline.getState().set({ queue: { active: false, position: 0, window: 50, aiOffered: false, since: 0 } });
              sfx.click();
              go('battle');
            }}
          >
            {t(lang, 'playVsAI')}
          </button>
          <button className="chipbtn" onClick={cancel}>{t(lang, 'cancel')}</button>
        </div>
      ) : (
        <button className="btn danger" onClick={cancel}>{t(lang, 'cancel')}</button>
      )}
      <p className="hint">{t(lang, 'keepWaiting')}</p>
    </div>
  );
}
