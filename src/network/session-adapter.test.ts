import { describe, expect, it } from 'vitest';
import { createGame, getObservation } from '../core';
import { createNetworkClient, type NetworkSocket } from './client';
import { networkGameProps } from './session-adapter';
import {
  NETWORK_PROTOCOL,
  type ClientPacket,
  type RoomSnapshot,
  type ServerPacket,
} from './protocol';

class Socket implements NetworkSocket {
  readyState = 1;
  onopen: WebSocket['onopen'] = null;
  onmessage: WebSocket['onmessage'] = null;
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;
  sent: ClientPacket[] = [];
  send(value: string) {
    this.sent.push(JSON.parse(value));
  }
  close() {
    this.readyState = 3;
  }
  receive(value: ServerPacket) {
    this.onmessage?.call(
      this as unknown as WebSocket,
      new MessageEvent('message', { data: JSON.stringify(value) }),
    );
  }
}
function setup(pending = false) {
  const socket = new Socket();
  const values = new Map<string, string>();
  const client = createNetworkClient({
    socketFactory: () => socket,
    storage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => {
        values.set(key, value);
      },
      removeItem: (key) => {
        values.delete(key);
      },
    },
  });
  const settings = {
    seats: 2 as const,
    difficulty: 'normal' as const,
    turnSeconds: 120,
    admissionOpen: true,
  };
  client.create('Игрок', settings);
  socket.onopen?.call(socket as unknown as WebSocket, new Event('open'));
  const handshake = socket.sent.at(-1)!;
  if (handshake.type !== 'create') throw new Error('Expected create');
  const snapshot: RoomSnapshot = {
    room: {
      id: 'room-a',
      code: 'TEST',
      revision: 1,
      hostId: 'member-a',
      status: 'playing',
      settings,
      members: [
        {
          id: 'member-a',
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
        { id: 0, kind: 'human', memberId: 'member-a', name: 'Игрок' },
        { id: 1, kind: 'bot', memberId: null, name: 'Бот' },
      ],
      paused: false,
      pauseReason: null,
    },
    memberId: 'member-a',
    observation: getObservation(createGame({ playerCount: 2 }), 0),
    authority: {
      matchId: 'match-a',
      revision: 0,
      turnId: 'turn-a',
      controlEpoch: 1,
      activeSeat: 0,
      deadline: null,
      awaitingEnd: pending,
    },
    result: null,
    pendingTurn: pending ? { revision: 0, message: 'Действие выполнено' } : null,
    canAct: true,
  };
  socket.receive({
    type: 'welcome',
    protocol: NETWORK_PROTOCOL,
    requestId: handshake.requestId,
    credential: { roomId: 'room-a', memberId: 'member-a', secret: 'private-test-credential' },
    snapshot,
  });
  return { client, socket, snapshot };
}

describe('shown network authority remains attached to a physical UI intent', () => {
  for (const change of ['controlEpoch', 'matchId', 'turnId'] as const) {
    it(`rejects a captured command after ${change} changes with the same game revision`, () => {
      const { client, socket, snapshot } = setup();
      const captured = networkGameProps(client, 7);
      const next = structuredClone(snapshot);
      next.room.revision++;
      if (change === 'controlEpoch') {
        next.authority!.controlEpoch = 3;
        next.room.members[0]!.controlEpoch = 3;
      } else next.authority![change] = `${change}-new`;
      socket.receive({ type: 'snapshot', snapshot: next });
      const before = socket.sent.length;
      expect(
        captured.onCommand({ type: 'draw', source: 'deck' }, { sessionId: 7, revision: 0 }),
      ).toBe(false);
      expect(socket.sent).toHaveLength(before);
      client.dispose();
    });
  }
  it('rejects a captured End after control returns under a new epoch', () => {
    const { client, socket, snapshot } = setup(true);
    const captured = networkGameProps(client, 9);
    const next = structuredClone(snapshot);
    next.room.revision++;
    next.authority!.controlEpoch = 3;
    next.room.members[0]!.controlEpoch = 3;
    socket.receive({ type: 'snapshot', snapshot: next });
    const before = socket.sent.length;
    captured.onEndTurn({ sessionId: 9, revision: 0 });
    expect(socket.sent).toHaveLength(before);
    client.dispose();
  });
});
