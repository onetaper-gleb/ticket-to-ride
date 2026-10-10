import type { AppProps } from '../shared/types';
import type { NetworkClientApi } from './protocol';

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
      return expected.sessionId === sessionId && client.command(command, expected.revision);
    },
    onEndTurn(expected) {
      if (expected.sessionId === sessionId) client.command({ type: 'endTurn' }, expected.revision);
    },
    onClearError: () => client.clearError(),
  };
}
