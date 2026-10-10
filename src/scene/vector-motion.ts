export type Direction = 'left' | 'right' | 'up' | 'down';
export type GestureAxis = 'horizontal' | 'vertical';
export type GestureState = {
  x: number;
  y: number;
  axis: GestureAxis | null;
  lastEventAt: number | null;
};
export type GestureThresholds = number | Partial<Record<Direction, number>>;

export const OPTION_GESTURE_THRESHOLD = 48;
export const COLLECTION_GESTURE_THRESHOLD = 144;
export const GESTURE_IDLE_MS = 240;
const AXIS_DEADZONE = 4;
const AXIS_DOMINANCE = 1.4;

export const emptyGesture = (): GestureState => ({ x: 0, y: 0, axis: null, lastEventAt: null });

function dominantAxis(x: number, y: number): GestureAxis | null {
  if (!x && !y) return null;
  if (Math.abs(x) >= Math.abs(y) * AXIS_DOMINANCE) return 'horizontal';
  if (Math.abs(y) >= Math.abs(x) * AXIS_DOMINANCE) return 'vertical';
  return null;
}

const addDirectional = (previous: number, delta: number) =>
  (previous && delta && Math.sign(previous) !== Math.sign(delta) ? 0 : previous) + delta;

/** Relative displacement only; the caller owns focus, policy and action confirmation. */
export function feedGesture(
  previous: GestureState,
  dx: number,
  dy: number,
  nowMs: number,
  thresholds: GestureThresholds = OPTION_GESTURE_THRESHOLD,
): { state: GestureState; direction: Direction | null } {
  if (![dx, dy, nowMs].every(Number.isFinite)) return { state: emptyGesture(), direction: null };
  const isEvent = !!(dx || dy);
  let state = { ...previous };
  if (
    state.lastEventAt !== null &&
    (nowMs < state.lastEventAt || nowMs - state.lastEventAt >= GESTURE_IDLE_MS)
  )
    state = emptyGesture();

  if (isEvent) {
    const incomingAxis = dominantAxis(dx, dy);
    // A fresh diagonal has no selection intent and cannot spend the previous gesture's credit.
    if (state.axis && !incomingAxis) state = emptyGesture();
    if (
      !state.axis &&
      Math.max(Math.abs(state.x), Math.abs(state.y)) >= AXIS_DEADZONE &&
      !dominantAxis(state.x, state.y) &&
      incomingAxis
    )
      state = emptyGesture();

    if (state.axis === 'horizontal' && incomingAxis === 'vertical') {
      state.y = addDirectional(state.y, dy);
      if (Math.abs(state.y) >= AXIS_DEADZONE) {
        state.x = 0;
        state.axis = 'vertical';
      }
    } else if (state.axis === 'vertical' && incomingAxis === 'horizontal') {
      state.x = addDirectional(state.x, dx);
      if (Math.abs(state.x) >= AXIS_DEADZONE) {
        state.y = 0;
        state.axis = 'horizontal';
      }
    } else {
      state.x = addDirectional(state.x, dx);
      state.y = addDirectional(state.y, dy);
      if (!state.axis && Math.max(Math.abs(state.x), Math.abs(state.y)) >= AXIS_DEADZONE)
        state.axis = dominantAxis(state.x, state.y);
      // Small cross-axis motion follows the same path without accumulating diagonal drift.
      if (state.axis === 'horizontal') state.y = 0;
      if (state.axis === 'vertical') state.x = 0;
    }
    state.lastEventAt = nowMs;
  }

  const axis = state.axis;
  const displacement = axis === 'horizontal' ? state.x : state.y;
  const direction: Direction | null = !axis
    ? null
    : axis === 'horizontal'
      ? displacement < 0
        ? 'left'
        : 'right'
      : displacement < 0
        ? 'up'
        : 'down';
  const requestedThreshold =
    typeof thresholds === 'number' ? thresholds : direction ? thresholds[direction] : undefined;
  if (requestedThreshold === Infinity)
    return { state: { ...emptyGesture(), lastEventAt: state.lastEventAt }, direction: null };
  const threshold =
    requestedThreshold && Number.isFinite(requestedThreshold) && requestedThreshold > 0
      ? requestedThreshold
      : OPTION_GESTURE_THRESHOLD;
  if (!direction || Math.abs(displacement) + 1e-9 < threshold) return { state, direction: null };

  if (axis === 'horizontal') state.x -= Math.sign(displacement) * threshold;
  else state.y -= Math.sign(displacement) * threshold;
  if (Math.abs(state.x) < 1e-9) state.x = 0;
  if (Math.abs(state.y) < 1e-9) state.y = 0;
  if (!state.x && !state.y) state.axis = null;
  return { state, direction };
}
