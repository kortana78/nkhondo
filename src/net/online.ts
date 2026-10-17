// Online client: REST + WebSocket manager (singleton) + zustand slice state.
// Degrades gracefully when VITE_API_URL/VITE_WS_URL are unset (offline dev).
import { create } from 'zustand';
import type {
  ClientMsg, DeployedMsg, FoeInfo, LeaderboardRes, ProfileRes,
  RegisterRes, ServerMsg, StatsRes, TeamId,
} from '../../shared/protocol.js';

export interface MatchInfo {
  matchId: string;
  seed: number;
  yourTeam: TeamId;
  deck: string[];
  foeDeck: string[];
  foe: FoeInfo;
}

export interface MatchResult {
  winner: TeamId | 2;
  reason: string;
  youDelta: number;
  foeDelta: number;
  youRating: number;
  foeRating: number;
}

interface OnlineState {
  token: string | null;
  profile: ProfileRes | null;
  stats: StatsRes | null;
  rank: number;
  queue: { active: boolean; position: number; window: number; aiOffered: boolean; since: number };
  match: MatchInfo | null;
  result: MatchResult | null;
  rematchAsked: boolean;
  ping: number;
  wsState: 'down' | 'connecting' | 'up' | 'reconnecting';
  reconnecting: boolean;
  set: (p: Partial<OnlineState>) => void;
}

export const useOnline = create<OnlineState>((set) => ({
  token: null,
  profile: null,
  stats: null,
  rank: 0,
  queue: { active: false, position: 0, window: 50, aiOffered: false, since: 0 },
  match: null,
  result: null,
  rematchAsked: false,
  ping: 0,
  wsState: 'down',
  reconnecting: false,
  set: (p) => set(p),
}));

export function apiUrl(): string {
  return (import.meta.env.VITE_API_URL as string | undefined ?? '').replace(/\/$/, '');
}
export function wsUrl(): string {
  return (import.meta.env.VITE_WS_URL as string | undefined ?? '').replace(/\/$/, '');
}
export function onlineEnabled(): boolean {
  return apiUrl().length > 0 && wsUrl().length > 0;
}

const TOKEN_KEY = 'nkhondo:token';

export function loadToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function saveToken(t: string | null): void {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* noop */ }
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = useOnline.getState().token;
  const res = await fetch(apiUrl() + path, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json() as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `http ${res.status}`);
  return body;
}

export const api = {
  register: (name: string) => rest<RegisterRes>('/api/register', { method: 'POST', body: JSON.stringify({ name }) }),
  recover: (code: string) => rest<{ playerId: string; name: string; tag: string; token: string }>('/api/recover', { method: 'POST', body: JSON.stringify({ code }) }),
  me: () => rest<ProfileRes>('/api/me'),
  rename: (name: string) => rest<{ name: string; tag: string }>('/api/rename', { method: 'POST', body: JSON.stringify({ name }) }),
  leaderboard: (limit = 100) => rest<LeaderboardRes>(`/api/leaderboard?limit=${limit}`),
  stats: () => rest<StatsRes>('/api/stats'),
};

export async function refreshProfile(): Promise<void> {
  const me = await api.me();
  useOnline.getState().set({ profile: me, rank: me.rank });
}

// ---------------- WebSocket singleton ----------------

type Handler = (m: ServerMsg) => void;

class Net {
  ws: WebSocket | null = null;
  handlers = new Set<Handler>();
  backoff = 500;
  wantUp = false;
  pingT: number | null = null;
  pingTimer: ReturnType<typeof setInterval> | null = null;
  lastStatsAt = 0;

  on(h: Handler): () => void {
    this.handlers.add(h);
    return () => { this.handlers.delete(h); };
  }

  private emit(m: ServerMsg): void {
    for (const h of [...this.handlers]) {
      try { h(m); } catch (err) { console.error('[net]', err); }
    }
  }

  ensure(): void {
    if (!onlineEnabled()) return;
    const token = useOnline.getState().token;
    if (!token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    this.wantUp = true;
    this.connect(token);
  }

  drop(): void {
    this.wantUp = false;
    this.backoff = 500;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    useOnline.getState().set({ wsState: 'down', reconnecting: false });
  }

  private connect(token: string): void {
    useOnline.getState().set({ wsState: useOnline.getState().wsState === 'down' ? 'connecting' : 'reconnecting', reconnecting: true });
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${wsUrl()}/ws?token=${encodeURIComponent(token)}`);
    } catch {
      this.schedule(token);
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 500;
      useOnline.getState().set({ wsState: 'up', reconnecting: false });
      this.pingT = Date.now();
      try { ws.send(JSON.stringify({ type: 'pong', t: this.pingT } satisfies ClientMsg)); } catch { /* noop */ }
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => {
        this.pingT = Date.now();
        try { ws.send(JSON.stringify({ type: 'pong', t: this.pingT } satisfies ClientMsg)); } catch { /* noop */ }
      }, 10_000);
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(ev.data)) as ServerMsg; } catch { return; }
      if (m.type === 'pong' && typeof m.t === 'number') {
        const rtt = Date.now() - m.t;
        useOnline.getState().set({ ping: Math.round((useOnline.getState().ping + rtt) / 2) });
      }
      if (m.type === 'stats') {
        useOnline.getState().set({
          stats: { online: m.online, inQueue: m.inQueue, inBattle: m.inBattle, registered: m.registered },
        });
      }
      this.emit(m);
    };
    const down = () => {
      if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
      if (this.ws === ws) this.ws = null;
      useOnline.getState().set({ wsState: 'down', reconnecting: this.wantUp });
      if (this.wantUp) this.schedule(token);
    };
    ws.onclose = down;
    ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
  }

  private schedule(token: string): void {
    const wait = Math.min(this.backoff, 10_000);
    this.backoff = Math.min(this.backoff * 2, 10_000);
    setTimeout(() => {
      if (!this.wantUp) return;
      if (this.ws && this.ws.readyState !== WebSocket.CLOSED) return;
      this.backoff = Math.min(wait * 2, 10_000);
      this.connect(token);
    }, wait);
  }

  send(m: ClientMsg): void {
    try { this.ws?.send(JSON.stringify(m)); } catch { /* noop */ }
  }
}

export const net = new Net();

/** Outgoing validated-deploy intents awaiting server ack, by clientSeq. */
export interface Ghost { cardId: string; x: number; z: number; at: number }
export const ghosts = new Map<number, Ghost>();
let seq = 1;
export function nextSeq(): number {
  return seq++;
}

/** Deploys confirmed by the server, waiting for their execute tick. */
export const pendingDue: DeployedMsg[] = [];

export function pushDue(d: DeployedMsg): void {
  pendingDue.push(d);
  pendingDue.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
}

export function takeDue(tick: number): DeployedMsg[] {
  const out = pendingDue.filter((d) => d.executeTick <= tick);
  const rest = pendingDue.filter((d) => d.executeTick > tick);
  pendingDue.length = 0;
  pendingDue.push(...rest);
  return out;
}

export function clearNetBattle(): void {
  ghosts.clear();
  pendingDue.length = 0;
}
