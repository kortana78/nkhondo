// Online ranked battle wiring: owns the local mirror sim, routes deploys
// through the server, applies scheduled inputs at exact ticks, catches up,
// sends state hashes, applies snapshots, surfaces the server result.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Battle, deployRemote, flipState, hashBattleState, nudgeDeploy } from '../../shared/sim/battle';
import type { DeployedMsg, ServerMsg, TeamId } from '../../shared/protocol';
import { sfx } from '../audio/engine';
import type { FxItem } from '../render/EffectsLayer';
import { viewApi } from '../render/BattleView';
import { net, useOnline, ghosts, nextSeq, pushDue, takeDue, clearNetBattle, refreshProfile, pendingDue } from '../net/online';

export interface FxSignal { n: number; kind: FxItem['kind']; x: number; z: number; team: 0 | 1 | undefined }

const FRIENDLY_REASON: Record<string, string> = {
  energy: 'Not enough mphamvu',
  half: 'Deploy on YOUR half',
  river: 'Blocked: river',
  arena: 'Outside arena',
  hand: 'Card not in hand',
  over: 'Match over',
  card: 'Bad card',
  rate: 'Too fast — slow down',
};

export function useOnlineBattle(showToast: (msg: string, err?: boolean) => void) {
  const match = useOnline((s) => s.match);
  const myTeam: TeamId = match?.yourTeam ?? 0;
  const [fxSig, setFxSig] = useState<FxSignal>({ n: 0, kind: 'ring', x: 9, z: 16, team: undefined });
  const [started, setStarted] = useState(false);
  const [ending, setEnding] = useState(false);
  const lastHash = useRef(-40);
  const battleRef = useRef<Battle | null>(null);

  // Local mirror sim: same seed+decks, self always team 0.
  const battle = useMemo(() => {
    if (!match) return null;
    const b = new Battle(match.seed, match.deck, match.foeDeck);
    // Slot-1 players simulate the mirrored board: rand z-offsets
    // (mfiti owl summons) must land mirrored or hashes desync.
    b.mirrorZ = match.yourTeam === 1;
    battleRef.current = b;
    lastHash.current = -40;
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match?.matchId]);

  const signalFx = useCallback((kind: FxItem['kind'], x: number, z: number, team: 0 | 1 | undefined) => {
    setFxSig((s) => ({ n: s.n + 1, kind, x, z, team }));
  }, []);

  // Send a deploy intent (optimistic ghost + countdown ring + sound).
  const sendDeploy = useCallback((card: string, x: number, z: number): boolean => {
    const b = battleRef.current;
    if (!b || !match || ending) return false;
    const spot = nudgeDeploy(b, 0, card, x, z);
    if (!spot) {
      const chk = b.canDeploy(0, card, x, z);
      showToast(FRIENDLY_REASON[chk.reason] ?? `Invalid: ${chk.reason}`, true);
      sfx.error();
      return false;
    }
    const clientSeq = nextSeq();
    net.send({ type: 'deploy', cardId: card, x: spot.x, z: spot.z, clientSeq });
    ghosts.set(clientSeq, { cardId: card, x: spot.x, z: spot.z, at: Date.now() });
    signalFx('deployRing', spot.x, spot.z, 0);
    signalFx('ring', spot.x, spot.z, 0);
    sfx.deploy();
    return true;
  }, [match, ending, showToast, signalFx]);

  // Apply due server inputs at exact ticks (called every sim tick).
  const beforeStep = useCallback((b: Battle) => {
    if (!match) return;
    const due = takeDue(b.tick);
    for (const d of due) deployRemote(b, match.yourTeam, d);
  }, [match]);

  // Catch-up helper shared by the tick handler.
  const catchUp = useCallback((b: Battle, serverTick: number) => {
    const m = useOnline.getState().match;
    if (!m) return;
    let n = 0;
    while (b.tick < serverTick - 10 && n < 300 && !b.over) {
      const due = takeDue(b.tick);
      for (const d of due) deployRemote(b, m.yourTeam, d);
      b.step();
      b.drainEvents(); // visuals skip while fast-forwarding; sim stays exact
      n++;
    }
  }, []);

  // Server messages for the live match.
  useEffect(() => {
    if (!match) return;
    viewApi.frozen = true; // hold until match_start (3-2-1 countdown)
    setStarted(false);
    setEnding(false);
    clearNetBattle();
    const off = net.on((m: ServerMsg) => {
      const cur = useOnline.getState().match;
      if (!cur || cur.matchId !== match.matchId) return;
      const b = battleRef.current;
      if (m.type === 'match_start') {
        viewApi.frozen = false;
        setStarted(true);
      } else if (m.type === 'deployed') {
        // ingest mapped to the local frame (self = team 0, own half at bottom)
        const local = (m.player === cur.yourTeam ? 0 : 1) as 0 | 1;
        const mz = cur.yourTeam === 0 ? m.z : 32 - m.z;
        pushDue({ player: local, cardId: m.cardId, x: m.x, z: mz, executeTick: m.executeTick, seq: m.seq });
        // ack matches only our own ghost (same seq AND card: seqs collide across players)
        if (m.clientSeq != null) {
          const g = ghosts.get(m.clientSeq);
          if (g && g.cardId === m.cardId) ghosts.delete(m.clientSeq);
        }
      } else if (m.type === 'rejected') {
        const g = ghosts.get(m.clientSeq);
        ghosts.delete(m.clientSeq);
        if (g) signalFx('deny' as FxItem['kind'], g.x, g.z, undefined);
        showToast(FRIENDLY_REASON[m.reason] ?? `Invalid: ${m.reason}`, true);
        sfx.error();
      } else if (m.type === 'tick') {
        if (b && !b.over) catchUp(b, m.serverTick);
      } else if (m.type === 'snapshot') {
        if (!b) return;
        const mapped = cur.yourTeam === 0 ? m.state : flipState(m.state);
        b.setState(mapped);
        pendingReplace(m.pending, cur.yourTeam);
        ghosts.clear();
      } else if (m.type === 'match_end') {
        setEnding(true);
        useOnline.getState().set({
          result: {
            winner: m.winner, reason: m.reason,
            youDelta: m.youDelta, foeDelta: m.foeDelta,
            youRating: m.youRating, foeRating: m.foeRating,
          },
        });
        // refresh profile (games/wins/rank)
        void refreshProfile().catch(() => undefined);
      } else if (m.type === 'rematch_asked') {
        useOnline.getState().set({ rematchAsked: true });
      }
    });
    return () => {
      off();
      viewApi.frozen = false;
    };
  }, [match?.matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  // leave / abandon handling
  useEffect(() => {
    return () => {
      const st = useOnline.getState();
      if (st.match && !st.result) {
        try { net.send({ type: 'abandon' }); } catch { /* noop */ }
      }
      clearNetBattle();
    };
  }, []);

  // periodic state-hash sender
  useEffect(() => {
    if (!match) return;
    const id = setInterval(() => {
      const b = battleRef.current;
      if (!b || b.over) return;
      if (b.tick >= lastHash.current + 40) {
        lastHash.current = b.tick;
        try {
          net.send({
            type: 'hash', tick: b.tick,
            hash: hashBattleState(b.getState(), match.yourTeam === 1),
          });
        } catch { /* noop */ }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [match]);

  const onlineViewProps = battle && match ? {
    battle,
    beforeStep,
    deployImpl: (card: string, x: number, z: number) => sendDeploy(card, x, z),
    signalFx: fxSig.n > 0 ? fxSig : null,
  } : null;

  return { match, myTeam, battle, started, ending, onlineViewProps, sendDeploy, signalFx };
}

function pendingReplace(pending: DeployedMsg[], yourTeam: TeamId): void {
  pendingDue.length = 0;
  for (const p of pending) {
    pendingDue.push({
      ...p,
      player: (p.player === yourTeam ? 0 : 1) as 0 | 1,
      z: yourTeam === 0 ? p.z : 32 - p.z,
    });
  }
  pendingDue.sort((a, b) => a.executeTick - b.executeTick || a.seq - b.seq);
}
