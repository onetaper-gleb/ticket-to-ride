import { describe, expect, it } from 'vitest';
import { applyCommand, createGame, getLegalCommands, getObservation } from '../core';
import type { GameCommand, GameState, TrainOrder } from '../shared/types';
import { getTutorialLesson, tutorialCommandAllowed } from './tutorial';

const firstOrder: TrainOrder = {
  mode: 'evacuate',
  destination: 'market',
  returnTo: 'hill',
  repeat: false,
};

function accept(state: GameState, command: GameCommand): GameState {
  const transition = applyCommand(state, command);
  expect(transition.error, JSON.stringify(command)).toBeUndefined();
  return transition.state;
}

function instructorToHuman(state: GameState): GameState {
  let current = state;
  for (let attempts = 0; current.activePlayer !== 0 && attempts < 8; attempts++) {
    const observation = getObservation(current, current.activePlayer);
    const command: GameCommand =
      current.phase === 'setup'
        ? getLegalCommands(observation)[0]!
        : current.phase === 'action'
          ? { type: 'pass' }
          : { type: 'endTurn' };
    current = accept(current, command);
  }
  expect(current.activePlayer).toBe(0);
  return current;
}

function acceptHuman(state: GameState, command: GameCommand): GameState {
  expect(tutorialCommandAllowed(getObservation(state, 0), command)).toBe(true);
  return accept(state, command);
}

function ready(): GameState {
  const state = createGame({ seed: 'first-rescue-v1', playerCount: 2 });
  return instructorToHuman(
    acceptHuman(state, {
      type: 'chooseObjectives',
      districts: state.players[0]!.objectiveOptions.slice(0, 2),
    }),
  );
}

describe('first rescue tutorial', () => {
  it('teaches with real commands and finishes only after the first delivery', () => {
    let state = createGame({ seed: 'first-rescue-v1', playerCount: 2 });
    expect(getTutorialLesson(getObservation(state, 0)).id).toBe('objectives');
    state = instructorToHuman(
      acceptHuman(state, {
        type: 'chooseObjectives',
        districts: state.players[0]!.objectiveOptions.slice(0, 2),
      }),
    );
    expect(getTutorialLesson(getObservation(state, 0)).id).toBe('first-material');
    const initialHand = state.players[0]!.hand.length;
    state = acceptHuman(state, { type: 'draw', source: 'deck' });
    expect(getTutorialLesson(getObservation(state, 0)).id).toBe('second-material');
    state = acceptHuman(state, { type: 'draw', source: 'deck' });
    expect(state.players[0]!.hand).toHaveLength(initialHand + 2);
    expect(getTutorialLesson(getObservation(state, 0)).id).toBe('first-order');

    state = acceptHuman(state, { type: 'order', trainId: 'p0-t1', order: firstOrder });
    expect(getTutorialLesson(getObservation(state, 0)).id).toBe('first-departure');
    expect(state.trains.find((train) => train.id === 'p0-t1')!.stationId).toBe('hill');
    state = instructorToHuman(acceptHuman(state, { type: 'endTurn' }));
    expect(state.round).toBe(2);
    expect(state.players[0]!.delivered).toHaveLength(0);
    expect(state.players[0]!.score).toBe(0);
    expect(state.trains.find((train) => train.id === 'p0-t1')!.cargo).toHaveLength(2);
    expect(getTutorialLesson(getObservation(state, 0)).id).toBe('loaded');
    expect(getTutorialLesson(getObservation(state, 0)).complete).toBe(false);

    state = acceptHuman(state, { type: 'pass' });
    expect(getTutorialLesson(getObservation(state, 0)).id).toBe('return-home');
    state = instructorToHuman(acceptHuman(state, { type: 'endTurn' }));
    expect(state.round).toBe(3);
    expect(state.players[0]!.delivered).toHaveLength(2);
    expect(state.trains.find((train) => train.id === 'p0-t1')!.stationId).toBe('hill');
    const lesson = getTutorialLesson(getObservation(state, 0));
    expect(lesson.complete).toBe(true);
    expect(lesson.step).toBe(lesson.total);
    expect(lesson.text).toContain(`Ваш счёт — ${state.players[0]!.score}`);
    expect(tutorialCommandAllowed(getObservation(state, 0), { type: 'pass' })).toBe(false);
  });

  it('rejects distractions and incomplete orders without blocking the intended route', () => {
    let state = ready();
    let observation = getObservation(state, 0);
    expect(tutorialCommandAllowed(observation, { type: 'draw', source: 0 })).toBe(false);
    expect(tutorialCommandAllowed(observation, { type: 'pass' })).toBe(false);
    expect(tutorialCommandAllowed(observation, { type: 'repair', edgeId: 'hill-orchard' })).toBe(
      false,
    );
    expect(tutorialCommandAllowed(observation, { type: 'express', trainId: 'p0-t1' })).toBe(false);
    state = acceptHuman(state, { type: 'draw', source: 'deck' });
    state = acceptHuman(state, { type: 'draw', source: 'deck' });
    observation = getObservation(state, 0);
    expect(tutorialCommandAllowed(observation, { type: 'endTurn' })).toBe(false);
    for (const order of [
      { ...firstOrder, returnTo: 'upper' },
      { ...firstOrder, destination: 'school' },
      { ...firstOrder, repeat: true },
      { ...firstOrder, confirmRisk: true },
      { ...firstOrder, mode: 'position' as const },
    ])
      expect(tutorialCommandAllowed(observation, { type: 'order', trainId: 'p0-t1', order })).toBe(
        false,
      );
    expect(
      tutorialCommandAllowed(observation, { type: 'order', trainId: 'p0-t2', order: firstOrder }),
    ).toBe(false);
    state = acceptHuman(state, { type: 'order', trainId: 'p0-t1', order: firstOrder });
    observation = getObservation(state, 0);
    expect(tutorialCommandAllowed(observation, { type: 'endTurn' })).toBe(true);
    expect(
      tutorialCommandAllowed(observation, { type: 'order', trainId: 'p0-t1', order: firstOrder }),
    ).toBe(false);
  });

  it('restores the correct lesson from accepted state, including the second draw', () => {
    let state = ready();
    state = acceptHuman(state, { type: 'draw', source: 'deck' });
    const restored = JSON.parse(JSON.stringify(state)) as GameState;
    expect(getTutorialLesson(getObservation(restored, 0))).toEqual(
      getTutorialLesson(getObservation(state, 0)),
    );
    expect(getTutorialLesson(getObservation(restored, 0)).id).toBe('second-material');
    const next = acceptHuman(restored, { type: 'draw', source: 'deck' });
    expect(getTutorialLesson(getObservation(next, 0)).id).toBe('first-order');
  });

  it('never enables human commands during instructor turns', () => {
    const state = createGame({ seed: 'first-rescue-v1', playerCount: 2 });
    const instructor = acceptHuman(state, {
      type: 'chooseObjectives',
      districts: state.players[0]!.objectiveOptions.slice(0, 2),
    });
    const observation = getObservation(instructor, 0);
    expect(getTutorialLesson(observation).id).toBe('instructor-setup-empty');
    expect(tutorialCommandAllowed(observation, { type: 'pass' })).toBe(false);
    expect(tutorialCommandAllowed(observation, { type: 'draw', source: 'deck' })).toBe(false);
  });
});
