import { describe, expect, it } from 'vitest';
import { createGame, getObservation } from '../core';
import type { TableView } from './interaction';
import {
  accumulateMovement,
  buildZoneLayouts,
  canReleasePress,
  emptyMovement,
  pointerZone,
  reconcileOption,
  stepOption,
  type ZoneOption,
} from './zone-input';

describe('table regions and relative selection', () => {
  it('keeps the neutral table free and gives borders a hysteresis band', () => {
    expect(pointerZone(0.5, 0.5, 'neutral')).toBe('neutral');
    expect(pointerZone(0.2, 0.5, 'neutral')).toBe('deck');
    expect(pointerZone(0.34, 0.5, 'deck')).toBe('deck');
    expect(pointerZone(0.4, 0.5, 'deck')).toBe('neutral');
    expect(pointerZone(0.2, 0.9, 'neutral')).toBe('goals');
    expect(pointerZone(0.5, 0.9, 'neutral')).toBe('hand');
    expect(pointerZone(0.9, 0.9, 'neutral')).toBe('dock');
  });

  it('accumulates slow movement, ignores small jitter and resets after edge gestures', () => {
    let movement = emptyMovement();
    for (let i = 0; i < 63; i++) {
      const next = accumulateMovement(movement, 1, 0);
      expect(next.direction).toBeNull();
      movement = next.movement;
    }
    const step = accumulateMovement(movement, 1, 0);
    expect(step.direction).toBe('right');
    expect(accumulateMovement(step.movement, -5, 0).direction).toBeNull();
    expect(accumulateMovement({ x: 60, y: 0 }, -6, 0).movement.x).toBe(-6);
  });

  const choices: ZoneOption[] = Array.from({ length: 6 }, (_, index) => ({
    interaction: { kind: 'market', id: String(index) },
    enabled: index !== 0,
    column: index % 2,
    row: Math.floor(index / 2),
  }));
  it('defaults to a legal choice, allows unavailable inspection, and moves by logical rows', () => {
    expect(reconcileOption(choices)?.interaction.id).toBe('1');
    const middleRight = choices[3]!;
    expect(stepOption(choices, middleRight, 'up').interaction.id).toBe('1');
    expect(stepOption(choices, middleRight, 'left').interaction.id).toBe('2');
    expect(stepOption(choices, choices[1]!, 'left').interaction.id).toBe('0');
    expect(stepOption(choices, choices[0]!, 'left')).toBe(choices[0]);
    expect(reconcileOption(choices, choices[0])?.interaction.id).toBe('0');
  });

  it('retains a remembered item by ID and clamps after a card disappears', () => {
    const hand: ZoneOption[] = ['a', 'b', 'c'].map((id, column) => ({
      interaction: { kind: 'card', id },
      enabled: true,
      row: 0,
      column,
    }));
    const remaining = [hand[0]!, { ...hand[2]!, column: 1 }];
    expect(reconcileOption(remaining, hand[1])?.interaction.id).toBe('c');
    expect(reconcileOption(remaining, hand[2])?.column).toBe(1);
  });

  it('supplies an inspectable paper and empty hand and matches the physical stock grid', () => {
    const observation = getObservation(createGame({ playerCount: 2, seed: 'regions' }), 0);
    observation.self.hand = [];
    const view: TableView = {
      headline: '',
      notice: '',
      detailLines: [],
      controls: [],
      goals: [],
      routeStationIds: [],
      enabledMarketIndices: [1, 4],
      deckEnabled: true,
      enabledEdgeIds: [],
      selectedCardIds: [],
    };
    const layouts = buildZoneLayouts(observation, view);
    expect(layouts.deck).toHaveLength(6);
    expect(layouts.deck[5]).toMatchObject({ interaction: { kind: 'deck' }, column: 1, row: 2 });
    expect(layouts.paper[0]).toMatchObject({ enabled: false, interaction: { id: 'inspectPaper' } });
    expect(layouts.hand[0]).toMatchObject({ enabled: false, interaction: { id: 'empty-hand' } });
  });

  it('rejects a replaced market slot and a drag even after returning to the start', () => {
    const press = { x: 100, y: 100, dragged: false, revision: 12 };
    expect(canReleasePress(press, 101, 101, 12)).toBe(true);
    expect(canReleasePress(press, 101, 101, 13)).toBe(false);
    expect(canReleasePress({ ...press, dragged: true }, 100, 100, 12)).toBe(false);
    expect(canReleasePress(press, 110, 100, 12)).toBe(false);
  });
});
