export type PointerLockState = 'released' | 'requesting' | 'locked' | 'error';
export type PointerLockPort = {
  isLocked: () => boolean;
  request: () => void | Promise<void>;
  exit: () => void;
};
export type PointerLockController = {
  readonly state: PointerLockState;
  readonly pending: boolean;
  request: () => void;
  changed: () => void;
  failed: () => void;
  release: () => void;
  dispose: () => void;
};

export type RelativePressMotion = { distance: number; dragged: boolean };

export function measureRelativePress(
  previous: RelativePressMotion,
  dx: number,
  dy: number,
): RelativePressMotion {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return { ...previous, dragged: true };
  const distance = previous.distance + Math.hypot(dx, dy);
  return { distance, dragged: previous.dragged || distance > 6 };
}

export function createPointerLockController(
  port: PointerLockPort,
  onState: (state: PointerLockState) => void,
): PointerLockController {
  let state: PointerLockState = 'released';
  let generation = 0;
  let wanted = false;
  let disposed = false;
  type RequestAttempt = { generation: number; settled: boolean };
  let currentAttempt: RequestAttempt | null = null;
  let legacyAttempt: RequestAttempt | null = null;

  const settle = (attempt: RequestAttempt | null) => {
    if (!attempt) return;
    attempt.settled = true;
    if (currentAttempt === attempt) currentAttempt = null;
    if (legacyAttempt === attempt) legacyAttempt = null;
  };

  const publish = (next: PointerLockState) => {
    if (next === state) return;
    state = next;
    onState(state);
  };
  const exitOwnedLock = () => {
    if (port.isLocked()) {
      settle(currentAttempt);
      settle(legacyAttempt);
      port.exit();
    }
  };
  const fail = (requestGeneration: number) => {
    if (disposed || requestGeneration !== generation || state !== 'requesting' || port.isLocked())
      return;
    wanted = false;
    generation++;
    publish('error');
  };
  const cancel = () => {
    wanted = false;
    generation++;
    publish('released');
    exitOwnedLock();
  };

  return {
    get state() {
      return state;
    },
    get pending() {
      return legacyAttempt !== null || state === 'requesting';
    },
    request() {
      if (disposed || legacyAttempt || state === 'requesting' || state === 'locked') return;
      wanted = true;
      const requestGeneration = ++generation;
      publish('requesting');
      if (disposed || !wanted || requestGeneration !== generation) return;
      const attempt: RequestAttempt = { generation: requestGeneration, settled: false };
      currentAttempt = attempt;
      try {
        const pending = port.request();
        if (pending)
          void pending.then(
            () => {
              settle(attempt);
              // Promise completion never grants control; only discard a cancelled acquisition.
              if (disposed || !wanted) exitOwnedLock();
            },
            () => {
              settle(attempt);
              fail(requestGeneration);
            },
          );
        else if (!attempt.settled) legacyAttempt = attempt;
      } catch {
        settle(attempt);
        fail(requestGeneration);
      }
    },
    changed() {
      if (port.isLocked()) {
        if (disposed || !wanted) {
          exitOwnedLock();
          return;
        }
        settle(currentAttempt);
        settle(legacyAttempt);
        generation++;
        publish('locked');
      } else if (state === 'locked') cancel();
    },
    failed() {
      // DOM errors have no request ID; only a serialized legacy request can own this event.
      if (!legacyAttempt) return;
      const attempt = legacyAttempt;
      settle(attempt);
      fail(attempt.generation);
    },
    release() {
      cancel();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
    },
  };
}
