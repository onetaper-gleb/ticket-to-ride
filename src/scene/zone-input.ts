import type { Observation } from '../shared/types';
import type { TableInteraction, TableView } from './interaction';
import { OPTION_GESTURE_THRESHOLD, COLLECTION_GESTURE_THRESHOLD } from './vector-motion';

export type FocusZone = 'neutral' | 'deck' | 'hand' | 'goals' | 'paper' | 'dock';
export type OptionZone = Exclude<FocusZone, 'neutral'>;
export type InputPolicy = {
  allowedZones: FocusZone[];
  boardAllowed: boolean;
  returnZone?: FocusZone;
};
export type ZoneOption = {
  interaction: TableInteraction;
  enabled: boolean;
  column: number;
  row: number;
};
export type ZoneLayouts = Record<OptionZone, ZoneOption[]>;
export type Direction = 'left' | 'right' | 'up' | 'down';
export const interactionKey = (interaction: TableInteraction) =>
  `${interaction.kind}:${interaction.id}`;

export const zoneAllowed = (zone: FocusZone, policy?: InputPolicy): boolean =>
  !policy || policy.allowedZones.includes(zone);

export function returnFocusZone(previous: FocusZone, policy?: InputPolicy): FocusZone {
  if (policy?.returnZone && zoneAllowed(policy.returnZone, policy)) return policy.returnZone;
  if (zoneAllowed(previous, policy)) return previous;
  return policy?.allowedZones[0] ?? 'neutral';
}

export function permittedPointerZone(
  candidate: FocusZone,
  previous: FocusZone,
  policy?: InputPolicy,
): FocusZone {
  if (zoneAllowed(candidate, policy)) return candidate;
  return zoneAllowed(previous, policy) ? previous : returnFocusZone(previous, policy);
}

export function interactionZone(interaction: TableInteraction, view: TableView): OptionZone | null {
  if (interaction.kind === 'card') return 'hand';
  if (interaction.kind === 'market' || interaction.kind === 'deck') return 'deck';
  if (interaction.kind === 'objective') return 'goals';
  if (interaction.kind === 'control') {
    const control = view.controls.find((item) => item.id === interaction.id);
    return control?.placement === 'dock' || control?.placement === 'bell' ? 'dock' : 'paper';
  }
  return null;
}

export function interactionAllowed(
  interaction: TableInteraction,
  view: TableView,
  policy?: InputPolicy,
): boolean {
  if (!policy) return true;
  if (interaction.kind === 'control' && interaction.id === 'menu') return true;
  if (interaction.kind === 'control' && interaction.id === 'plan') return policy.boardAllowed;
  const zone = interactionZone(interaction, view);
  return zone ? zoneAllowed(zone, policy) : policy.boardAllowed;
}

export function buildZoneLayouts(observation: Observation, view: TableView): ZoneLayouts {
  const option = (
    interaction: TableInteraction,
    enabled: boolean,
    column: number,
    row = 0,
  ): ZoneOption => ({ interaction, enabled, column, row });
  const paper = view.controls.filter(
    (control) => !control.placement || control.placement === 'paper',
  );
  const bells = view.controls.filter((control) => control.placement === 'bell');
  const dock = view.controls.filter((control) => control.placement === 'dock');
  return {
    deck: [
      ...observation.market.map((_, index) =>
        option(
          { kind: 'market', id: String(index) },
          view.enabledMarketIndices.includes(index),
          index % 2,
          Math.floor(index / 2),
        ),
      ),
      option({ kind: 'deck', id: 'deck' }, view.deckEnabled, 1, 2),
    ],
    hand: observation.self.hand.length
      ? observation.self.hand.map((card, index) =>
          option({ kind: 'card', id: card.id }, true, index),
        )
      : [option({ kind: 'card', id: 'empty-hand' }, false, 0)],
    goals: view.goals.map((goal, index) =>
      option({ kind: 'objective', id: goal.id }, goal.enabled, index),
    ),
    paper: paper.length
      ? paper.map((control, index) =>
          option(
            { kind: 'control', id: control.id },
            control.enabled,
            index % 2,
            Math.floor(index / 2),
          ),
        )
      : [option({ kind: 'control', id: 'inspectPaper' }, false, 0)],
    dock: [
      ...bells.map((control, index) =>
        option({ kind: 'control', id: control.id }, control.enabled, index, 0),
      ),
      ...dock.map((control, index) =>
        option({ kind: 'control', id: control.id }, control.enabled, index + 1, 1),
      ),
    ],
  };
}

export function reconcileOption(options: ZoneOption[], previous?: ZoneOption): ZoneOption | null {
  if (!options.length) return null;
  if (previous) {
    const remembered = options.find(
      (option) => interactionKey(option.interaction) === interactionKey(previous.interaction),
    );
    if (remembered) return remembered;
    // A discarded card disappears; retain the nearest place in the remaining hand.
    return [...options].sort(
      (a, b) =>
        Math.abs(a.column - previous.column) +
        Math.abs(a.row - previous.row) -
        Math.abs(b.column - previous.column) -
        Math.abs(b.row - previous.row),
    )[0]!;
  }
  return options.find((option) => option.enabled) ?? options[0]!;
}

export function stepOption(
  options: ZoneOption[],
  selected: ZoneOption,
  direction: Direction,
): ZoneOption {
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const primary = (option: ZoneOption) =>
    (horizontal ? option.column - selected.column : option.row - selected.row) * sign;
  const sideways = (option: ZoneOption) =>
    Math.abs(horizontal ? option.row - selected.row : option.column - selected.column);
  return (
    options
      .filter((option) => primary(option) > 0)
      .sort((a, b) => primary(a) - primary(b) || sideways(a) - sideways(b))[0] ?? selected
  );
}

const collectionPositions: Record<FocusZone, [number, number]> = {
  neutral: [0, 0],
  deck: [-1, 0],
  goals: [-1, 1],
  hand: [0, 1],
  paper: [1, 0],
  dock: [1, 1],
};

export function neighborFocusZone(
  zone: FocusZone,
  direction: Direction,
  policy?: InputPolicy,
): FocusZone {
  const horizontal = direction === 'left' || direction === 'right';
  const sign = direction === 'left' || direction === 'up' ? -1 : 1;
  const [x, y] = collectionPositions[zone];
  return (
    (Object.keys(collectionPositions) as FocusZone[])
      .filter((candidate) => zoneAllowed(candidate, policy) && candidate !== zone)
      .map((candidate) => {
        const [cx, cy] = collectionPositions[candidate];
        const forward = (horizontal ? cx - x : cy - y) * sign;
        const side = Math.abs(horizontal ? cy - y : cx - x);
        return { candidate, forward, side };
      })
      .filter(({ forward, side }) => forward > 0 && side <= forward * 1.25)
      .sort((a, b) => a.forward + a.side * 1.5 - (b.forward + b.side * 1.5))[0]?.candidate ?? zone
  );
}

export function gestureThresholds(
  zone: FocusZone,
  selected: ZoneOption | null,
  layouts: ZoneLayouts,
  policy?: InputPolicy,
): Record<Direction, number> {
  return Object.fromEntries(
    (['left', 'right', 'up', 'down'] as Direction[]).map((direction) => [
      direction,
      zone !== 'neutral' && selected && stepOption(layouts[zone], selected, direction) !== selected
        ? OPTION_GESTURE_THRESHOLD
        : neighborFocusZone(zone, direction, policy) !== zone
          ? COLLECTION_GESTURE_THRESHOLD
          : Infinity,
    ]),
  ) as Record<Direction, number>;
}

export function canReleasePress(
  press: {
    x: number;
    y: number;
    dragged: boolean;
    revision: number;
    inputEpoch?: number;
    cameraReady?: boolean;
  },
  x: number,
  y: number,
  revision: number,
  inputEpoch?: number,
): boolean {
  return (
    !press.dragged &&
    press.cameraReady !== false &&
    press.revision === revision &&
    press.inputEpoch === inputEpoch &&
    Math.hypot(press.x - x, press.y - y) <= 6
  );
}
