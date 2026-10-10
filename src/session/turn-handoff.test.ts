import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, getLegalCommands, getObservation } from '../core';
import type { GameCommand, GameState } from '../shared/types';
import { getTurnAcknowledgement, restoreTurnAcknowledgement } from './turn-handoff';

function start(): GameState {
  let state = createGame({ seed: 'europe-first-route-v1', playerCount: 2 });
  while (state.phase === 'setup') {
    state = applyCommand(state, {
      type: 'chooseTickets',
      ticketIds: state.players[state.activePlayer]!.ticketOptions.slice(0, 2).map(
        (ticket) => ticket.id,
      ),
    }).state;
  }
  return state;
}

describe('explicit UI turn handoff', () => {
  it('pauses only after the complete draw and restores that pause with the accepted match', () => {
    const state = start();
    const first = applyCommand(state, { type: 'draw', source: 'deck' });
    expect(first.state.phase).toBe('draw');
    expect(getTurnAcknowledgement(state, first)).toBeNull();
    const second = applyCommand(first.state, { type: 'draw', source: 'deck' });
    const pending = getTurnAcknowledgement(first.state, second);
    expect(pending).toEqual({ revision: second.state.revision, message: 'Добор карт завершён.' });
    expect(second.state.activePlayer).toBe(1);
    const saved = JSON.parse(JSON.stringify({ state: second.state, pending }));
    expect(restoreTurnAcknowledgement(saved.state, saved.pending)).toEqual(pending);
    expect(restoreTurnAcknowledgement(second.state)).toBeNull();
    expect(
      restoreTurnAcknowledgement({ ...second.state, revision: second.state.revision + 1 }, pending),
    ).toBeNull();
  });
  it('does not pause preparation, ticket offer, invalid commands, or bots', () => {
    const setup = createGame({ seed: 'handoff-setup' });
    const accepted = applyCommand(setup, {
      type: 'chooseTickets',
      ticketIds: setup.players[0]!.ticketOptions.slice(0, 2).map((ticket) => ticket.id),
    });
    expect(getTurnAcknowledgement(setup, accepted)).toBeNull();
    const state = start();
    expect(
      getTurnAcknowledgement(state, applyCommand(state, { type: 'chooseTickets', ticketIds: [] })),
    ).toBeNull();
    const offered = applyCommand(state, { type: 'drawTickets' });
    expect(offered.state.phase).toBe('tickets');
    expect(getTurnAcknowledgement(state, offered)).toBeNull();
    const kept = applyCommand(offered.state, {
      type: 'chooseTickets',
      ticketIds: offered.state.players[0]!.ticketOptions.slice(0, 1).map((ticket) => ticket.id),
    });
    expect(getTurnAcknowledgement(offered.state, kept)?.revision).toBe(kept.state.revision);
    const bot = kept.state;
    const command = getLegalCommands(getObservation(bot, bot.activePlayer)).find(
      (item) => item.type === 'claim',
    )!;
    expect(getTurnAcknowledgement(bot, applyCommand(bot, command))).toBeNull();
  });
  it('waits for tunnel resolution but pauses a claim, station, or declined tunnel', () => {
    const state = start();
    for (const type of ['claim', 'buildStation'] as const) {
      const command = getLegalCommands(getObservation(state, 0)).find(
        (item) => item.type === type,
      )!;
      const accepted = applyCommand(state, command);
      expect(accepted.error).toBeUndefined();
      expect(getTurnAcknowledgement(state, accepted)?.revision).toBe(accepted.state.revision);
    }
    const tunnelState = { ...state, players: state.players.map((player) => ({ ...player })) };
    const tunnel =
      tunnelState.edges.find((edge) => edge.id === 'smyrna--constantinople-1') ??
      tunnelState.edges.find((edge) => edge.tunnel && edge.color === 'gray' && edge.length === 2)!;
    const command: GameCommand = {
      type: 'claim',
      edgeId: tunnel.id,
      cardIds: state.players[0]!.hand.filter((card) => card.color === 'white')
        .slice(0, 2)
        .map((card) => card.id),
    };
    const attempt = applyCommand(tunnelState, command);
    expect(attempt.error).toBeUndefined();
    if (attempt.state.phase === 'tunnel') {
      expect(getTurnAcknowledgement(tunnelState, attempt)).toBeNull();
      const declined = applyCommand(attempt.state, { type: 'resolveTunnel', pay: false });
      expect(getTurnAcknowledgement(attempt.state, declined)?.revision).toBe(
        declined.state.revision,
      );
    } else {
      expect(getTurnAcknowledgement(tunnelState, attempt)).not.toBeNull();
    }
  });
  it('shows the final result directly without leaving an impossible handoff', () => {
    const state = { ...start(), finalTurnsRemaining: 1 };
    const command = getLegalCommands(getObservation(state, 0)).find(
      (item) => item.type === 'claim',
    )!;
    const finished = applyCommand(state, command);
    expect(finished.state.phase).toBe('finished');
    expect(getTurnAcknowledgement(state, finished)).toBeNull();
    expect(
      restoreTurnAcknowledgement(finished.state, {
        revision: finished.state.revision,
        message: 'old',
      }),
    ).toBeNull();
  });
});
