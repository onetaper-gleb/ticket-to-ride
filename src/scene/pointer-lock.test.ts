import { describe, expect, it, vi } from 'vitest';
import {
  createPointerLockController,
  measureRelativePress,
  type PointerLockState,
} from './pointer-lock';

function deferred() {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function setup(request: () => void | Promise<void> = () => {}) {
  let owner: 'none' | 'ours' | 'foreign' = 'none';
  const notifications: PointerLockState[] = [];
  const exit = vi.fn(() => {
    owner = 'none';
  });
  const requestPort = vi.fn(request);
  const controller = createPointerLockController(
    { isLocked: () => owner === 'ours', request: requestPort, exit },
    (state) => notifications.push(state),
  );
  return {
    controller,
    notifications,
    exit,
    requestPort,
    setOwner: (next: typeof owner) => {
      owner = next;
    },
  };
}

describe('pointer lock lifecycle', () => {
  it('waits for document change even after a resolved request promise', async () => {
    const pending = deferred();
    const lock = setup(() => pending.promise);
    expect(lock.controller.state).toBe('released');
    expect(lock.requestPort).not.toHaveBeenCalled();
    lock.controller.request();
    lock.controller.request();
    expect(lock.requestPort).toHaveBeenCalledTimes(1);
    lock.setOwner('ours');
    pending.resolve();
    await Promise.resolve();
    expect(lock.controller.state).toBe('requesting');
    lock.controller.changed();
    expect(lock.controller.state).toBe('locked');
    expect(lock.notifications).toEqual(['requesting', 'locked']);
  });

  it('accepts legacy void requests and never recaptures after native unlock', () => {
    const lock = setup();
    lock.controller.request();
    expect(lock.controller.state).toBe('requesting');
    lock.setOwner('ours');
    lock.controller.changed();
    lock.setOwner('none');
    lock.controller.changed();
    expect(lock.controller.state).toBe('released');
    expect(lock.requestPort).toHaveBeenCalledTimes(1);
    expect(lock.notifications).toEqual(['requesting', 'locked', 'released']);
  });

  it('returns to error after a synchronous throw or rejection without claiming lock', async () => {
    const thrown = setup(() => {
      throw new Error('blocked');
    });
    thrown.controller.request();
    thrown.controller.failed();
    expect(thrown.controller.state).toBe('error');
    expect(thrown.notifications).toEqual(['requesting', 'error']);
    expect(thrown.exit).not.toHaveBeenCalled();

    const pending = deferred();
    const rejected = setup(() => pending.promise);
    rejected.controller.request();
    pending.reject();
    await Promise.resolve();
    expect(rejected.controller.state).toBe('error');
    rejected.controller.failed();
    expect(rejected.notifications).toEqual(['requesting', 'error']);
  });

  it('cancels a pending request and releases a late legacy acquisition', () => {
    const lock = setup();
    lock.controller.request();
    lock.controller.release();
    lock.setOwner('ours');
    lock.controller.changed();
    lock.controller.changed();
    expect(lock.controller.state).toBe('released');
    expect(lock.notifications).toEqual(['requesting', 'released']);
    expect(lock.exit).toHaveBeenCalledTimes(1);
    expect(lock.requestPort).toHaveBeenCalledTimes(1);
  });

  it('cannot let an obsolete rejection cancel a newer explicit request', async () => {
    const old = deferred();
    const current = deferred();
    let requests = 0;
    const lock = setup(() => (++requests === 1 ? old.promise : current.promise));
    lock.controller.request();
    lock.controller.release();
    lock.controller.request();
    lock.controller.failed();
    expect(lock.controller.state).toBe('requesting');
    old.reject();
    await Promise.resolve();
    expect(lock.controller.state).toBe('requesting');
    expect(lock.notifications).toEqual(['requesting', 'released', 'requesting']);
    lock.setOwner('ours');
    lock.controller.changed();
    current.reject();
    await Promise.resolve();
    expect(lock.controller.state).toBe('locked');
    expect(lock.exit).not.toHaveBeenCalled();
  });

  it('reports a duplicate event and promise failure once, and permits an explicit retry', async () => {
    const pending = deferred();
    const lock = setup();
    lock.requestPort.mockReturnValueOnce(pending.promise);
    lock.controller.request();
    lock.controller.failed();
    lock.controller.failed();
    expect(lock.controller.state).toBe('requesting');
    pending.reject();
    await Promise.resolve();
    expect(lock.notifications).toEqual(['requesting', 'error']);
    lock.controller.request();
    expect(lock.controller.state).toBe('requesting');
    expect(lock.requestPort).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale DOM error during a newer Promise request even before the old rejection', async () => {
    const old = deferred();
    const current = deferred();
    let requests = 0;
    const lock = setup(() => (++requests === 1 ? old.promise : current.promise));
    lock.controller.request();
    lock.controller.release();
    lock.controller.request();
    lock.controller.failed();
    expect(lock.controller.state).toBe('requesting');
    old.reject();
    await Promise.resolve();
    lock.controller.failed();
    expect(lock.controller.state).toBe('requesting');
    current.reject();
    await Promise.resolve();
    expect(lock.controller.state).toBe('error');
    expect(lock.notifications).toEqual(['requesting', 'released', 'requesting', 'error']);
  });

  it('serializes cancelled legacy requests until their error and requires another explicit retry', () => {
    const lock = setup();
    lock.controller.request();
    lock.controller.release();
    expect(lock.controller.pending).toBe(true);
    lock.controller.request();
    expect(lock.requestPort).toHaveBeenCalledTimes(1);
    expect(lock.controller.state).toBe('released');
    lock.controller.failed();
    expect(lock.controller.pending).toBe(false);
    expect(lock.controller.state).toBe('released');
    expect(lock.requestPort).toHaveBeenCalledTimes(1);
    lock.controller.request();
    expect(lock.requestPort).toHaveBeenCalledTimes(2);
    expect(lock.controller.state).toBe('requesting');
  });

  it('does not recapture after a cancelled legacy request eventually acquires', () => {
    const lock = setup();
    lock.controller.request();
    lock.controller.release();
    lock.controller.request();
    lock.setOwner('ours');
    lock.controller.changed();
    expect(lock.controller.pending).toBe(false);
    expect(lock.controller.state).toBe('released');
    expect(lock.exit).toHaveBeenCalledTimes(1);
    expect(lock.requestPort).toHaveBeenCalledTimes(1);
    lock.controller.request();
    expect(lock.requestPort).toHaveBeenCalledTimes(2);
  });

  it('reports one legacy error and retains a disposed cancellation until its terminal error', () => {
    const failed = setup();
    failed.controller.request();
    failed.controller.failed();
    failed.controller.failed();
    expect(failed.controller.state).toBe('error');
    expect(failed.notifications).toEqual(['requesting', 'error']);
    const disposed = setup();
    disposed.controller.request();
    disposed.controller.release();
    disposed.controller.dispose();
    expect(disposed.controller.pending).toBe(true);
    disposed.controller.failed();
    expect(disposed.controller.pending).toBe(false);
    expect(disposed.controller.state).toBe('released');
  });

  it('does not release another element or accept its change as successful acquisition', () => {
    const lock = setup();
    lock.controller.request();
    lock.setOwner('foreign');
    lock.controller.changed();
    expect(lock.controller.state).toBe('requesting');
    lock.controller.release();
    lock.controller.dispose();
    lock.controller.changed();
    expect(lock.exit).not.toHaveBeenCalled();
    expect(lock.controller.state).toBe('released');
  });

  it('releases its own lock once and ignores an error after the confirmed change', () => {
    const lock = setup();
    lock.controller.request();
    lock.setOwner('ours');
    lock.controller.changed();
    lock.controller.failed();
    expect(lock.controller.state).toBe('locked');
    lock.controller.release();
    lock.controller.release();
    expect(lock.exit).toHaveBeenCalledTimes(1);
    expect(lock.notifications).toEqual(['requesting', 'locked', 'released']);
  });

  it('disposes pending control and cleans a late promise acquisition without confirming it', async () => {
    const pending = deferred();
    const lock = setup(() => pending.promise);
    lock.controller.request();
    lock.controller.dispose();
    lock.controller.request();
    lock.setOwner('ours');
    pending.resolve();
    await Promise.resolve();
    expect(lock.controller.state).toBe('released');
    expect(lock.exit).toHaveBeenCalledTimes(1);
    expect(lock.requestPort).toHaveBeenCalledTimes(1);
    expect(lock.notifications).toEqual(['requesting', 'released']);
  });

  it('also releases late legacy acquisition when the retained change guard runs after disposal', () => {
    const lock = setup();
    lock.controller.request();
    lock.controller.dispose();
    lock.setOwner('ours');
    lock.controller.changed();
    expect(lock.controller.state).toBe('released');
    expect(lock.exit).toHaveBeenCalledTimes(1);
  });
});

describe('relative press distance under pointer lock', () => {
  it('rejects an outward gesture and return even when the net displacement is zero', () => {
    const outward = measureRelativePress({ distance: 0, dragged: false }, 4, 0);
    expect(outward.dragged).toBe(false);
    const returned = measureRelativePress(outward, -4, 0);
    expect(returned).toEqual({ distance: 8, dragged: true });
    expect(measureRelativePress(returned, 0, 0).dragged).toBe(true);
  });

  it('adds short diagonal segments instead of relying on unchanged client coordinates', () => {
    let press = { distance: 0, dragged: false };
    for (let i = 0; i < 4; i++) press = measureRelativePress(press, 1, 1);
    expect(press.dragged).toBe(false);
    press = measureRelativePress(press, 1, 1);
    expect(press.distance).toBeCloseTo(5 * Math.SQRT2);
    expect(press.dragged).toBe(true);
  });

  it('retains the same straight path threshold across event partitions', () => {
    const initial = { distance: 0, dragged: false };
    let split = initial;
    for (let i = 0; i < 6; i++) split = measureRelativePress(split, 1, 0);
    expect(split).toEqual(measureRelativePress(initial, 6, 0));
    expect(split.dragged).toBe(false);
    expect(measureRelativePress(split, 0.1, 0).dragged).toBe(true);
    expect(measureRelativePress(initial, Number.NaN, 0).dragged).toBe(true);
  });
});
