import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoomServer } from '../server/transport';
import { createNetworkClient, type NetworkSocket } from '../src/network/client';
import type {
  ClientPacket,
  ExpectedCommand,
  NetworkClientApi,
  NetworkClientState,
  RoomAction,
  RoomSnapshot,
  ServerPacket,
} from '../src/network/protocol';
import { getLegalCommands } from '../src/core';
import type { GameCommand } from '../src/shared/types';

const directory = mkdtempSync(join(tmpdir(), 'europe-recovery-'));
const dbPath = join(directory, 'rooms.sqlite');
const clients: NetworkClientApi[] = [];
let server: Awaited<ReturnType<typeof createRoomServer>> | null = null;
let fatal: Error | null = null;
let privacyPackets = 0;
const report = {
  transport: 'Node native WebSocket + actual browser client + SQLite',
  isolatedTemporaryServer: true,
  restarts: 0,
  partialDrawRestored: false,
  pendingEndRestored: false,
  extraActionBeforeEndRefused: false,
  explicitEndTransferred: false,
  lostAckCommitted: false,
  exactEnvelopeReplay: false,
  lostAckPageReloadRecovered: false,
  duplicateDrawAvoided: false,
  hostPausePreservedAfterAllOffline: false,
  allDisconnectedBudgetFreezeInferredFromPublicDeadline: false,
  privacyPackets: 0,
};

function journal() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
function privacy(packet: ServerPacket) {
  if (packet.type !== 'snapshot' && packet.type !== 'welcome') return;
  const snapshot = packet.snapshot;
  assert(
    !('credential' in snapshot) && !('credential' in snapshot.room),
    'Credential leaked in public snapshot',
  );
  for (const member of snapshot.room.members)
    assert(!('secret' in member) && !('credential' in member), 'Credential leaked in room member');
  const observation = snapshot.observation;
  if (observation) {
    for (const field of ['seed', 'rng', 'deck', 'discard', 'ticketDeck', 'unusedTickets'])
      assert(!(field in observation), 'Hidden game state leaked in observation');
    for (const player of observation.players) {
      assert(!('hand' in player) && !('ticketOptions' in player), 'Private player cards leaked');
      if (observation.phase !== 'finished')
        assert(!('tickets' in player), 'Private player tickets leaked');
    }
    assert.equal(
      observation.self.id,
      snapshot.room.members.find((member) => member.id === snapshot.memberId)?.seatId,
      'Observation belongs to another seat',
    );
  }
  privacyPackets++;
}
interface Faults {
  dropNextAcceptedAck: boolean;
  dropped: number;
  closed: number;
  commands: string[];
}
class RecoverySocket implements NetworkSocket {
  private native: WebSocket;
  private dropped = false;
  onopen: WebSocket['onopen'] = null;
  onmessage: WebSocket['onmessage'] = null;
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;
  constructor(
    address: string,
    private faults: Faults,
  ) {
    this.native = new WebSocket(address);
    this.native.onopen = (event) => this.onopen?.call(this.native, event);
    this.native.onclose = (event) => {
      faults.closed++;
      this.onclose?.call(this.native, event);
    };
    this.native.onerror = (event) => this.onerror?.call(this.native, event);
    this.native.onmessage = (event) => {
      try {
        assert.equal(typeof event.data, 'string', 'Unexpected server transport payload');
        const packet = JSON.parse(event.data as string) as ServerPacket;
        privacy(packet);
        if (packet.type === 'ack' && packet.ack.accepted && faults.dropNextAcceptedAck) {
          faults.dropNextAcceptedAck = false;
          faults.dropped++;
          this.dropped = true;
          this.native.close(1000, 'Recovery QA lost acknowledgement');
          return;
        }
        if (!this.dropped) this.onmessage?.call(this.native, event);
      } catch {
        fatal = new Error('Recovery transport privacy/protocol assertion failed');
        this.native.close();
      }
    };
  }
  get readyState() {
    return this.native.readyState;
  }
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof data === 'string' && (JSON.parse(data) as ClientPacket).type === 'command')
      this.faults.commands.push(data);
    this.native.send(data);
  }
  close() {
    this.native.close();
  }
}
function participant(
  url: string,
  storage = journal(),
  faults: Faults = { dropNextAcceptedAck: false, dropped: 0, closed: 0, commands: [] },
) {
  const client = createNetworkClient({
    url,
    storage,
    requestTimeoutMs: 4000,
    reconnectDelays: [150, 300, 600, 1200, 2400],
    socketFactory: (address) => new RecoverySocket(address, faults),
  });
  clients.push(client);
  return { client, storage, faults };
}
type Participant = ReturnType<typeof participant>;
function waitFor(
  client: NetworkClientApi,
  condition: (state: NetworkClientState) => boolean,
  label: string,
  timeout = 10_000,
): Promise<NetworkClientState> {
  if (fatal) return Promise.reject(fatal);
  if (condition(client.getState())) return Promise.resolve(client.getState());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Recovery state timed out: ${label}`));
    }, timeout);
    const unsubscribe = client.subscribe(() => {
      if (fatal) {
        clearTimeout(timer);
        unsubscribe();
        reject(fatal);
        return;
      }
      const state = client.getState();
      if (condition(state)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(state);
      }
    });
  });
}
function view(item: Participant): RoomSnapshot {
  const snapshot = item.client.getState().snapshot;
  assert(snapshot, 'Expected a personal room snapshot');
  return snapshot;
}
function expected(snapshot: RoomSnapshot): ExpectedCommand {
  assert(snapshot.authority && snapshot.observation, 'Expected a game authority');
  return {
    matchId: snapshot.authority.matchId,
    turnId: snapshot.authority.turnId,
    revision: snapshot.authority.revision,
    controlEpoch: snapshot.authority.controlEpoch,
    seatId: snapshot.observation.self.id,
  };
}
async function sync(
  items: Participant[],
  revision = Math.max(...items.map((item) => view(item).room.revision)),
) {
  await Promise.all(
    items.map((item) =>
      waitFor(
        item.client,
        (state) =>
          state.connection === 'connected' &&
          !!state.snapshot &&
          state.snapshot.room.revision >= revision &&
          !state.pendingCommand &&
          !state.pendingRequest,
        'fresh synchronized room',
      ),
    ),
  );
}
async function action(item: Participant, value: RoomAction, peers: Participant[]) {
  const room = view(item).room;
  assert(
    item.client.roomAction(value, { roomId: room.id, revision: room.revision }),
    'Room action refused locally',
  );
  await waitFor(item.client, (state) => !state.pendingRequest, 'room action acknowledgement');
  assert.equal(item.client.getState().error, null, 'Server rejected room action');
  await sync(peers, view(item).room.revision);
}
async function command(
  item: Participant,
  value: GameCommand | { type: 'endTurn' },
  peers: Participant[],
) {
  assert(item.client.command(value, expected(view(item))), 'Game command refused locally');
  await waitFor(item.client, (state) => !state.pendingCommand, 'game command acknowledgement');
  assert.equal(item.client.getState().error, null, 'Server rejected game command');
  await sync(peers, view(item).room.revision);
}
async function rejoin(items: Participant[]) {
  await Promise.all(
    items.map((item) =>
      waitFor(
        item.client,
        (state) => state.connection === 'connected' && !!state.snapshot && !state.pendingRequest,
        'personal resume',
      ),
    ),
  );
  await sync(items);
}
async function restart(url: string, items: Participant[]) {
  assert(server, 'Expected the owned temporary server');
  const port = Number(new URL(url).port);
  await server.close();
  server = null;
  await Promise.all(
    items.map((item) =>
      waitFor(item.client, (state) => state.connection !== 'connected', 'server disconnection'),
    ),
  );
  server = await createRoomServer({ port, dbPath });
  assert.equal(server.url, url, 'Server URL changed during restart');
  report.restarts++;
}
async function disconnectAll(items: Participant[]) {
  const previouslyClosed = items.map((item) => item.faults.closed);
  for (const item of items) item.client.dispose();
  const deadline = Date.now() + 4000;
  while (items.some((item, index) => item.faults.closed === previouslyClosed[index])) {
    assert(Date.now() < deadline, 'Native transport did not close after disposal');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

try {
  server = await createRoomServer({ port: 0, dbPath });
  const url = server.url;
  let host = participant(url),
    guest = participant(url);
  host.client.create('Проверка ведущего', {
    seats: 2,
    difficulty: 'normal',
    turnSeconds: 600,
    admissionOpen: true,
  });
  await waitFor(
    host.client,
    (state) => state.connection === 'connected' && !!state.snapshot,
    'created room',
  );
  guest.client.join('Проверка гостя', view(host).room.code);
  await rejoin([host, guest]);
  await action(host, { type: 'ready', ready: true }, [host, guest]);
  await action(guest, { type: 'ready', ready: true }, [host, guest]);
  await action(host, { type: 'start' }, [host, guest]);
  for (const item of [host, guest]) {
    await waitFor(item.client, (state) => !!state.snapshot?.canAct, 'own setup turn');
    const option = getLegalCommands(view(item).observation!).find(
      (value) => value.type === 'chooseTickets' && value.ticketIds.length === 2,
    );
    assert(option, 'No legal initial ticket choice');
    await command(item, option, [host, guest]);
  }
  const originalRoom = view(host).room.id;
  const initialCount = view(host).observation!.self.hand.length;
  await command(host, { type: 'draw', source: 'deck' }, [host, guest]);
  assert.equal(view(host).observation!.phase, 'draw');
  const partialHand = view(host)
    .observation!.self.hand.map((card) => card.id)
    .sort()
    .join(',');
  await restart(url, [host, guest]);
  await rejoin([host, guest]);
  assert.equal(view(host).room.id, originalRoom);
  assert.equal(view(host).observation!.phase, 'draw');
  assert(
    view(host)
      .observation!.self.hand.map((card) => card.id)
      .sort()
      .join(',') === partialHand,
    'Partial draw changed during persisted restart',
  );
  assert.equal(view(host).observation!.self.hand.length, initialCount + 1);
  report.partialDrawRestored = true;
  await command(host, { type: 'draw', source: 'deck' }, [host, guest]);
  assert(view(host).pendingTurn && view(host).authority!.awaitingEnd);
  assert.equal(view(host).observation!.self.hand.length, initialCount + 2);
  const endSeat = view(host).authority!.activeSeat;
  await restart(url, [host, guest]);
  await rejoin([host, guest]);
  assert(view(host).pendingTurn && view(host).authority!.awaitingEnd);
  assert.equal(view(host).authority!.activeSeat, endSeat);
  assert.equal(view(host).observation!.self.hand.length, initialCount + 2);
  report.pendingEndRestored = true;
  assert.equal(host.client.command({ type: 'draw', source: 'deck' }, expected(view(host))), false);
  assert.equal(
    guest.client.command({ type: 'draw', source: 'deck' }, expected(view(guest))),
    false,
  );
  assert.equal(view(guest).canAct, false);
  report.extraActionBeforeEndRefused = true;
  await command(host, { type: 'endTurn' }, [host, guest]);
  assert.equal(view(guest).canAct, true);
  assert.equal(view(guest).authority!.activeSeat, view(guest).observation!.self.id);
  report.explicitEndTransferred = true;

  const beforeLostAck = view(guest).observation!.self.hand.length;
  guest.faults.dropNextAcceptedAck = true;
  assert(guest.client.command({ type: 'draw', source: 'deck' }, expected(view(guest))));
  const originalEnvelope = guest.faults.commands.at(-1)!;
  const originalCommandId = (
    JSON.parse(originalEnvelope) as Extract<ClientPacket, { type: 'command' }>
  ).envelope.commandId;
  await waitFor(
    guest.client,
    (state) =>
      guest.faults.dropped === 1 && state.connection !== 'connected' && !!state.pendingCommand,
    'lost accepted acknowledgement',
  );
  guest.client.dispose();
  guest = participant(url, guest.storage, guest.faults);
  await rejoin([host, guest]);
  await waitFor(
    guest.client,
    (state) => !state.pendingCommand,
    'deduplicated replay acknowledgement',
  );
  assert.equal(guest.client.getState().error, null);
  const copies = guest.faults.commands.filter(
    (value) =>
      (JSON.parse(value) as Extract<ClientPacket, { type: 'command' }>).envelope.commandId ===
      originalCommandId,
  );
  assert.equal(copies.length, 2, 'Expected one original send and one replay');
  assert(
    copies.every((value) => value === originalEnvelope),
    'Replay changed the original envelope',
  );
  assert.equal(view(guest).observation!.self.hand.length, beforeLostAck + 1);
  assert.equal(view(guest).observation!.phase, 'draw');
  report.lostAckCommitted =
    report.exactEnvelopeReplay =
    report.lostAckPageReloadRecovered =
    report.duplicateDrawAvoided =
      true;

  const beforeOfflineDeadline = view(guest).authority!.deadline;
  assert(beforeOfflineDeadline !== null);
  await disconnectAll([host, guest]);
  await new Promise((resolve) => setTimeout(resolve, 500));
  host = participant(url, host.storage);
  guest = participant(url, guest.storage);
  await rejoin([host, guest]);
  assert(
    view(guest).authority!.deadline! >= beforeOfflineDeadline + 300,
    'Disconnected time consumed the full-turn budget',
  );
  assert.equal(view(guest).observation!.phase, 'draw');
  report.allDisconnectedBudgetFreezeInferredFromPublicDeadline = true;
  const leading = [host, guest].find((item) => view(item).room.hostId === view(item).memberId)!;
  await action(leading, { type: 'pause', paused: true }, [host, guest]);
  assert(view(host).room.paused && view(guest).room.paused);
  assert.equal(view(host).authority!.deadline, null);
  await disconnectAll([host, guest]);
  host = participant(url, host.storage);
  guest = participant(url, guest.storage);
  await rejoin([host, guest]);
  assert(view(host).room.paused && view(host).room.pauseReason === 'host');
  assert.equal(view(host).authority!.deadline, null);
  report.hostPausePreservedAfterAllOffline = true;
  const resumedHost = [host, guest].find((item) => view(item).room.hostId === view(item).memberId)!;
  await action(resumedHost, { type: 'pause', paused: false }, [host, guest]);
  assert(!view(guest).room.paused && view(guest).authority!.deadline !== null);
  assert.equal(view(guest).observation!.phase, 'draw');
  report.privacyPackets = privacyPackets;
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const client of clients) client.dispose();
  await server?.close();
  rmSync(directory, { recursive: true, force: true });
}
