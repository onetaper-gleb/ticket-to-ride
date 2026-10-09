import type { BotDifficulty, GameState } from '../shared/types';

export interface Save {
  schemaVersion: 1;
  savedAt: string;
  difficulty: BotDifficulty;
  state: GameState;
}
const DB = 'last-train-v1';
let writes: Promise<void> = Promise.resolve();
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('saves');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function write(save: Save): Promise<void> {
  const db = await openDB();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('saves', 'readwrite');
      transaction.objectStore('saves').put(save, 'current');
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export function saveMatch(state: GameState, difficulty: BotDifficulty): Promise<void> {
  const save: Save = { schemaVersion: 1, savedAt: new Date().toISOString(), difficulty, state };
  writes = writes.catch(() => undefined).then(() => write(save));
  return writes;
}
export async function loadMatch(rulesVersion: string): Promise<Save | null> {
  await writes.catch(() => undefined);
  const db = await openDB();
  try {
    const save = await new Promise<Save | undefined>((resolve, reject) => {
      const request = db.transaction('saves', 'readonly').objectStore('saves').get('current');
      request.onsuccess = () => resolve(request.result as Save | undefined);
      request.onerror = () => reject(request.error);
    });
    if (!save) return null;
    if (
      save.schemaVersion !== 1 ||
      save.state.schemaVersion !== 1 ||
      save.state.rulesVersion !== rulesVersion
    )
      throw new Error('Это сохранение создано другой версией правил. Начните новую партию.');
    if (
      !Array.isArray(save.state.players) ||
      !Array.isArray(save.state.stations) ||
      !Number.isInteger(save.state.revision)
    )
      throw new Error('Сохранение повреждено. Начните новую партию.');
    return save;
  } finally {
    db.close();
  }
}
