import { DatabaseSync } from 'node:sqlite';
import { closeSync, openSync, chmodSync, existsSync } from 'node:fs';
import type { StoredReply, StoredRoom } from './model';
import { canonical, gameReplyOwner } from './model';

export class SQLiteRoomStore {
  private db: DatabaseSync;
  constructor(
    private path = ':memory:',
    private options: { beforeCommit?: () => void } = {},
  ) {
    if (path !== ':memory:') {
      closeSync(openSync(path, 'a', 0o600));
      chmodSync(path, 0o600);
    }
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, state TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS journal(seq INTEGER PRIMARY KEY, room_id TEXT NOT NULL, entry TEXT NOT NULL) STRICT;
      CREATE TABLE IF NOT EXISTS replies(scope TEXT NOT NULL, owner TEXT NOT NULL, actor TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, reply TEXT NOT NULL, PRIMARY KEY(scope,owner,actor,id)) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS bootstrap_request ON replies(id) WHERE scope='bootstrap';
      CREATE UNIQUE INDEX IF NOT EXISTS bootstrap_proof ON replies(owner) WHERE scope='bootstrap';`);
    this.privateFiles();
    this.scopeLegacyGameReplies();
  }
  private scopeLegacyGameReplies() {
    const legacy = this.db
      .prepare("SELECT * FROM replies WHERE scope='game'")
      .all()
      .filter((row) => {
        try {
          return (JSON.parse(row.payload as string) as { matchId?: string }).matchId === row.owner;
        } catch {
          return false;
        }
      });
    if (!legacy.length) return;
    const sourceRooms = new Map<string, string>();
    for (const row of this.db.prepare('SELECT room_id,entry FROM journal ORDER BY seq').all()) {
      const entry = JSON.parse(row.entry as string) as {
        type?: string;
        envelope?: { matchId: string; seatId: number; commandId: string };
      };
      if (entry.type === 'command' && entry.envelope)
        sourceRooms.set(
          canonical([
            entry.envelope.matchId,
            String(entry.envelope.seatId),
            entry.envelope.commandId,
            canonical(entry.envelope),
          ]),
          row.room_id as string,
        );
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const row of legacy) {
        const roomId = sourceRooms.get(canonical([row.owner, row.actor, row.id, row.payload]));
        if (roomId)
          this.db
            .prepare(
              'INSERT OR IGNORE INTO replies(scope,owner,actor,id,payload,reply) VALUES(?,?,?,?,?,?)',
            )
            .run(
              'game',
              gameReplyOwner(roomId, row.owner as string),
              row.actor!,
              row.id!,
              row.payload!,
              row.reply!,
            );
        this.db
          .prepare("DELETE FROM replies WHERE scope='game' AND owner=? AND actor=? AND id=?")
          .run(row.owner!, row.actor!, row.id!);
      }
      this.privateFiles();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  private privateFiles() {
    if (this.path === ':memory:') return;
    for (const path of [this.path, `${this.path}-wal`, `${this.path}-shm`])
      if (existsSync(path)) chmodSync(path, 0o600);
  }
  loadRooms(): StoredRoom[] {
    return this.db
      .prepare('SELECT state FROM rooms')
      .all()
      .map((row) => JSON.parse(row.state as string) as StoredRoom);
  }
  findReply(
    scope: StoredReply['scope'],
    owner: string,
    actor: string,
    id: string,
  ): StoredReply | null {
    const row = this.db
      .prepare('SELECT * FROM replies WHERE scope=? AND owner=? AND actor=? AND id=?')
      .get(scope, owner, actor, id);
    return row ? (row as unknown as StoredReply) : null;
  }
  findBootstrap(field: 'id' | 'owner', value: string): StoredReply | null {
    const row = this.db
      .prepare(`SELECT * FROM replies WHERE scope='bootstrap' AND ${field}=?`)
      .get(value);
    return row ? (row as unknown as StoredReply) : null;
  }
  readJournal(roomId: string): unknown[] {
    return this.db
      .prepare('SELECT entry FROM journal WHERE room_id=? ORDER BY seq')
      .all(roomId)
      .map((row) => JSON.parse(row.entry as string));
  }
  commit(room: StoredRoom, entry: unknown, reply?: StoredReply): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'INSERT INTO rooms(id,state) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state',
        )
        .run(room.view.id, JSON.stringify(room));
      this.db
        .prepare('INSERT INTO journal(room_id,entry) VALUES(?,?)')
        .run(room.view.id, JSON.stringify(entry));
      if (reply)
        this.db
          .prepare('INSERT INTO replies(scope,owner,actor,id,payload,reply) VALUES(?,?,?,?,?,?)')
          .run(reply.scope, reply.owner, reply.actor, reply.id, reply.payload, reply.reply);
      this.privateFiles();
      this.options.beforeCommit?.();
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  close(): void {
    this.db.close();
  }
}
