import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, getObservation } from '../core';
import { createNetworkClient, type NetworkSocket } from './client';
import type {
  ClientPacket,
  ExpectedCommand,
  NetworkClientApi,
  ResumeCredential,
  RoomSnapshot,
  ServerPacket,
} from './protocol';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}
class Socket implements NetworkSocket {
  readyState = 0;
  sent: string[] = [];
  onopen: WebSocket['onopen'] = null;
  onclose: WebSocket['onclose'] = null;
  onmessage: WebSocket['onmessage'] = null;
  onerror: WebSocket['onerror'] = null;
  send(value: string | ArrayBufferLike | Blob | ArrayBufferView) {
    this.sent.push(String(value));
  }
  close() {
    this.readyState = 3;
  }
  open() {
    this.readyState = 1;
    this.onopen?.call(this as unknown as WebSocket, new Event('open'));
  }
  drop() {
    this.readyState = 3;
    this.onclose?.call(this as unknown as WebSocket, {} as CloseEvent);
  }
  packet(value: ServerPacket) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }
  packets() {
    return this.sent.map((value) => JSON.parse(value) as ClientPacket);
  }
}
const credential: ResumeCredential = {
  roomId: 'room-a',
  memberId: 'member-a',
  secret: 'private-resume-secret',
};
function expected(revision = 0): ExpectedCommand {
  return { matchId: 'match-a', seatId: 0, revision, turnId: 'turn-a', controlEpoch: 1 };
}
function snapshot(revision = 0): RoomSnapshot {
  const observation = getObservation(createGame({ seed: 'client-tests', playerCount: 2 }), 0);
  observation.revision = revision;
  return {
    room: {
      id: credential.roomId,
      code: 'ABCDEF',
      revision,
      hostId: credential.memberId,
      status: 'playing',
      settings: { seats: 2, difficulty: 'normal', turnSeconds: 180, admissionOpen: true },
      members: [
        {
          id: credential.memberId,
          name: 'Игрок',
          seatId: 0,
          connected: true,
          ready: true,
          control: 'human',
          controlEpoch: 1,
          returnPending: false,
        },
      ],
      seats: [
        { id: 0, kind: 'human', memberId: credential.memberId, name: 'Игрок' },
        { id: 1, kind: 'bot', memberId: null, name: 'Бот' },
      ],
      paused: false,
      pauseReason: null,
    },
    memberId: credential.memberId,
    authority: {
      matchId: 'match-a',
      turnId: 'turn-a',
      revision,
      activeSeat: 0,
      controlEpoch: 1,
      deadline: null,
      awaitingEnd: false,
    },
    observation,
    result: null,
    pendingTurn: null,
    canAct: true,
  };
}
const clients: NetworkClientApi[] = [];
afterEach(() => {
  clients.splice(0).forEach((client) => client.dispose());
  vi.useRealTimers();
});
function harness(storage = new MemoryStorage(), delays = [10, 20], url?: string) {
  const sockets: Socket[] = [];
  let sequence = 0;
  const client = createNetworkClient({
    storage,
    url,
    reconnectDelays: delays,
    requestTimeoutMs: 1000,
    makeId: () => `id-${++sequence}`,
    socketFactory: () => {
      const socket = new Socket();
      sockets.push(socket);
      return socket;
    },
  });
  clients.push(client);
  return { client, sockets, storage };
}
function welcome(socket: Socket, view = snapshot()) {
  const hello = socket
    .packets()
    .find(
      (packet) => packet.type === 'create' || packet.type === 'join' || packet.type === 'resume',
    );
  if (!hello || !('requestId' in hello)) throw new Error('Handshake missing');
  socket.packet({
    type: 'welcome',
    requestId: hello.requestId,
    protocol: 1,
    credential,
    snapshot: view,
  });
}
function connected() {
  const result = harness();
  result.client.create('Игрок', {
    seats: 2,
    difficulty: 'normal',
    turnSeconds: 180,
    admissionOpen: true,
  });
  result.sockets[0]!.open();
  welcome(result.sockets[0]!);
  return result;
}
function beginBootstrap(result: ReturnType<typeof harness>, type: 'create' | 'join') {
  if (type === 'create')
    result.client.create('Игрок', {
      seats: 2,
      difficulty: 'normal',
      turnSeconds: 180,
      admissionOpen: true,
    });
  else result.client.join('Игрок', 'abcdef');
}

describe('authoritative WebSocket client', () => {
  it.each(['create', 'join'] as const)(
    'journals %s before transmission and resends an unchanged attempt after a lost welcome',
    (type) => {
      vi.useFakeTimers();
      const result = harness();
      beginBootstrap(result, type);
      expect(result.sockets[0]!.sent).toHaveLength(0);
      const stored = JSON.parse([...result.storage.values.values()][0]!);
      expect(stored.bootstrap.type).toBe(type);
      expect(stored.bootstrap.bootstrapSecret).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(result.client.getState())).not.toContain(
        stored.bootstrap.bootstrapSecret,
      );
      result.sockets[0]!.open();
      const original = result.sockets[0]!.sent[0]!;
      expect(JSON.parse(original)).toEqual(stored.bootstrap);
      const oldMessage = result.sockets[0]!.onmessage;
      result.sockets[0]!.drop();
      vi.advanceTimersByTime(10);
      result.sockets[1]!.open();
      expect(result.sockets[1]!.sent).toEqual([original]);
      oldMessage?.call(
        result.sockets[0] as unknown as WebSocket,
        new MessageEvent('message', {
          data: JSON.stringify({
            type: 'welcome',
            requestId: stored.bootstrap.requestId,
            protocol: 1,
            credential,
            snapshot: snapshot(100),
          }),
        }),
      );
      expect(result.client.getState().snapshot).toBeNull();
      welcome(result.sockets[1]!);
      expect(result.client.getState().connection).toBe('connected');
      const completed = JSON.parse([...result.storage.values.values()][0]!);
      expect(completed.bootstrap).toBeUndefined();
      expect(completed.credential).toEqual(credential);
    },
  );

  it.each(['create', 'join'] as const)(
    'restores the exact %s bootstrap after reload without creating a second attempt',
    (type) => {
      const first = harness();
      beginBootstrap(first, type);
      first.sockets[0]!.open();
      const original = first.sockets[0]!.sent[0]!;
      first.client.dispose();
      const restored = harness(first.storage);
      expect(restored.sockets).toHaveLength(1);
      restored.client.join('Другой игрок', 'DIFFERENT');
      expect(restored.sockets).toHaveLength(1);
      restored.sockets[0]!.open();
      expect(restored.sockets[0]!.sent).toEqual([original]);
      welcome(restored.sockets[0]!);
      expect(restored.client.getState().snapshot?.memberId).toBe(credential.memberId);
    },
  );

  it('keeps an unknown bootstrap result pending and allows only an exact manual retry', () => {
    const result = harness();
    beginBootstrap(result, 'join');
    result.sockets[0]!.open();
    const original = result.sockets[0]!.sent[0]!;
    const packet = JSON.parse(original) as Extract<ClientPacket, { type: 'join' }>;
    result.sockets[0]!.packet({
      type: 'error',
      requestId: packet.requestId,
      code: 'SERVER_ERROR',
      message: packet.bootstrapSecret,
    });
    expect(result.client.getState().connection).toBe('disconnected');
    expect(result.client.getState().pendingRequest).toBe(packet.requestId);
    expect(JSON.stringify(result.client.getState())).not.toContain(packet.bootstrapSecret);
    result.client.create('Новая комната', snapshot().room.settings);
    expect(result.sockets).toHaveLength(1);
    result.client.reconnect();
    result.sockets[1]!.open();
    expect(result.sockets[1]!.sent).toEqual([original]);
    welcome(result.sockets[1]!);
    expect(result.client.getState().connection).toBe('connected');
  });

  it('does not accept a foreign welcome and bounds automatic bootstrap timeouts', () => {
    vi.useFakeTimers();
    const result = harness();
    beginBootstrap(result, 'create');
    result.sockets[0]!.open();
    const original = result.sockets[0]!.sent[0]!;
    const packet = JSON.parse(original) as Extract<ClientPacket, { type: 'create' }>;
    result.sockets[0]!.packet({
      type: 'welcome',
      requestId: 'another-request',
      protocol: 1,
      credential,
      snapshot: snapshot(),
    });
    const wrongMember = snapshot();
    wrongMember.memberId = 'another-member';
    result.sockets[0]!.packet({
      type: 'welcome',
      requestId: packet.requestId,
      protocol: 1,
      credential,
      snapshot: wrongMember,
    });
    result.sockets[0]!.packet({
      type: 'error',
      requestId: 'another-request',
      code: 'BOOTSTRAP_DENIED',
      message: 'Посторонний запрос',
    });
    expect(result.client.getState().snapshot).toBeNull();
    vi.advanceTimersByTime(1010);
    result.sockets[1]!.open();
    expect(result.sockets[1]!.sent).toEqual([original]);
    vi.advanceTimersByTime(1020);
    result.sockets[2]!.open();
    expect(result.sockets[2]!.sent).toEqual([original]);
    vi.advanceTimersByTime(2000);
    expect(result.sockets).toHaveLength(3);
    expect(result.client.getState().connection).toBe('disconnected');
    result.client.join('Другой вход', 'OTHER');
    expect(result.sockets).toHaveLength(3);
    result.client.reconnect();
    result.sockets[3]!.open();
    expect(result.sockets[3]!.sent).toEqual([original]);
  });

  it.each(['create', 'join'] as const)(
    'does not transmit %s when the initial journal cannot be written',
    (type) => {
      const result = harness();
      vi.spyOn(result.storage, 'setItem').mockImplementation(() => {
        throw new Error('Storage blocked');
      });
      beginBootstrap(result, type);
      expect(result.sockets).toHaveLength(0);
      expect(result.storage.values.size).toBe(0);
      expect(result.client.getState().pendingRequest).toBeNull();
      expect(result.client.getState().error).toContain('Вход не отправлен');
    },
  );

  it.each([
    'BOOTSTRAP_DENIED',
    'BOOTSTRAP_REUSED',
    'ROOM_UNAVAILABLE',
    'ROOM_FULL',
    'MEMBER_REMOVED',
    'ROOM_NOT_FOUND',
  ])('clears terminal %s and allows a new explicit entry without publishing its proof', (code) => {
    const result = harness();
    beginBootstrap(result, 'join');
    result.sockets[0]!.open();
    const original = result.sockets[0]!.packets()[0]!;
    if (original.type !== 'join') throw new Error('Join missing');
    result.sockets[0]!.packet({
      type: 'error',
      requestId: original.requestId,
      code,
      message: original.bootstrapSecret,
    });
    expect(result.client.getState().pendingRequest).toBeNull();
    expect(result.storage.values.size).toBe(0);
    expect(JSON.stringify(result.client.getState())).not.toContain(original.bootstrapSecret);
    result.client.join('Новый игрок', 'ABCDEF');
    result.sockets[1]!.open();
    const next = result.sockets[1]!.packets()[0]!;
    expect(next.type).toBe('join');
    if (next.type !== 'join') throw new Error('Join missing');
    expect(next.requestId).not.toBe(original.requestId);
    expect(next.bootstrapSecret).not.toBe(original.bootstrapSecret);
    welcome(result.sockets[1]!);
    expect(result.client.getState().connection).toBe('connected');
  });

  it('retains the bootstrap journal when replacing it with the welcomed credential fails', () => {
    const first = harness();
    beginBootstrap(first, 'create');
    first.sockets[0]!.open();
    const original = first.sockets[0]!.sent[0]!;
    const write = vi.spyOn(first.storage, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    welcome(first.sockets[0]!);
    expect(first.client.getState().connection).toBe('disconnected');
    expect(first.client.getState().snapshot).toBeNull();
    expect(first.client.command({ type: 'draw', source: 'deck' }, expected())).toBe(false);
    expect(JSON.parse([...first.storage.values.values()][0]!).bootstrap).toEqual(
      JSON.parse(original),
    );
    first.client.dispose();
    write.mockRestore();
    const restored = harness(first.storage);
    restored.sockets[0]!.open();
    expect(restored.sockets[0]!.sent).toEqual([original]);
    welcome(restored.sockets[0]!);
    expect(restored.client.getState().connection).toBe('connected');
  });

  it('does not overwrite an unreadable prior bootstrap with a fresh room attempt', () => {
    const first = harness();
    beginBootstrap(first, 'join');
    first.client.dispose();
    const saved = [...first.storage.values.values()][0]!;
    const read = vi.spyOn(first.storage, 'getItem').mockImplementation(() => {
      throw new Error('Storage unreadable');
    });
    const second = harness(first.storage);
    beginBootstrap(second, 'create');
    expect(second.sockets).toHaveLength(0);
    expect([...first.storage.values.values()]).toEqual([saved]);
    expect(second.client.getState().error).toContain('Вход не отправлен');
    second.client.dispose();
    read.mockRestore();
    const restored = harness(first.storage);
    restored.sockets[0]!.open();
    expect(restored.sockets[0]!.sent).toEqual([JSON.stringify(JSON.parse(saved).bootstrap)]);
    welcome(restored.sockets[0]!);
    expect(restored.client.getState().connection).toBe('connected');
  });

  it('clones bootstrap settings and refuses a journal copied from another server URL', () => {
    const storage = new MemoryStorage();
    const result = harness(storage, [10], 'ws://127.0.0.1:8787');
    const settings = snapshot().room.settings;
    result.client.create('Игрок', settings);
    settings.turnSeconds = 600;
    result.sockets[0]!.open();
    const packet = result.sockets[0]!.packets()[0]!;
    if (packet.type !== 'create') throw new Error('Create missing');
    expect(packet.settings.turnSeconds).toBe(180);
    result.client.dispose();
    const saved = [...storage.values.values()][0]!;
    storage.setItem('europe-network-v1:ws://127.0.0.1:9797', saved);
    const wrongServer = harness(storage, [10], 'ws://127.0.0.1:9797');
    expect(wrongServer.sockets).toHaveLength(0);
    expect(wrongServer.client.getState().pendingRequest).toBeNull();
  });

  it('serializes one pending command and only consumes its own acknowledgement', () => {
    const { client, sockets } = connected();
    expect(client.command({ type: 'draw', source: 'deck' }, expected(0))).toBe(true);
    expect(client.command({ type: 'draw', source: 'deck' }, expected(0))).toBe(false);
    const pending = client.getState().pendingCommand!;
    sockets[0]!.packet({
      type: 'ack',
      ack: { commandId: 'someone-else', accepted: true, revision: 5, roomRevision: 5 },
    });
    expect(client.getState().pendingCommand).toEqual(pending);
    sockets[0]!.packet({
      type: 'ack',
      ack: {
        commandId: pending.commandId,
        accepted: false,
        revision: 0,
        roomRevision: 0,
        message: 'Отказ ядра',
      },
    });
    expect(client.getState().pendingCommand).toBeNull();
    expect(client.getState().error).toBe('Отказ ядра');
    expect(sockets[0]!.packets().filter((packet) => packet.type === 'command')).toHaveLength(1);
  });

  it('waits for the accepted revision and ignores stale snapshots without regressing UI', () => {
    const { client, sockets } = connected();
    client.command({ type: 'draw', source: 'deck' }, expected(0));
    const id = client.getState().pendingCommand!.commandId;
    sockets[0]!.packet({
      type: 'ack',
      ack: { commandId: id, accepted: true, revision: 2, roomRevision: 2 },
    });
    expect(client.getState().confirmedCommandId).toBeFalsy();
    expect(client.command({ type: 'draw', source: 'deck' }, expected(0))).toBe(false);
    sockets[0]!.packet({ type: 'snapshot', snapshot: snapshot(2) });
    expect(client.getState().confirmedCommandId).toBe(id);
    expect(client.getState().pendingCommand).toBeNull();
    sockets[0]!.packet({ type: 'snapshot', snapshot: snapshot(1) });
    expect(client.getState().snapshot?.observation?.revision).toBe(2);
    const delayed = snapshot(1);
    delayed.room.revision = 3;
    sockets[0]!.packet({ type: 'snapshot', snapshot: delayed });
    expect(client.getState().snapshot?.observation?.revision).toBe(2);
  });

  it('keeps a draft confirmation unchanged on refusal and confirms a snapshot that arrived before its ack', () => {
    const { client, sockets } = connected();
    expect(client.command({ type: 'draw', source: 'deck' }, expected())).toBe(true);
    const rejected = client.getState().pendingCommand!.commandId;
    sockets[0]!.packet({
      type: 'ack',
      ack: { commandId: rejected, accepted: false, revision: 0, roomRevision: 0, message: 'Отказ' },
    });
    expect(client.getState().pendingCommand).toBeNull();
    expect(client.getState().confirmedCommandId).toBeFalsy();
    expect(client.command({ type: 'draw', source: 'deck' }, expected())).toBe(true);
    const accepted = client.getState().pendingCommand!.commandId;
    sockets[0]!.packet({ type: 'snapshot', snapshot: snapshot(1) });
    expect(client.getState().confirmedCommandId).toBeFalsy();
    expect(client.getState().pendingCommand?.commandId).toBe(accepted);
    sockets[0]!.packet({
      type: 'ack',
      ack: { commandId: accepted, accepted: true, revision: 1, roomRevision: 1 },
    });
    expect(client.getState().pendingCommand).toBeNull();
    expect(client.getState().confirmedCommandId).toBe(accepted);
  });

  it('resends the exact original envelope after a lost acknowledgement, with a fresh resume handshake', () => {
    vi.useFakeTimers();
    const { client, sockets, storage } = connected();
    client.command({ type: 'draw', source: 'deck' }, expected(0));
    const original = sockets[0]!.sent.find((value) => JSON.parse(value).type === 'command')!;
    const oldMessage = sockets[0]!.onmessage;
    sockets[0]!.drop();
    expect(client.getState().connection).toBe('reconnecting');
    expect(client.command({ type: 'draw', source: 'deck' }, expected(0))).toBe(false);
    vi.advanceTimersByTime(10);
    sockets[1]!.open();
    welcome(sockets[1]!, snapshot(1));
    expect(sockets[1]!.sent.filter((value) => JSON.parse(value).type === 'command')).toEqual([
      original,
    ]);
    oldMessage?.call(
      sockets[0] as unknown as WebSocket,
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'snapshot', snapshot: snapshot(100) }),
      }),
    );
    expect(client.getState().snapshot?.observation?.revision).toBe(1);
    const id = client.getState().pendingCommand!.commandId;
    sockets[1]!.packet({
      type: 'ack',
      ack: { commandId: id, accepted: true, revision: 1, roomRevision: 1 },
    });
    expect(client.getState().pendingCommand).toBeNull();
    expect(JSON.stringify(client.getState())).not.toContain(credential.secret);
    expect([...storage.values.values()][0]).toContain(credential.secret);
  });

  it('journals before send so an immediate page reload preserves the command ID', () => {
    const first = connected();
    const ticketIds = ['ticket-one', 'ticket-two'];
    first.client.command({ type: 'chooseTickets', ticketIds }, expected(0));
    const original = first.sockets[0]!.sent.find((value) => JSON.parse(value).type === 'command')!;
    ticketIds.push('changed-after-send');
    first.client.dispose();
    const second = harness(first.storage);
    second.sockets[0]!.open();
    welcome(second.sockets[0]!, snapshot(1));
    expect(second.sockets[0]!.sent.find((value) => JSON.parse(value).type === 'command')).toBe(
      original,
    );
    expect(second.client.getState().pendingCommand?.command).toEqual({
      type: 'chooseTickets',
      ticketIds: ['ticket-one', 'ticket-two'],
    });
  });

  it('does not send a command when its durable tab journal cannot be written', () => {
    const { client, sockets, storage } = connected();
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Storage blocked');
    });
    expect(client.command({ type: 'draw', source: 'deck' }, expected(0))).toBe(false);
    expect(client.getState().pendingCommand).toBeNull();
    expect(client.getState().error).toContain('не отправлено');
    expect(sockets[0]!.packets().filter((packet) => packet.type === 'command')).toHaveLength(0);
  });

  it('requires explicit End and blocks normal commands during the handoff pause', () => {
    const { client, sockets } = connected();
    expect(client.command({ type: 'endTurn' }, expected(0))).toBe(false);
    const view = snapshot(1);
    view.pendingTurn = { revision: 1, message: 'Действие выполнено' };
    view.authority!.awaitingEnd = true;
    sockets[0]!.packet({ type: 'snapshot', snapshot: view });
    expect(client.command({ type: 'draw', source: 'deck' }, expected(1))).toBe(false);
    expect(client.command({ type: 'endTurn' }, expected(1))).toBe(true);
    const commandId = client.getState().pendingCommand!.commandId;
    sockets[0]!.packet({
      type: 'ack',
      ack: { commandId, accepted: true, revision: 1, roomRevision: 2 },
    });
    expect(client.getState().pendingCommand).not.toBeNull();
    expect(client.command({ type: 'endTurn' }, expected(1))).toBe(false);
    const next = snapshot(1);
    next.room.revision = 2;
    next.authority!.activeSeat = 1;
    next.authority!.turnId = 'turn-b';
    next.canAct = false;
    sockets[0]!.packet({ type: 'snapshot', snapshot: next });
    expect(client.getState().pendingCommand).toBeNull();
    expect(client.command({ type: 'endTurn' }, expected(1))).toBe(false);
  });

  it('keeps room actions pending without optimistic mutation and retries the same request ID', () => {
    vi.useFakeTimers();
    const { client, sockets } = connected();
    expect(
      client.roomAction(
        { type: 'pause', paused: true },
        { roomId: credential.roomId, revision: 0 },
      ),
    ).toBe(true);
    const request = sockets[0]!.sent.find((value) => JSON.parse(value).type === 'room')!;
    expect(client.getState().snapshot?.room.paused).toBe(false);
    expect(
      client.roomAction(
        { type: 'pause', paused: false },
        { roomId: credential.roomId, revision: 0 },
      ),
    ).toBe(false);
    sockets[0]!.drop();
    vi.advanceTimersByTime(10);
    sockets[1]!.open();
    welcome(sockets[1]!);
    expect(sockets[1]!.sent.find((value) => JSON.parse(value).type === 'room')).toBe(request);
    sockets[1]!.packet({ type: 'roomAck', requestId: 'foreign', roomRevision: 1 });
    expect(client.getState().pendingRequest).not.toBeNull();
    sockets[1]!.packet({
      type: 'roomAck',
      requestId: JSON.parse(request).requestId,
      roomRevision: 1,
    });
    expect(client.getState().pendingRequest).not.toBeNull();
    const paused = snapshot();
    paused.room.revision = 1;
    paused.room.paused = true;
    sockets[1]!.packet({ type: 'snapshot', snapshot: paused });
    expect(client.getState().pendingRequest).toBeNull();
  });

  it('bounds automatic recovery and allows an explicit manual retry', () => {
    vi.useFakeTimers();
    const { client, sockets } = connected();
    sockets[0]!.drop();
    vi.advanceTimersByTime(10);
    sockets[1]!.drop();
    vi.advanceTimersByTime(20);
    sockets[2]!.drop();
    vi.advanceTimersByTime(100);
    expect(sockets).toHaveLength(3);
    expect(client.getState().connection).toBe('disconnected');
    client.reconnect();
    expect(sockets).toHaveLength(4);
  });

  it('keeps storage tab-local and clears access after explicit leave or kick', () => {
    const { client, sockets, storage } = connected();
    const independent = harness();
    expect(independent.client.getState().snapshot).toBeNull();
    expect(independent.sockets).toHaveLength(0);
    sockets[0]!.packet({ type: 'kicked', message: 'Доступ удалён' });
    expect(client.getState().connection).toBe('kicked');
    expect(storage.values.size).toBe(0);
    expect(client.sendVoice('other', { type: 'leave', generation: 'voice-a' })).toBe(false);
    client.leave();
    expect(client.getState().connection).toBe('idle');
  });

  it('does not resend a saved action into a different match or seat', () => {
    const first = connected();
    first.client.command({ type: 'draw', source: 'deck' }, expected(0));
    first.client.dispose();
    const second = harness(first.storage);
    second.sockets[0]!.open();
    const next = snapshot(5);
    next.authority!.matchId = 'another-match';
    welcome(second.sockets[0]!, next);
    expect(second.client.getState().pendingCommand).toBeNull();
    expect(second.sockets[0]!.packets().filter((packet) => packet.type === 'command')).toHaveLength(
      0,
    );
  });

  it('accepts a new turn with a lower seat epoch but rejects a stale epoch within the same turn', () => {
    const { client, sockets } = connected();
    const controlled = snapshot(1);
    controlled.authority!.controlEpoch = 4;
    sockets[0]!.packet({ type: 'snapshot', snapshot: controlled });
    const stale = snapshot(1);
    stale.room.revision = 2;
    stale.authority!.controlEpoch = 3;
    sockets[0]!.packet({ type: 'snapshot', snapshot: stale });
    expect(client.getState().snapshot?.authority?.controlEpoch).toBe(4);
    const next = snapshot(2);
    next.authority!.turnId = 'turn-b';
    next.authority!.activeSeat = 1;
    next.authority!.controlEpoch = 1;
    sockets[0]!.packet({ type: 'snapshot', snapshot: next });
    expect(client.getState().snapshot?.authority?.turnId).toBe('turn-b');
    expect(client.getState().snapshot?.authority?.controlEpoch).toBe(1);
  });

  it('does not restore a credential journal whose declared room/member scope is inconsistent', () => {
    const first = connected();
    first.client.dispose();
    const key = [...first.storage.values.keys()][0]!;
    const journal = JSON.parse(first.storage.getItem(key)!);
    journal.roomId = 'foreign-room';
    first.storage.setItem(key, JSON.stringify(journal));
    const second = harness(first.storage);
    expect(second.sockets).toHaveLength(0);
    expect(second.client.getState().pendingCommand).toBeNull();
  });

  it.each(['ROOM_NOT_FOUND', 'MEMBER_REMOVED', 'RESUME_INVALID'])(
    'clears terminal resume error %s so a removed member can enter a new room',
    (code) => {
      const first = connected();
      first.client.dispose();
      const second = harness(first.storage);
      second.sockets[0]!.open();
      const resume = second.sockets[0]!.packets()[0]!;
      if (resume.type !== 'resume') throw new Error('Resume missing');
      second.sockets[0]!.packet({
        type: 'error',
        requestId: resume.requestId,
        code,
        message: 'Место удалено.',
      });
      expect(second.storage.values.size).toBe(0);
      expect(second.client.getState().snapshot).toBeNull();
      second.client.create('Новый игрок', {
        seats: 2,
        difficulty: 'normal',
        turnSeconds: 180,
        admissionOpen: true,
      });
      expect(second.sockets).toHaveLength(2);
    },
  );

  it('forwards authorized voice generations and stops both subscription streams on dispose', () => {
    const { client, sockets } = connected();
    const voice = vi.fn();
    const changed = vi.fn();
    client.subscribeVoice(voice);
    client.subscribe(changed);
    const signal = { type: 'state', enabled: true, generation: 'voice-session-a' } as const;
    sockets[0]!.packet({ type: 'voice', fromId: 'member-b', signal });
    expect(voice).toHaveBeenCalledWith('member-b', signal);
    const late = sockets[0]!.onmessage;
    client.dispose();
    late?.call(
      sockets[0] as unknown as WebSocket,
      new MessageEvent('message', {
        data: JSON.stringify({ type: 'voice', fromId: 'member-b', signal }),
      }),
    );
    expect(voice).toHaveBeenCalledTimes(1);
    expect(changed).not.toHaveBeenCalled();
    expect(sockets[0]!.readyState).toBe(3);
  });

  it('rejects commands captured before authority changes even when the core revision is identical', () => {
    const { client, sockets } = connected();
    const rendered = expected();
    const controlled = snapshot();
    controlled.room.revision = 1;
    controlled.authority!.controlEpoch = 2;
    sockets[0]!.packet({ type: 'snapshot', snapshot: controlled });
    expect(client.command({ type: 'draw', source: 'deck' }, rendered)).toBe(false);
    const nextMatch = snapshot();
    nextMatch.room.revision = 2;
    nextMatch.authority!.matchId = 'match-b';
    sockets[0]!.packet({ type: 'snapshot', snapshot: nextMatch });
    expect(client.command({ type: 'draw', source: 'deck' }, rendered)).toBe(false);
    const nextTurn = snapshot();
    nextTurn.room.revision = 3;
    nextTurn.authority!.turnId = 'turn-b';
    sockets[0]!.packet({ type: 'snapshot', snapshot: nextTurn });
    expect(client.command({ type: 'draw', source: 'deck' }, rendered)).toBe(false);
    expect(sockets[0]!.packets().filter((packet) => packet.type === 'command')).toHaveLength(0);
  });

  it('rejects a stale room confirmation and a guarded leave for a different room', () => {
    const { client, sockets, storage } = connected();
    const capturedRoom = { roomId: credential.roomId, revision: 0 };
    const capturedAction = { type: 'endMatch', matchId: 'match-a', confirmed: true } as const;
    const next = snapshot();
    next.room.revision = 1;
    next.authority!.matchId = 'match-b';
    sockets[0]!.packet({ type: 'snapshot', snapshot: next });
    expect(client.roomAction(capturedAction, capturedRoom)).toBe(false);
    expect(client.roomAction(capturedAction, { ...capturedRoom, revision: 1 })).toBe(false);
    client.leave('different-room');
    expect(client.getState().connection).toBe('connected');
    expect(storage.values.size).toBe(1);
    expect(sockets[0]!.packets().filter((packet) => packet.type === 'room')).toHaveLength(0);
  });
});
