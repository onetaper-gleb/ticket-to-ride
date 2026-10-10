import { describe, expect, it } from 'vitest';
import { createGame, getObservation } from '../core';
import type { TableView } from './interaction';
import { PerspectiveCamera, Vector3 } from 'three';
import { TABLE_CAMERA, TABLE_LAYOUT, tableOverviewFit } from './table-layout';
import {
  accumulateMovement,
  buildZoneLayouts,
  canReleasePress,
  emptyMovement,
  interactionAllowed,
  permittedPointerZone,
  pointerZone,
  reconcileOption,
  returnFocusZone,
  stepOption,
  type ZoneOption,
  type InputPolicy,
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

  it.each([16 / 9, 16 / 10, 21 / 9, 814 / 914])(
    'reaches physical controls with aspect %s',
    (aspect) => {
      const camera = new PerspectiveCamera(43, aspect, 0.1, 180);
      camera.position.fromArray(TABLE_CAMERA.overview.position);
      const target = new Vector3().fromArray(TABLE_CAMERA.overview.target);
      camera.position.sub(target).multiplyScalar(tableOverviewFit(aspect)).add(target);
      camera.lookAt(target);
      camera.updateMatrixWorld(true);
      const screen = (x: number, z: number) => {
        const p = new Vector3(x, -0.75, z).project(camera);
        return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 };
      };
      const bell = screen(TABLE_LAYOUT.bell.x, TABLE_LAYOUT.bell.z);
      for (const previous of ['neutral', 'hand', 'paper'] as const)
        expect(pointerZone(bell.x, bell.y, previous, aspect)).toBe('dock');
      const tickets = screen(TABLE_LAYOUT.goals.x, TABLE_LAYOUT.goals.z);
      expect(pointerZone(tickets.x, tickets.y, 'deck', aspect)).toBe('goals');
    },
  );

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
