import type { BotDifficulty, GameState, TurnAcknowledgement } from '../shared/types';

export interface Save {
  schemaVersion: 2;
  savedAt: string;
  difficulty: BotDifficulty;
  state: GameState;
  pendingTurn?: TurnAcknowledgement | null;
}
const DB = 'last-train-europe-v1';
const RECOVERY_READ_TIMEOUT_MS = 250;
let writes: Promise<void> = Promise.resolve();
let lastSavedAt = 0;
export type SaveSlot = 'current' | 'tutorial';
const journalKey = (slot: SaveSlot) => `${DB}-journal-${slot}`;

export class StorageJournalError extends Error {
  constructor(cause: unknown) {
    super(
      'Браузер не разрешил сохранить последнее действие. Разрешите локальное хранение и повторите действие.',
      { cause },
    );
    this.name = 'StorageJournalError';
  }
}

function rememberTime(save: Save) {
  const timestamp = Date.parse(save.savedAt);
  if (Number.isFinite(timestamp)) lastSavedAt = Math.max(lastSavedAt, timestamp);
}

function clearJournal(slot: SaveSlot, expected: string) {
  try {
    // A queued older write must not remove a newer accepted snapshot.
    if (localStorage.getItem(journalKey(slot)) === expected)
      localStorage.removeItem(journalKey(slot));
  } catch {
    // An uncleared snapshot remains a safe recovery copy of the committed save.
  }
}

function validateSave(value: unknown, rulesVersion: string): Save {
  const save = value as Save | null;
  if (!save || typeof save !== 'object' || !save.state || typeof save.state !== 'object')
    throw new Error('Сохранение повреждено. Начните новую партию.');
  if (
    save.schemaVersion !== 2 ||
    save.state.schemaVersion !== 2 ||
    save.state.rulesVersion !== rulesVersion
  )
    throw new Error('Это сохранение создано другой версией правил. Начните новую партию.');
  if (
    !Array.isArray(save.state.players) ||
    !Array.isArray(save.state.cities) ||
    !Number.isInteger(save.state.revision) ||
    typeof save.savedAt !== 'string' ||
    !Number.isFinite(Date.parse(save.savedAt))
  )
    throw new Error('Сохранение повреждено. Начните новую партию.');
  return save;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(save: Save, slot: SaveSlot, serialized: string): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      transaction.objectStore('saves').put(save, slot);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    clearJournal(slot, serialized);
  } finally {
    db.close();
  }
}
export function saveMatch(
  state: GameState,
  difficulty: BotDifficulty,
  slot: SaveSlot = 'current',
  pendingTurn: TurnAcknowledgement | null = null,
): Promise<void> {
  let serialized: string;
  try {
    const previous = localStorage.getItem(journalKey(slot));
    if (previous) {
      try {
        rememberTime(JSON.parse(previous) as Save);
      } catch {
        // A new accepted snapshot can replace a malformed recovery journal.
      }
    }
    const timestamp = Math.max(Date.now(), lastSavedAt + 1);
    const save: Save = {
      schemaVersion: 2,
      savedAt: new Date(timestamp).toISOString(),
      difficulty,
      state,
      pendingTurn,
    };
    serialized = JSON.stringify(save);
    // This must finish before the session publishes the accepted transition.
    localStorage.setItem(journalKey(slot), serialized);
    lastSavedAt = timestamp;
  } catch (cause) {
    // Do not queue a newer DB save beneath a stale journal after a failed write.
    throw new StorageJournalError(cause);
  }
  const snapshot = JSON.parse(serialized) as Save;
  writes = writes.catch(() => undefined).then(() => write(snapshot, slot, serialized));
  return writes;
}
export async function loadMatch(
  rulesVersion: string,
  slot: SaveSlot = 'current',
): Promise<Save | null> {
  let serialized: string | null = null;
  try {
    serialized = localStorage.getItem(journalKey(slot));
  } catch {
    // Existing IndexedDB saves still load when localStorage is unavailable.
  }
  let journal: Save | null = null;
  let journalError: unknown;
  if (serialized) {
    try {
      journal = validateSave(JSON.parse(serialized), rulesVersion);
      rememberTime(journal);
    } catch (reason) {
      journalError = reason;
    }
  }
  if (!journal) await writes.catch(() => undefined);
  let stored: Save | null = null;
  let databaseError: unknown;
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const reading = (async () => {
      const db = await openDB();
      try {
        return await new Promise<Save | undefined>((resolve, reject) => {
          const transaction = db.transaction('saves', 'readonly');
          const request = transaction.objectStore('saves').get(slot);
          request.onsuccess = () => resolve(request.result as Save | undefined);
          request.onerror = () => reject(request.error);
          transaction.onabort = () => reject(transaction.error);
        });
      } finally {
        db.close();
      }
    })();
    const value = journal
      ? await Promise.race([
          reading,
          new Promise<undefined>((resolve) => {
            recoveryTimer = setTimeout(() => resolve(undefined), RECOVERY_READ_TIMEOUT_MS);
          }),
        ])
      : await reading;
    if (value) {
      stored = validateSave(value, rulesVersion);
      rememberTime(stored);
    }
  } catch (reason) {
    databaseError = reason;
  } finally {
    if (recoveryTimer !== undefined) clearTimeout(recoveryTimer);
  }
  // Revision can decrease in a new match, or stay unchanged when acknowledging End.
  if (journal && (!stored || !(Date.parse(stored.savedAt) > Date.parse(journal.savedAt))))
    return journal;
  if (stored) {
    if (journal && serialized) clearJournal(slot, serialized);
    return stored;
  }
  if (databaseError) throw databaseError;
  if (journalError) throw journalError;
  return null;
}
