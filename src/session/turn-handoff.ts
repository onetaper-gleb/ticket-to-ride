import type { GameState, Transition, TurnAcknowledgement } from '../shared/types';

export function getTurnAcknowledgement(
  previous: GameState,
  transition: Transition,
  playerId = 0,
): TurnAcknowledgement | null {
  const next = transition.state;
  if (
    transition.error ||
    previous.activePlayer !== playerId ||
    previous.phase === 'setup' ||
    next.phase === 'finished' ||
    next.turn === previous.turn
  )
    return null;
  const event = [...transition.events]
    .reverse()
    .find((item) => item.playerId === playerId && item.kind !== 'turn');
  return {
    revision: next.revision,
    message:
      event?.kind === 'draw'
        ? 'Добор карт завершён.'
        : (event?.message ?? 'Вы выполнили действие этого хода.'),
  };
}

export function restoreTurnAcknowledgement(
  state: GameState,
  pending?: TurnAcknowledgement | null,
  playerId = 0,
): TurnAcknowledgement | null {
  return pending &&
    pending.revision === state.revision &&
    state.activePlayer !== playerId &&
    state.phase !== 'finished' &&
    typeof pending.message === 'string'
    ? pending
    : null;
}
