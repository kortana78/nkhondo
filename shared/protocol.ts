// Client <-> server message types. Shared by /client and /server so the
// protocol can never drift. Compact JSON; binary later if needed.
import type { BattleState } from './sim/battle.js';

export const PROTOCOL_VERSION = 1;

/** Deploy delay: server schedules inputs this many ticks in the future
 *  (20 ticks = the 1.0s deploy countdown, absorbs up to ~500ms ping). */
export const DEPLOY_DELAY_TICKS = 20;
/** Ticks between server tick broadcasts. */
export const TICK_BROADCAST_EVERY = 5;
/** Ticks between state-hash checks. */
export const HASH_CHECK_EVERY = 40;
/** Seconds a disconnected player has to reconnect before forfeit. */
export const RECONNECT_WINDOW_S = 20;
/** Max deploys per player per second (1 per 200ms). */
export const MAX_DEPLOYS_PER_SEC = 5;
/** Max WS messages per player per second. */
export const MAX_MSG_PER_SEC = 20;

export type TeamId = 0 | 1;

// ---------- client -> server ----------
export type ClientMsg =
  | { type: 'queue'; deck?: string[] }
  | { type: 'dequeue' }
  | { type: 'deploy'; cardId: string; x: number; z: number; clientSeq: number }
  | { type: 'hash'; tick: number; hash: string }
  | { type: 'pong'; t: number }
  | { type: 'rematch' }
  | { type: 'rematch_accept' }
  | { type: 'abandon' };

// ---------- server -> client ----------
export interface FoeInfo { name: string; tag: string; rating: number }

export type ServerMsg =
  | { type: 'queued'; position: number; window: number }
  | { type: 'ai_offer' }
  | {
      type: 'match_found'; matchId: string; seed: number; yourTeam: TeamId;
      deck: string[]; foeDeck: string[]; foe: FoeInfo; countdownMs: number;
    }
  | { type: 'match_start'; tick: number }
  | {
      type: 'deployed'; player: TeamId; cardId: string; x: number; z: number;
      executeTick: number; seq: number; clientSeq?: number;
    }
  | { type: 'rejected'; clientSeq: number; reason: string }
  | { type: 'tick'; serverTick: number }
  | { type: 'pong'; t: number } // RTT echo for the client's ping indicator
  | { type: 'snapshot'; state: BattleState; pending: DeployedMsg[]; serverTick: number }
  | {
      type: 'match_end'; winner: TeamId | 2; reason: 'chief' | 'towers' | 'health' | 'forfeit' | 'timeout';
      youDelta: number; foeDelta: number; youRating: number; foeRating: number;
    }
  | { type: 'rematch_asked' }
  | { type: 'stats'; online: number; inQueue: number; inBattle: number; registered: number }
  | { type: 'update'; text: string } // server restarting: finish current match
  | { type: 'error'; message: string };

/** A validated deploy waiting for / applied at its execute tick. */
export interface DeployedMsg {
  player: TeamId; cardId: string; x: number; z: number;
  executeTick: number; seq: number; clientSeq?: number;
}

// ---------- REST shapes ----------
export interface RegisterReq { name: string }
export interface RegisterRes {
  playerId: string; name: string; tag: string; token: string; recoveryCode: string;
}
export interface RecoverReq { code: string }
export type RecoverRes = Omit<RegisterRes, 'recoveryCode'>;
export interface RenameReq { name: string }

export interface RatingPoint { matchId: string; rating: number; at: string }

export interface ProfileRes {
  playerId: string; name: string; tag: string; rating: number;
  games: number; wins: number; losses: number; rank: number;
  history: RatingPoint[];
}

export interface LeaderRow { name: string; tag: string; rating: number; games: number; wins: number }

export interface LeaderboardRes { top: LeaderRow[]; you: (LeaderRow & { rank: number }) | null }

export interface StatsRes { online: number; inQueue: number; inBattle: number; registered: number }

export interface ErrorRes { error: string }
