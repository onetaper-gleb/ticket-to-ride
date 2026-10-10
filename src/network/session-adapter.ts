import type { AppProps } from '../shared/types';
import type { ExpectedCommand, NetworkClientApi } from './protocol';

/** Maps a server observation to the existing physical game. Does not own a core state. */
export function networkGameProps(
  client: NetworkClientApi,
  sessionId: number,
): Pick<
  AppProps,
  | 'sessionId'
  | 'observation'
  | 'result'
  | 'busy'
  | 'pendingTurn'
  | 'error'
  | 'difficulty'
  | 'tutorial'
  | 'onCommand'
  | 'onEndTurn'
  | 'onClearError'
> {
  const state = client.getState();
  const snapshot = state.snapshot;
  const authority = snapshot?.authority;
  const member = snapshot?.room.members.find((item) => item.id === snapshot.memberId);
  const shown: ExpectedCommand | null =
    authority && member
      ? {
          matchId: authority.matchId,
          seatId: member.seatId,
          revision: authority.revision,
          turnId: authority.turnId,
          controlEpoch: authority.controlEpoch,
        }
      : null;
  const ready = state.connection === 'connected' && !state.pendingCommand && !state.pendingRequest;
  return {
    sessionId,
    observation: snapshot?.observation ?? null,
    result: snapshot?.result ?? null,
    busy: !ready || !snapshot?.canAct,
    pendingTurn: snapshot?.pendingTurn ?? null,
    error: state.error,
    difficulty: snapshot?.room.settings.difficulty ?? 'normal',
    tutorial: false,
    onCommand(command, expected) {
      return (
        expected.sessionId === sessionId &&
        !!shown &&
        expected.revision === shown.revision &&
        client.command(command, shown)
      );
    },
    onEndTurn(expected) {
      if (expected.sessionId === sessionId && shown && expected.revision === shown.revision)
        client.command({ type: 'endTurn' }, shown);
    },
    onClearError: () => client.clearError(),
  };
}
