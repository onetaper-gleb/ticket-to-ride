import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, getGameResult, getLegalCommands, getObservation } from '../core';
import { chooseBotCommand } from './index';
import type { BotDifficulty } from '../shared/types';

describe('fair deterministic Europe policy', () => {
  it('cannot read hidden deck, random state, opponents hands or ticket destinations', () => {
    let state = createGame({ seed: 'bot-isolation', playerCount: 3 });
    while (state.phase === 'setup')
      state = applyCommand(
        state,
        chooseBotCommand(getObservation(state, state.activePlayer)),
      ).state;
    const hidden = structuredClone(state);
    hidden.rng = 0;
    hidden.seed = 'another-hidden-seed';
    hidden.deck.reverse();
    hidden.ticketDeck.reverse();
    for (const player of hidden.players) {
      if (player.id === state.activePlayer) continue;
      player.hand = player.hand.map((card) => ({ id: `secret-${card.id}`, color: 'wild' }));
      player.tickets = player.tickets.map((ticket) => ({
        ...ticket,
        a: 'london',
        b: 'moskva',
        points: 30,
      }));
    }
    const first = getObservation(state, state.activePlayer),
      second = getObservation(hidden, hidden.activePlayer);
    expect(first).toEqual(second);
    expect(chooseBotCommand(first)).toEqual(chooseBotCommand(second));
    expect(first).not.toHaveProperty('deck');
    expect(first).not.toHaveProperty('rng');
    expect(first.players[1]).not.toHaveProperty('tickets');
  });
  it('leaves observations unchanged and selects a command from the legal authority', () => {
    const observation = getObservation(createGame({ seed: 'bot-mutation', playerCount: 2 }), 0),
      before = structuredClone(observation);
    const command = chooseBotCommand(observation);
    expect(observation).toEqual(before);
    expect(chooseBotCommand(observation)).toEqual(command);
    expect(getLegalCommands(observation)).toContainEqual(command);
  });
  for (const difficulty of ['easy', 'normal'] as BotDifficulty[]) {
    for (const playerCount of [2, 3, 4, 5] as const) {
      it(`completes ${playerCount}-player ${difficulty} games using only legal commands`, () => {
        let state = createGame({ seed: `finite-${difficulty}-${playerCount}`, playerCount });
        let commands = 0;
        while (state.phase !== 'finished') {
          const observation = getObservation(state, state.activePlayer);
          const command = chooseBotCommand(observation, difficulty);
          expect(getLegalCommands(observation)).toContainEqual(command);
          const transition = applyCommand(state, command);
          expect(transition.error, `turn ${state.turn} ${JSON.stringify(command)}`).toBeUndefined();
          expect(transition.state.revision).toBe(state.revision + 1);
          state = transition.state;
          expect(++commands).toBeLessThan(1500);
        }
        expect(state.players.some((player) => player.trainsRemaining <= 2)).toBe(true);
        expect(getGameResult(state).standings.some((standing) => standing.winner)).toBe(true);
      }, 20000);
    }
  }
});
