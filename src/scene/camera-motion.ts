// Exponential smoothing preserves the same motion duration at every display refresh rate.
export function motionBlend(elapsedSeconds: number, timeConstant = 0.12, reducedMotion = false) {
  if (reducedMotion) return 1;
  return 1 - Math.exp(-Math.max(0, elapsedSeconds) / timeConstant);
}

/** Only the base focus transition gates a click; mouse look may still be moving. */
export function cameraFocusReady(
  positionErrorSquared: number,
  targetErrorSquared: number,
): boolean {
  return (
    positionErrorSquared >= 0 &&
    positionErrorSquared < 0.09 &&
    targetErrorSquared >= 0 &&
    targetErrorSquared < 0.01
  );
}

export type MouseLook = { impulseX: number; impulseY: number; x: number; y: number };
export const emptyMouseLook = (): MouseLook => ({ impulseX: 0, impulseY: 0, x: 0, y: 0 });
export const MOUSE_LOOK_GAIN = 1 / 160;
export const MOUSE_LOOK_DECAY_SECONDS = 0.22;
export const MOUSE_LOOK_RESPONSE_SECONDS = 0.035;

const bounded = (value: number) => Math.max(-1, Math.min(1, value));

/** Add displacement after advancing to the event timestamp; never use the cursor position. */
export function addMouseLook(
  state: MouseLook,
  dx: number,
  dy: number,
  reducedMotion = false,
): MouseLook {
  if (reducedMotion || !Number.isFinite(dx) || !Number.isFinite(dy)) return emptyMouseLook();
  return {
    ...state,
    impulseX: bounded(state.impulseX + dx * MOUSE_LOOK_GAIN),
    impulseY: bounded(state.impulseY + dy * MOUSE_LOOK_GAIN),
  };
}

/** Exact solution of a decaying impulse filtered by a short response time. */
export function advanceMouseLook(
  state: MouseLook,
  elapsedSeconds: number,
  reducedMotion = false,
): MouseLook {
  if (reducedMotion) return emptyMouseLook();
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return { ...state };
  const decayRate = 1 / MOUSE_LOOK_DECAY_SECONDS;
  const responseRate = 1 / MOUSE_LOOK_RESPONSE_SECONDS;
  const impulseDecay = Math.exp(-elapsedSeconds * decayRate);
  const responseDecay = Math.exp(-elapsedSeconds * responseRate);
  const transfer = (responseRate * (impulseDecay - responseDecay)) / (responseRate - decayRate);
  return {
    impulseX: state.impulseX * impulseDecay,
    impulseY: state.impulseY * impulseDecay,
    x: bounded(state.x * responseDecay + state.impulseX * transfer),
    y: bounded(state.y * responseDecay + state.impulseY * transfer),
  };
}
