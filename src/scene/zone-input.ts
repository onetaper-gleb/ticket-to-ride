import type { Observation } from '../shared/types';
import type { TableInteraction, TableView } from './interaction';

export type FocusZone = 'neutral' | 'deck' | 'hand' | 'goals' | 'paper' | 'dock';
export type OptionZone = Exclude<FocusZone, 'neutral'>;
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

// The region chooses a collection. Individual choices never depend on a hidden hit point.
export function pointerZone(x: number, y: number, previous: FocusZone): FocusZone {
  const bounds: Record<OptionZone, [number, number, number, number]> = {
    deck: [0, 0.32, 0.27, 0.76],
    hand: [0.32, 0.68, 0.76, 1],
    goals: [0, 0.32, 0.76, 1],
    paper: [0.71, 1, 0.24, 0.76],
    dock: [0.68, 1, 0.76, 1],
  };
  if (previous !== 'neutral') {
    const [left, right, top, bottom] = bounds[previous];
    const margin = 0.035;
    if (x >= left - margin && x <= right + margin && y >= top - margin && y <= bottom + margin)
      return previous;
  }
  for (const [zone, [left, right, top, bottom]] of Object.entries(bounds))
    if (x >= left && x <= right && y >= top && y <= bottom) return zone as OptionZone;
  return 'neutral';
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

export type RelativeMovement = { x: number; y: number };
export const emptyMovement = (): RelativeMovement => ({ x: 0, y: 0 });
export function accumulateMovement(
  movement: RelativeMovement,
  dx: number,
  dy: number,
  threshold = 64,
): { movement: RelativeMovement; direction: Direction | null } {
  const x = (movement.x && dx && Math.sign(movement.x) !== Math.sign(dx) ? 0 : movement.x) + dx;
  const y = (movement.y && dy && Math.sign(movement.y) !== Math.sign(dy) ? 0 : movement.y) + dy;
  if (Math.max(Math.abs(x), Math.abs(y)) < threshold)
    return { movement: { x, y }, direction: null };
  const direction = Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : y < 0 ? 'up' : 'down';
  // Consume the whole gesture, including at an edge. Reversal never inherits stale displacement.
  return { movement: emptyMovement(), direction };
}

export function canReleasePress(
  press: { x: number; y: number; dragged: boolean; revision: number },
  x: number,
  y: number,
  revision: number,
): boolean {
  return !press.dragged && press.revision === revision && Math.hypot(press.x - x, press.y - y) <= 6;
}
