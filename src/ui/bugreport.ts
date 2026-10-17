// Tiny in-game bug reporter: collects console errors, copies a debug bundle.
// No backend — the player pastes it to the developers.
import { version as gameVersion } from '../../package.json';

interface BugEntry { t: string; msg: string }
const LOG: BugEntry[] = [];
let installed = false;

export function initBugLog() {
  if (installed) return;
  installed = true;
  const push = (msg: string) => {
    try {
      LOG.push({ t: new Date().toISOString(), msg: String(msg).slice(0, 300) });
      if (LOG.length > 20) LOG.splice(0, LOG.length - 20);
    } catch { /* noop */ }
  };
  window.addEventListener('error', (e) => push('ERR: ' + (e.message || 'unknown')));
  window.addEventListener('unhandledrejection', (e) => {
    try { push('REJ: ' + String((e as PromiseRejectionEvent).reason?.message ?? (e as PromiseRejectionEvent).reason)); } catch { push('REJ'); }
  });
}

export function getBugBundle(): string {
  let settings = {};
  try {
    settings = {
      quality: localStorage.getItem('nkhondo:quality'),
      lang: localStorage.getItem('nkhondo:lang'),
      diff: localStorage.getItem('nkhondo:diff'),
    };
  } catch { /* noop */ }
  return JSON.stringify(
    {
      game: 'nkhondo',
      version: gameVersion,
      url: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
      ua: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 160) : '',
      settings,
      errors: LOG,
    },
    null,
    2,
  );
}

export async function copyBugReport(): Promise<boolean> {
  const text = getBugBundle();
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch { return false; }
  }
}
