import type { GameState, Transition, TurnAcknowledgement } from '../shared/types';

export function getTurnAcknowledgement(
  previous: GameState,
  transition: Transition,
): TurnAcknowledgement | null {
  const next = transition.state;
  if (
    transition.error ||
    previous.activePlayer !== 0 ||
    previous.phase === 'setup' ||
    next.phase === 'finished' ||
    next.turn === previous.turn
  )
    return null;
  const event = [...transition.events]
    .reverse()
    .find((item) => item.playerId === 0 && item.kind !== 'turn');
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
): TurnAcknowledgement | null {
  return pending &&
    pending.revision === state.revision &&
    state.activePlayer !== 0 &&
    state.phase !== 'finished' &&
    typeof pending.message === 'string'
    ? pending
    : null;
}
