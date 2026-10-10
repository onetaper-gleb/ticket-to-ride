import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket as PublicWebSocket } from 'ws';
import { createRoomServer } from './transport';
import type {
  ClientPacket,
  CommandEnvelope,
  RoomSnapshot,
  ServerPacket,
} from '../src/network/protocol';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function client(url: string) {
  const socket = new WebSocket(url),
    packets: ServerPacket[] = [],
    waiters: Array<() => void> = [];
  socket.addEventListener('message', (event) => {
    packets.push(JSON.parse(String(event.data)) as ServerPacket);
    for (const wake of waiters.splice(0)) wake();
  });
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true });
    socket.addEventListener('error', () => reject(new Error('Connection failed')), { once: true });
  });
  cleanup.push(() => socket.close());
  return {
    packets,
    socket,
    send: (packet: ClientPacket) => socket.send(JSON.stringify(packet)),
    async wait<T extends ServerPacket['type']>(
      type: T,
      after = 0,
    ): Promise<Extract<ServerPacket, { type: T }>> {
      const deadline = Date.now() + 3000;
      while (true) {
        const p = packets.slice(after).find((packet) => packet.type === type);
        if (p) return p as Extract<ServerPacket, { type: T }>;
        if (Date.now() > deadline) throw new Error(`Missing ${type}`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 50);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
    async waitSnapshot(ready: (snapshot: RoomSnapshot) => boolean) {
      const deadline = Date.now() + 3000;
      while (true) {
        const p = packets.filter((p) => p.type === 'snapshot' || p.type === 'welcome').at(-1) as
          Extract<ServerPacket, { type: 'snapshot' | 'welcome' }> | undefined;
        if (p && ready(p.snapshot)) return p.snapshot;
        if (Date.now() > deadline)
          throw new Error('Snapshot did not reach the acknowledged revision');
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 50);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
    snapshot() {
      const p = packets.filter((p) => p.type === 'snapshot' || p.type === 'welcome').at(-1)!;
      return (p as Extract<ServerPacket, { type: 'snapshot' | 'welcome' }>).snapshot;
    },
  };
}

describe('real WebSocket transport', () => {
  it('serves health, joins two native clients and commits explicit End before the next seat acts', async () => {
    const server = await createRoomServer({ port: 0, botDelayMs: 1 });
    cleanup.push(() => server.close());
    const health = await fetch(server.url.replace('ws:', 'http:') + '/health');
    expect(await health.json()).toEqual({ ok: true, protocol: 1 });
    const a = await client(server.url),
      b = await client(server.url);
    a.send({
      type: 'create',
      requestId: 'create',
      protocol: 1,
      name: 'Alpha',
      settings: { seats: 2, difficulty: 'normal', turnSeconds: 30, admissionOpen: true },
    });
    const welcomeA = await a.wait('welcome');
    b.send({
      type: 'join',
      requestId: 'join',
      protocol: 1,
      name: 'Beta',
      code: welcomeA.snapshot.room.code,
    });
    const welcomeB = await b.wait('welcome');
    await a.wait('snapshot');
    async function room(
      c: typeof a,
      action: Extract<ClientPacket, { type: 'room' }>['action'],
      requestId: string,
    ) {
      const before = c.packets.length,
        s = c.snapshot();
      c.send({ type: 'room', requestId, roomId: s.room.id, revision: s.room.revision, action });
      const ack = await c.wait('roomAck', before);
      await Promise.all(
        [a, b].map((client) =>
          client.waitSnapshot((snapshot) => snapshot.room.revision >= ack.roomRevision),
        ),
      );
    }
    await room(a, { type: 'ready', ready: true }, 'ready-a');
    await room(b, { type: 'ready', ready: true }, 'ready-b');
    await room(a, { type: 'start' }, 'start');
    let counter = 0;
    async function command(c: typeof a, command: CommandEnvelope['command']) {
      const s = c.snapshot(),
        authority = s.authority!,
        before = c.packets.length;
      const envelope: CommandEnvelope = {
        commandId: `command-${++counter}`,
        matchId: authority.matchId,
        seatId: s.observation!.self.id,
        revision: authority.revision,
        turnId: authority.turnId,
        controlEpoch: authority.controlEpoch,
        command,
      };
      c.send({ type: 'command', envelope });
      const ack = (await c.wait('ack', before)).ack;
      await Promise.all(
        [a, b].map((client) =>
          client.waitSnapshot((snapshot) => snapshot.room.revision >= ack.roomRevision),
        ),
      );
      return ack;
    }
    expect(
      (
        await command(a, {
          type: 'chooseTickets',
          ticketIds: a
            .snapshot()
            .observation!.self.ticketOptions.slice(0, 2)
            .map((t) => t.id),
        })
      ).accepted,
    ).toBe(true);
    expect(
      (
        await command(b, {
          type: 'chooseTickets',
          ticketIds: b
            .snapshot()
            .observation!.self.ticketOptions.slice(0, 2)
            .map((t) => t.id),
        })
      ).accepted,
    ).toBe(true);
    await command(a, { type: 'draw', source: 'deck' });
    await command(a, { type: 'draw', source: 'deck' });
    expect(a.snapshot().pendingTurn).not.toBeNull();
    expect(b.snapshot().canAct).toBe(false);
    expect((await command(a, { type: 'draw', source: 'deck' })).code).toBe('END_REQUIRED');
    expect((await command(a, { type: 'endTurn' })).accepted).toBe(true);
    expect(b.snapshot().canAct).toBe(true);
    expect((await command(b, { type: 'draw', source: 'deck' })).accepted).toBe(true);
    const broadcasts = JSON.stringify(
      [...a.packets, ...b.packets].filter((p) => p.type !== 'welcome'),
    );
    expect(broadcasts).not.toContain(welcomeA.credential.secret);
    expect(broadcasts).not.toContain(welcomeB.credential.secret);
  });

  it('rejects an unlisted browser Origin and malformed or oversized packets', async () => {
    const server = await createRoomServer({ port: 0, allowedOrigins: ['http://localhost:5177'] });
    cleanup.push(() => server.close());
    const rejected = new PublicWebSocket(server.url, { origin: 'https://unlisted.example' });
    rejected.on('error', () => {});
    const response = await new Promise<number>((resolve) =>
      rejected.once('unexpected-response', (_request, response) => {
        resolve(response.statusCode!);
        response.resume();
        rejected.terminate();
      }),
    );
    expect(response).toBe(403);
    const a = await client(server.url);
    a.socket.send('not-json');
    expect((await a.wait('error')).code).toBe('INVALID_PACKET');
    const closed = new Promise<number>((resolve) =>
      a.socket.addEventListener('close', (event) => resolve(event.code), { once: true }),
    );
    a.socket.send('x'.repeat(65_537));
    expect(await closed).toBe(1009);
  });
});
