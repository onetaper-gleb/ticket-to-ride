import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyCommand, createGame } from '../core';
import type { GameState } from '../shared/types';
import type { Save } from './storage';
import { getTurnAcknowledgement } from './turn-handoff';

const DB = 'last-train-europe-v1';
const key = (slot: string) => `${DB}-journal-${slot}`;
const clock = Date.parse('2026-10-10T10:00:01.000Z');

function actionState(): GameState {
  let state = createGame({ seed: 'europe-first-route-v1', playerCount: 2 });
  while (state.phase === 'setup')
    state = applyCommand(state, {
      type: 'chooseTickets',
      ticketIds: state.players[state.activePlayer]!.ticketOptions.slice(0, 2).map(
        (item) => item.id,
      ),
    }).state;
  return state;
}

function saved(state = actionState(), timestamp = clock - 1000): Save {
  return {
    schemaVersion: 2,
    savedAt: new Date(timestamp).toISOString(),
    difficulty: 'normal',
    state,
  };
}

function installStorage() {
  const journal = new Map<string, string>();
  const database = new Map<string, Save>();
  const pending: { save: Save; slot: string; transaction: IDBTransaction }[] = [];
  const failures: {
    read?: Error;
    write?: Error;
    remove?: Error;
    database?: Error;
    blockedOpen?: boolean;
    blockedRead?: boolean;
  } = {};
  const local = {
    getItem: vi.fn((name: string) => {
      if (failures.read) throw failures.read;
      return journal.get(name) ?? null;
    }),
    setItem: vi.fn((name: string, value: string) => {
      if (failures.write) throw failures.write;
      journal.set(name, value);
    }),
    removeItem: vi.fn((name: string) => {
      if (failures.remove) throw failures.remove;
      journal.delete(name);
    }),
  };
  const indexed = {
    open: vi.fn(() => {
      const request = {} as IDBOpenDBRequest;
      queueMicrotask(() => {
        if (failures.blockedOpen) return;
        if (failures.database) {
          Object.assign(request, { error: failures.database });
          request.onerror?.(new Event('error'));
          return;
        }
        const db = {
          close: vi.fn(),
          transaction: () => {
            const transaction = {
              objectStore: () => ({
                put: (save: Save, slot: string) => {
                  pending.push({ save: structuredClone(save), slot, transaction });
                },
                get: (slot: string) => {
                  const read = {} as IDBRequest;
                  queueMicrotask(() => {
                    if (failures.blockedRead) return;
                    Object.assign(read, { result: structuredClone(database.get(slot)) });
                    read.onsuccess?.(new Event('success'));
                  });
                  return read;
                },
              }),
            } as unknown as IDBTransaction;
            return transaction;
          },
        };
        Object.assign(request, { result: db });
        request.onsuccess?.(new Event('success'));
      });
      return request;
    }),
  };
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('indexedDB', indexed);
  const finishWrite = (error?: Error) => {
    const write = pending.shift()!;
    if (error) {
      Object.assign(write.transaction, { error });
      write.transaction.onabort?.(new Event('abort'));
    } else {
      database.set(write.slot, write.save);
      write.transaction.oncomplete?.(new Event('complete'));
    }
  };
  const waitForWrite = () => vi.waitFor(() => expect(pending).toHaveLength(1));
  return { journal, database, pending, failures, indexed, finishWrite, waitForWrite };
}

async function reloadModule() {
  vi.resetModules();
  return import('./storage');
}

describe('reload-safe match persistence', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(clock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('restores the accepted second-draw obligation after reload before the IDB commit', async () => {
    const env = installStorage();
    const before = actionState();
    env.database.set('tutorial', saved(before));
    const next = applyCommand(before, { type: 'draw', source: 'deck' }).state;
    const storage = await import('./storage');
    const writing = storage.saveMatch(next, 'easy', 'tutorial');
    expect(JSON.parse(env.journal.get(key('tutorial'))!).state.phase).toBe('draw');
    expect(env.database.get('tutorial')!.state.phase).toBe('action');
    await env.waitForWrite();
    const reloaded = await reloadModule();
    const restored = await reloaded.loadMatch(next.rulesVersion, 'tutorial');
    expect(restored?.state).toEqual(next);
    expect(restored?.state.drawsRemaining).toBe(1);
    env.finishWrite();
    await writing;
  });

  it('keeps current and tutorial snapshots independent, including the pending End acknowledgement', async () => {
    const env = installStorage();
    const current = createGame({ seed: 'ordinary-save' });
    const first = applyCommand(actionState(), { type: 'draw', source: 'deck' }).state;
    const second = applyCommand(first, { type: 'draw', source: 'deck' });
    const pendingTurn = getTurnAcknowledgement(first, second);
    const storage = await import('./storage');
    const currentWrite = storage.saveMatch(current, 'normal');
    const tutorialWrite = storage.saveMatch(second.state, 'easy', 'tutorial', pendingTurn);
    const reloaded = await reloadModule();
    expect(await reloaded.loadMatch(current.rulesVersion)).toMatchObject({
      state: current,
      difficulty: 'normal',
      pendingTurn: null,
    });
    expect(await reloaded.loadMatch(current.rulesVersion, 'tutorial')).toMatchObject({
      state: second.state,
      difficulty: 'easy',
      pendingTurn,
    });
    await env.waitForWrite();
    env.finishWrite();
    await currentWrite;
    await env.waitForWrite();
    env.finishWrite();
    await tutorialWrite;
  });

  it('does not clear a newer journal when an older queued write commits', async () => {
    const env = installStorage();
    const old = actionState();
    const next = applyCommand(old, { type: 'draw', source: 'deck' }).state;
    const storage = await import('./storage');
    const oldWrite = storage.saveMatch(old, 'normal');
    await env.waitForWrite();
    const newWrite = storage.saveMatch(next, 'normal');
    const newest = env.journal.get(key('current'));
    env.finishWrite();
    await oldWrite;
    expect(env.journal.get(key('current'))).toBe(newest);
    expect(env.database.get('current')!.state).toEqual(old);
    const reloaded = await reloadModule();
    expect((await reloaded.loadMatch(next.rulesVersion))?.state).toEqual(next);
    await env.waitForWrite();
    env.finishWrite();
    await newWrite;
    expect(env.journal.has(key('current'))).toBe(false);
    expect(env.database.get('current')!.state).toEqual(next);
  });

  it('recovers an acknowledged End at the same game revision', async () => {
    const env = installStorage();
    const first = applyCommand(actionState(), { type: 'draw', source: 'deck' }).state;
    const second = applyCommand(first, { type: 'draw', source: 'deck' });
    const pendingTurn = getTurnAcknowledgement(first, second);
    env.database.set('current', { ...saved(second.state), pendingTurn });
    const storage = await import('./storage');
    const writing = storage.saveMatch(second.state, 'normal', 'current', null);
    const reloaded = await reloadModule();
    expect((await reloaded.loadMatch(second.state.rulesVersion))?.pendingTurn).toBeNull();
    await env.waitForWrite();
    env.finishWrite();
    await writing;
  });

  it('keeps the journal after an IDB abort and can restore it when IDB is unavailable', async () => {
    const env = installStorage();
    const state = actionState();
    const storage = await import('./storage');
    const writing = storage.saveMatch(state, 'normal');
    const rejected = expect(writing).rejects.toThrow('IDB write failed');
    await env.waitForWrite();
    env.finishWrite(new Error('IDB write failed'));
    await rejected;
    expect(env.journal.has(key('current'))).toBe(true);
    env.failures.database = new Error('IDB unavailable');
    const reloaded = await reloadModule();
    expect((await reloaded.loadMatch(state.rulesVersion))?.state).toEqual(state);
  });

  it.each(['open', 'read'])(
    'restores the journal within a bound when IDB %s hangs',
    async (kind) => {
      const env = installStorage();
      const snapshot = saved();
      env.journal.set(key('current'), JSON.stringify(snapshot));
      if (kind === 'open') env.failures.blockedOpen = true;
      else env.failures.blockedRead = true;
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      const storage = await import('./storage');
      const loading = storage.loadMatch(snapshot.state.rulesVersion);
      await vi.advanceTimersByTimeAsync(250);
      expect(await loading).toEqual(snapshot);
      expect(env.journal.has(key('current'))).toBe(true);
    },
  );

  it('rejects a journal write synchronously without queuing IDB beneath a stale snapshot', async () => {
    const env = installStorage();
    const old = saved();
    const raw = JSON.stringify(old);
    env.database.set('current', old);
    env.journal.set(key('current'), raw);
    env.failures.write = new Error('quota exceeded');
    const storage = await import('./storage');
    expect(() => storage.saveMatch(createGame({ seed: 'unaccepted-new-match' }), 'easy')).toThrow(
      storage.StorageJournalError,
    );
    expect(env.indexed.open).not.toHaveBeenCalled();
    expect(env.journal.get(key('current'))).toBe(raw);
    expect(env.database.get('current')).toEqual(old);
    expect(await storage.loadMatch(old.state.rulesVersion)).toEqual(old);
  });

  it('loads legacy IDB saves when reading localStorage is denied', async () => {
    const env = installStorage();
    const old = saved();
    env.database.set('current', old);
    env.failures.read = new Error('localStorage denied');
    const storage = await import('./storage');
    expect(await storage.loadMatch(old.state.rulesVersion)).toEqual(old);
    expect(() => storage.saveMatch(old.state, 'normal')).toThrow(storage.StorageJournalError);
    expect(env.pending).toHaveLength(0);
  });

  it.each(['malformed', 'unsupported', 'invalid-time'])(
    'retains a compatible legacy IDB save beneath a %s journal',
    async (kind) => {
      const env = installStorage();
      const old = saved();
      env.database.set('current', old);
      const raw =
        kind === 'malformed'
          ? '{broken'
          : JSON.stringify({
              ...old,
              schemaVersion: kind === 'unsupported' ? 1 : 2,
              savedAt: kind === 'invalid-time' ? 'invalid' : old.savedAt,
            });
      env.journal.set(key('current'), raw);
      const storage = await import('./storage');
      expect(await storage.loadMatch(old.state.rulesVersion)).toEqual(old);
      expect(env.database.get('current')).toEqual(old);
      expect(env.journal.get(key('current'))).toBe(raw);
    },
  );

  it('rejects an unsupported journal without an older compatible DB save', async () => {
    const env = installStorage();
    const old = saved();
    env.journal.set(key('current'), JSON.stringify({ ...old, schemaVersion: 1 }));
    const storage = await import('./storage');
    await expect(storage.loadMatch(old.state.rulesVersion)).rejects.toThrow('другой версией');
  });

  it('prefers a new match over an older high revision journal even when cleanup is denied', async () => {
    const env = installStorage();
    const old = saved({ ...actionState(), revision: 50 });
    const fresh = saved(createGame({ seed: 'new-game', playerCount: 3 }), clock + 10);
    env.journal.set(key('current'), JSON.stringify(old));
    env.database.set('current', fresh);
    env.failures.remove = new Error('cleanup denied');
    const storage = await import('./storage');
    expect(await storage.loadMatch(fresh.state.rulesVersion)).toEqual(fresh);
    const reloaded = await reloadModule();
    expect(await reloaded.loadMatch(fresh.state.rulesVersion)).toEqual(fresh);
    expect(env.database.get('current')).toEqual(fresh);
  });
});
