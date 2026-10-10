import { describe, expect, it } from 'vitest';
import { createTurnTimers } from './timers';
import type { TurnGuard } from './rooms';

const guard = (revision: number): TurnGuard => ({ turnId: 'turn', controlEpoch: 1, revision });
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};
function port() {
  let next = 0;
  const pending = new Map<number, { callback: () => void; delay: number }>();
  return {
    pending,
    set: (callback: () => void, delay: number) => {
      const id = ++next;
      pending.set(id, { callback, delay });
      return id;
    },
    clear: (id: unknown) => {
      pending.delete(id as number);
    },
    fire(id: number) {
      const timer = pending.get(id)!;
      pending.delete(id);
      timer.callback();
    },
  };
}

describe('guarded room timers', () => {
  it('keeps the original deadline for an unchanged full guard and replaces it for each changed field', () => {
    const clock = port(),
      timers = createTurnTimers(async () => {}, clock);
    timers.schedule('room', guard(1), 180);
    timers.schedule('room', { ...guard(1) }, 180);
    expect([...clock.pending.keys()]).toEqual([1]);
    timers.schedule('room', { ...guard(1), controlEpoch: 2 }, 180);
    expect([...clock.pending.keys()]).toEqual([2]);
    timers.schedule('room', { ...guard(1), controlEpoch: 2, turnId: 'next' }, 180);
    expect([...clock.pending.keys()]).toEqual([3]);
    timers.schedule('room', { ...guard(2), controlEpoch: 2, turnId: 'next' }, 180);
    expect([...clock.pending.keys()]).toEqual([4]);
    timers.close();
  });
  it('retains a newer room timer when an older async tick later fails', async () => {
    const clock = port(),
      called: number[] = [];
    let reject!: (reason: Error) => void;
    const old = new Promise<void>((_resolve, rejectPromise) => {
      reject = rejectPromise;
    });
    const timers = createTurnTimers(async (_room, g) => {
      called.push(g.revision);
      if (g.revision === 1) await old;
    }, clock);
    timers.schedule('room', guard(1), 10);
    clock.fire(1);
    await flush();
    timers.schedule('room', guard(2), 20);
    reject(new Error('Transient database failure'));
    await flush();
    expect([...clock.pending.keys()]).toEqual([2]);
    expect(clock.pending.get(2)!.delay).toBe(20);
    clock.fire(2);
    await flush();
    expect(called).toEqual([1, 2]);
    timers.close();
  });
  it('retries only the still-current failed tick and cancels retry when closed', async () => {
    const clock = port();
    let calls = 0;
    const timers = createTurnTimers(async () => {
      calls++;
      throw new Error('Storage unavailable');
    }, clock);
    timers.schedule('room', guard(1), 10);
    clock.fire(1);
    await flush();
    expect(calls).toBe(1);
    expect(clock.pending.get(2)!.delay).toBe(1000);
    timers.close();
    expect(clock.pending.size).toBe(0);
    timers.schedule('room', guard(2), 10);
    expect(clock.pending.size).toBe(0);
  });
  it('keeps independent room timers and clears only the replaced room', () => {
    const clock = port(),
      timers = createTurnTimers(async () => {}, clock);
    timers.schedule('a', guard(1), 10);
    timers.schedule('b', guard(1), 20);
    timers.schedule('a', guard(2), 30);
    expect([...clock.pending.keys()]).toEqual([2, 3]);
    timers.close();
    expect(clock.pending.size).toBe(0);
  });
});
