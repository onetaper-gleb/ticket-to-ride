import { describe, expect, it } from 'vitest';
import { createGame, getObservation } from '../core';
import type { TableView } from './interaction';
import { emptyGesture, feedGesture } from './vector-motion';
import {
  buildZoneLayouts,
  canReleasePress,
  gestureThresholds,
  interactionAllowed,
  neighborFocusZone,
  permittedPointerZone,
  reconcileOption,
  returnFocusZone,
  stepOption,
  type ZoneOption,
  type InputPolicy,
} from './zone-input';

describe('table regions and relative selection', () => {
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
    expect(canReleasePress({ ...press, cameraReady: false }, 100, 100, 12)).toBe(false);
    expect(canReleasePress({ ...press, inputEpoch: 3 }, 100, 100, 12, 4)).toBe(false);
    expect(canReleasePress({ ...press, inputEpoch: 3 }, 100, 100, 12, 3)).toBe(true);
  });

  it('keeps a permitted focus when the pointer enters an unavailable tutorial region', () => {
    const policy: InputPolicy = {
      allowedZones: ['goals', 'paper'],
      boardAllowed: true,
      returnZone: 'goals',
    };
    expect(permittedPointerZone('deck', 'paper', policy)).toBe('paper');
    expect(permittedPointerZone('neutral', 'goals', policy)).toBe('goals');
    expect(permittedPointerZone('paper', 'goals', policy)).toBe('paper');
    expect(permittedPointerZone('deck', 'deck', policy)).toBe('goals');
    expect(returnFocusZone('paper', policy)).toBe('goals');
    expect(returnFocusZone('hand')).toBe('hand');
    expect(returnFocusZone('hand', { allowedZones: ['deck'], boardAllowed: false })).toBe('deck');
  });

  it('reaches permitted collections by direction without passing through forbidden ones', () => {
    const tickets: InputPolicy = {
      allowedZones: ['goals', 'paper'],
      boardAllowed: true,
      returnZone: 'goals',
    };
    expect(neighborFocusZone('goals', 'right', tickets)).toBe('paper');
    expect(neighborFocusZone('paper', 'left', tickets)).toBe('goals');
    expect(neighborFocusZone('goals', 'left', tickets)).toBe('goals');
    expect(neighborFocusZone('neutral', 'left')).toBe('deck');
    expect(neighborFocusZone('neutral', 'right')).toBe('paper');
    expect(neighborFocusZone('neutral', 'down')).toBe('hand');
    expect(neighborFocusZone('hand', 'left')).toBe('goals');
    expect(neighborFocusZone('hand', 'right')).toBe('dock');
    expect(neighborFocusZone('hand', 'up')).toBe('neutral');
  });

  it('requires a deliberate longer gesture to leave the selected collection at its edge', () => {
    const ticketChoices: ZoneOption[] = ['one', 'two', 'three', 'four'].map((id, column) => ({
      interaction: { kind: 'objective', id },
      enabled: true,
      column,
      row: 0,
    }));
    const layouts = { deck: [], hand: [], goals: ticketChoices, paper: [], dock: [] };
    const policy: InputPolicy = { allowedZones: ['goals', 'paper'], boardAllowed: true };
    expect(gestureThresholds('goals', ticketChoices[0]!, layouts, policy).right).toBe(48);
    expect(gestureThresholds('goals', ticketChoices[3]!, layouts, policy).right).toBe(144);
    expect(gestureThresholds('goals', ticketChoices[0]!, layouts, policy).left).toBe(Infinity);
    expect(gestureThresholds('neutral', null, layouts).right).toBe(144);
  });

  it('crosses a large hand consistently for one long event or many short events', () => {
    const cards: ZoneOption[] = Array.from({ length: 50 }, (_, column) => ({
      interaction: { kind: 'card', id: String(column) },
      enabled: true,
      column,
      row: 0,
    }));
    const layouts = { deck: [], hand: cards, goals: [], paper: [], dock: [] };
    const policy: InputPolicy = { allowedZones: ['hand'], boardAllowed: false };
    const run = (deltas: number[]) => {
      let gesture = emptyGesture();
      let selected = cards[0]!;
      for (const dx of deltas) {
        let next = feedGesture(
          gesture,
          dx,
          0,
          10,
          gestureThresholds('hand', selected, layouts, policy),
        );
        while (next.direction) {
          selected = stepOption(cards, selected, next.direction);
          next = feedGesture(
            next.state,
            0,
            0,
            10,
            gestureThresholds('hand', selected, layouts, policy),
          );
        }
        gesture = next.state;
      }
      return selected.interaction.id;
    };
    expect(run([48 * 45])).toBe('45');
    expect(run(Array(45).fill(48))).toBe('45');
  });

  it('applies the same tutorial limits to logical and accessible interactions', () => {
    const view: TableView = {
      headline: '',
      notice: '',
      detailLines: [],
      controls: [
        { id: 'acceptTickets', label: '', enabled: true },
        { id: 'drawTickets', label: '', enabled: true, placement: 'bell' },
        { id: 'menu', label: '', enabled: true, placement: 'dock' },
        { id: 'plan', label: '', enabled: true, placement: 'dock' },
      ],
      goals: [],
      routeStationIds: [],
      enabledMarketIndices: [],
      deckEnabled: true,
      enabledEdgeIds: [],
      selectedCardIds: [],
    };
    const policy: InputPolicy = { allowedZones: ['goals', 'paper'], boardAllowed: false };
    expect(interactionAllowed({ kind: 'objective', id: 'ticket' }, view, policy)).toBe(true);
    expect(interactionAllowed({ kind: 'control', id: 'acceptTickets' }, view, policy)).toBe(true);
    expect(interactionAllowed({ kind: 'control', id: 'drawTickets' }, view, policy)).toBe(false);
    expect(interactionAllowed({ kind: 'control', id: 'menu' }, view, policy)).toBe(true);
    expect(interactionAllowed({ kind: 'control', id: 'plan' }, view, policy)).toBe(false);
    expect(
      interactionAllowed({ kind: 'control', id: 'plan' }, view, { ...policy, boardAllowed: true }),
    ).toBe(true);
    for (const kind of ['deck', 'market', 'card', 'edge', 'station'] as const)
      expect(interactionAllowed({ kind, id: 'item' }, view, policy)).toBe(false);
    expect(
      interactionAllowed({ kind: 'edge', id: 'route' }, view, { ...policy, boardAllowed: true }),
    ).toBe(true);
  });
});
