import type { TurnGuard } from './rooms';

interface TimerPort {
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}
export function createTurnTimers(
  tick: (roomId: string, guard: TurnGuard) => Promise<void>,
  port: TimerPort = {
    set: (callback, delay) => setTimeout(callback, delay),
    clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  },
) {
  const handles = new Map<string, unknown>(),
    versions = new Map<string, number>(),
    guards = new Map<string, TurnGuard>();
  let closed = false;
  const schedule = (roomId: string, guard: TurnGuard, delayMs: number) => {
    if (closed) return;
    const previous = handles.get(roomId);
    const current = guards.get(roomId);
    if (
      previous !== undefined &&
      current?.turnId === guard.turnId &&
      current.controlEpoch === guard.controlEpoch &&
      current.revision === guard.revision
    )
      return;
    if (previous !== undefined) port.clear(previous);
    guard = { ...guard };
    guards.set(roomId, guard);
    const version = (versions.get(roomId) ?? 0) + 1;
    versions.set(roomId, version);
    handles.set(
      roomId,
      port.set(() => {
        if (closed || versions.get(roomId) !== version) return;
        handles.delete(roomId);
        void Promise.resolve()
          .then(() => tick(roomId, guard))
          .catch(() => {
            // A delayed failed tick cannot replace the timer for a newer committed revision.
            if (!closed && versions.get(roomId) === version) schedule(roomId, guard, 1000);
          });
      }, delayMs),
    );
  };
  return {
    schedule,
    close() {
      closed = true;
      for (const handle of handles.values()) port.clear(handle);
      handles.clear();
      versions.clear();
      guards.clear();
    },
  };
}
