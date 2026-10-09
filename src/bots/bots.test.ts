import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, getObservation } from '../core';
import { chooseBotCommand } from './index';
import type { BotDifficulty } from '../shared/types';

describe('fair deterministic bot policy', () => {
  it('does not read hidden deck order, random state or other private hands', () => {
    let state = createGame({ seed: 'bot-isolation', playerCount: 3 });
    while (state.phase === 'setup')
      state = applyCommand(state, {
        type: 'chooseObjectives',
        districts: state.players[state.activePlayer]!.objectiveOptions.slice(0, 2),
      }).state;
    const hiddenVariant = structuredClone(state);
    hiddenVariant.rng = 0;
    hiddenVariant.seed = 'another-hidden-seed';
    hiddenVariant.deck.reverse();
    for (const player of hiddenVariant.players) {
      if (player.id === state.activePlayer) continue;
      player.hand = player.hand.map((card) => ({ id: `hidden-${card.id}`, color: 'wild' }));
      player.objectives.reverse();
    }
    const first = getObservation(state, state.activePlayer),
      second = getObservation(hiddenVariant, hiddenVariant.activePlayer);
    expect(second).toEqual(first);
    expect(chooseBotCommand(second)).toEqual(chooseBotCommand(first));
    expect(first).not.toHaveProperty('rng');
    expect(first).not.toHaveProperty('deck');
    expect(first.players[1]).not.toHaveProperty('hand');
  });

  it('leaves the observation unchanged during planning', () => {
    let state = createGame({ seed: 'bot-observation', playerCount: 2 });
    while (state.phase === 'setup')
      state = applyCommand(state, {
        type: 'chooseObjectives',
        districts: state.players[state.activePlayer]!.objectiveOptions.slice(0, 2),
      }).state;
    const observation = getObservation(state, state.activePlayer),
      before = structuredClone(observation);
    chooseBotCommand(observation);
    expect(observation).toEqual(before);
  });

  for (const difficulty of ['easy', 'normal'] as BotDifficulty[]) {
    for (const playerCount of [2, 3, 4] as const) {
      it(`completes a ${playerCount}-brigade ${difficulty} match with legal commands`, () => {
        let state = createGame({ seed: `bot-finite-${difficulty}-${playerCount}`, playerCount });
        const seen = new Set<string>();
        let commands = 0;
        while (state.phase !== 'finished') {
          const signature = `${state.round}:${state.activePlayer}:${state.phase}:${JSON.stringify(state.trains.map((train) => train.order))}:${state.drawsRemaining}`;
          // Repeated accepted train-order configuration within the same orders phase reveals a policy cycle.
          if (state.phase === 'orders') {
            expect(seen.has(signature)).toBe(false);
            seen.add(signature);
          }
          const transition = applyCommand(
            state,
            chooseBotCommand(getObservation(state, state.activePlayer), difficulty),
          );
          expect(transition.error).toBeUndefined();
          expect(transition.state.revision).toBeGreaterThan(state.revision);
          state = transition.state;
          expect(++commands).toBeLessThan(1000);
        }
        expect(state.round).toBeLessThanOrEqual(12);
        expect(
          state.players.reduce((sum, player) => sum + player.delivered.length, 0),
        ).toBeGreaterThan(0);
      });
    }
  }
});
