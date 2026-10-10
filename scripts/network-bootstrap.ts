import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRoomServer } from '../server/transport';
import { createNetworkClient, type NetworkSocket } from '../src/network/client';
import { getLegalCommands } from '../src/core';
import type {
  ClientPacket,
  ExpectedCommand,
  NetworkClientApi,
  RoomAction,
  RoomSnapshot,
  ServerPacket,
} from '../src/network/protocol';
import type { GameCommand } from '../src/shared/types';

type Bootstrap = Extract<ClientPacket, { type: 'create' | 'join' }>;
type Welcome = Extract<ServerPacket, { type: 'welcome' }>;
const directory = mkdtempSync(join(tmpdir(), 'europe-bootstrap-'));
const dbPath = join(directory, 'rooms.sqlite');
const clients: NetworkClientApi[] = [];
const sockets = new Set<WebSocket>();
let server: Awaited<ReturnType<typeof createRoomServer>> | null = null;
let fatal: Error | null = null;
let privacyPackets = 0;
const settings = {
  seats: 2 as const,
  difficulty: 'normal' as const,
  turnSeconds: 600,
  admissionOpen: true,
};
const report = {
  transport: 'Node native WebSocket + actual createNetworkClient + temporary SQLite',
  journal: 'Separate Map-backed Storage adapters reused across client recreation',
  isolatedTemporaryServer: true,
  browserAndLiveServersUsed: false,
  restarts: 0,
  cases: [] as Array<{
    operation: 'create' | 'join';
    serverRestart: boolean;
    welcomeDroppedAndNativeSocketClosed: boolean;
    exactOriginalPacketReplayed: boolean;
    originalIdentityRecovered: boolean;
    roomCountStable: boolean;
    memberCount: number;
    wrongProofCode: string;
    changedPayloadCode: string;
    changedRequestIdCode: string;
  }>,
  bot: {
    scheduledDelayMs: 400,
    observedCompletionMs: 0,
    invalidReadySent: 0,
    invalidReadyRejected: 0,
    completedWhileRejectionsContinued: false,
  },
  privacyPackets: 0,
};

function journal() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}
type Journal = ReturnType<typeof journal>;
interface Faults {
  dropWelcome: boolean;
  dropped: number;
  closed: number;
  bootstraps: string[];
  welcomes: Welcome[];
  errors: string[];
}
function faults(dropWelcome = false): Faults {
  return { dropWelcome, dropped: 0, closed: 0, bootstraps: [], welcomes: [], errors: [] };
}
function privacy(packet: ServerPacket, observed: Faults) {
  if (packet.type !== 'snapshot' && packet.type !== 'welcome') return;
  const snapshot = packet.snapshot;
  for (const field of ['credential', 'identities', 'bootstrapSecret'])
    assert(!(field in snapshot) && !(field in snapshot.room), 'Private identity leaked');
  for (const member of snapshot.room.members)
    for (const field of ['secret', 'hash', 'credential', 'bootstrapSecret'])
      assert(!(field in member), 'Private identity leaked in public room member');
  const publicText = JSON.stringify(snapshot);
  for (const data of observed.bootstraps) {
    const packet = JSON.parse(data) as Bootstrap;
    assert(!publicText.includes(packet.bootstrapSecret), 'Bootstrap proof leaked in snapshot');
  }
  for (const welcome of observed.welcomes)
    assert(!publicText.includes(welcome.credential.secret), 'Resume credential leaked in snapshot');
  const observation = snapshot.observation;
  if (observation) {
    for (const field of ['seed', 'rng', 'deck', 'discard', 'ticketDeck', 'unusedTickets'])
      assert(!(field in observation), 'Hidden game state leaked in observation');
    for (const player of observation.players) {
      assert(!('hand' in player) && !('ticketOptions' in player), 'Private cards leaked');
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
class BootstrapSocket implements NetworkSocket {
  private native: WebSocket;
  private suppressed = false;
  onopen: WebSocket['onopen'] = null;
  onmessage: WebSocket['onmessage'] = null;
  onclose: WebSocket['onclose'] = null;
  onerror: WebSocket['onerror'] = null;
  constructor(address: string, observed: Faults, storage: Journal) {
    this.native = new WebSocket(address);
    sockets.add(this.native);
    this.native.onopen = (event) => this.onopen?.call(this.native, event);
    this.native.onclose = (event) => {
      observed.closed++;
      sockets.delete(this.native);
      this.onclose?.call(this.native, event);
    };
    this.native.onerror = (event) => this.onerror?.call(this.native, event);
    this.native.onmessage = (event) => {
      try {
        assert.equal(typeof event.data, 'string', 'Unexpected native transport payload');
        const packet = JSON.parse(event.data as string) as ServerPacket;
        if (packet.type === 'welcome') observed.welcomes.push(packet);
        if (packet.type === 'error') observed.errors.push(packet.code);
        privacy(packet, observed);
        if (packet.type === 'welcome' && observed.dropWelcome) {
          observed.dropWelcome = false;
          observed.dropped++;
          this.suppressed = true;
          this.native.close(1000, 'Bootstrap QA lost welcome');
          return;
        }
        if (!this.suppressed) this.onmessage?.call(this.native, event);
      } catch {
        fatal = new Error('Native bootstrap privacy/protocol assertion failed');
        this.native.close();
      }
    };
    this.send = (data) => {
      if (typeof data === 'string') {
        const packet = JSON.parse(data) as ClientPacket;
        if (packet.type === 'create' || packet.type === 'join') {
          assert(/^[0-9a-f]{64}$/i.test(packet.bootstrapSecret), 'Invalid 256-bit bootstrap proof');
          const saved = storage.getItem(`europe-network-v1:${address}`);
          assert(
            saved?.includes(packet.requestId) && saved.includes(packet.bootstrapSecret),
            'Bootstrap was sent before its private tab journal was persisted',
          );
          observed.bootstraps.push(data);
        }
      }
      this.native.send(data);
    };
  }
  get readyState() {
    return this.native.readyState;
  }
  send!: NetworkSocket['send'];
  close() {
    this.native.close();
  }
}
function participant(address: string, storage = journal(), observed = faults()) {
  const client = createNetworkClient({
    url: address,
    storage,
    requestTimeoutMs: 4000,
    reconnectDelays: [2000, 2000, 2000],
    socketFactory: (url) => new BootstrapSocket(url, observed, storage),
  });
  clients.push(client);
  return { client, storage, faults: observed };
}
type Participant = ReturnType<typeof participant>;
async function waitFor(predicate: () => boolean, label: string, timeout = 6000) {
  const until = Date.now() + timeout;
  while (!predicate()) {
    if (fatal) throw fatal;
    assert(Date.now() < until, `Bootstrap QA timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  if (fatal) throw fatal;
}
async function connected(item: Participant) {
  await waitFor(
    () =>
      item.client.getState().connection === 'connected' &&
      !!item.client.getState().snapshot &&
      !item.client.getState().pendingRequest,
    'personal client authentication',
  );
  assert.equal(item.client.getState().error, null, 'Client authentication failed');
}
function view(item: Participant): RoomSnapshot {
  const snapshot = item.client.getState().snapshot;
  assert(snapshot, 'Expected an authenticated personal snapshot');
  return snapshot;
}
function roomCount() {
  const database = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return Number(database.prepare('SELECT COUNT(*) AS count FROM rooms').get()!.count);
  } finally {
    database.close();
  }
}
async function restart(address: string) {
  assert(server, 'Expected the owned temporary server');
  await server.close();
  server = null;
  server = await createRoomServer({ port: Number(new URL(address).port), dbPath, botDelayMs: 400 });
  assert.equal(server.url, address, 'Temporary server URL changed on persisted restart');
  report.restarts++;
}
async function denied(address: string, packet: Bootstrap, code: string) {
  const native = new WebSocket(address);
  sockets.add(native);
  const received: ServerPacket[] = [];
  let closed = false;
  native.onclose = () => {
    sockets.delete(native);
    closed = true;
  };
  native.onerror = () => {
    fatal = new Error('Raw bootstrap probe transport failed');
  };
  native.onmessage = (event) => {
    try {
      received.push(JSON.parse(String(event.data)) as ServerPacket);
    } catch {
      fatal = new Error('Raw bootstrap probe returned invalid JSON');
    }
  };
  try {
    await waitFor(() => native.readyState === WebSocket.OPEN, 'raw bootstrap probe connection');
    native.send(JSON.stringify(packet));
    await waitFor(() => received.some((value) => value.type === 'error'), 'bootstrap denial');
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert(
      !received.some((value) => value.type === 'welcome'),
      'Denied bootstrap granted a welcome',
    );
    const error = received.find((value) => value.type === 'error')!;
    assert.equal(error.code, code, 'Unexpected bootstrap denial code');
    return error.code;
  } finally {
    native.close();
    await waitFor(() => closed, 'raw bootstrap probe close');
  }
}
async function lostWelcome(operation: 'create' | 'join', serverRestart: boolean, address: string) {
  const roomsBefore = roomCount();
  let host: Participant | null = null;
  if (operation === 'join') {
    host = participant(address);
    host.client.create('Проверка ведущего', settings);
    await connected(host);
  }
  let item = participant(address, journal(), faults(true));
  if (operation === 'create') item.client.create('Проверка создания', settings);
  else item.client.join('Проверка входа', view(host!).room.code);
  await waitFor(
    () => item.faults.dropped === 1 && item.faults.closed >= 1,
    'lost welcome and actual native disconnect',
  );
  assert.equal(item.client.getState().snapshot, null, 'Dropped welcome reached the real client');
  assert.equal(item.faults.bootstraps.length, 1, 'Unexpected first bootstrap send count');
  const original = item.faults.bootstraps[0]!;
  const packet = JSON.parse(original) as Bootstrap;
  const firstWelcome = item.faults.welcomes[0]!;
  item.client.dispose();
  const storage = item.storage,
    observed = item.faults;
  const saved = storage.getItem(`europe-network-v1:${address}`);
  assert(
    saved?.includes(packet.requestId) && saved.includes(packet.bootstrapSecret),
    'Lost welcome journal disappeared',
  );
  if (serverRestart) {
    host?.client.dispose();
    await restart(address);
    if (host) {
      host = participant(address, host.storage);
      await connected(host);
    }
  }
  item = participant(address, storage, observed);
  await connected(item);
  assert.equal(observed.bootstraps.length, 2, 'Expected one initial send and one bootstrap replay');
  assert(observed.bootstraps[1] === original, 'Reload changed the original bootstrap packet');
  const recovered = view(item),
    finalWelcome = observed.welcomes.at(-1)!;
  assert(
    recovered.room.id === firstWelcome.snapshot.room.id &&
      recovered.memberId === firstWelcome.snapshot.memberId &&
      finalWelcome.credential.secret === firstWelcome.credential.secret,
    'Bootstrap replay created a different identity or credential',
  );
  assert.equal(
    recovered.room.members.length,
    operation === 'create' ? 1 : 2,
    'Bootstrap left a duplicate reserved seat',
  );
  assert.equal(roomCount(), roomsBefore + 1, 'Lost welcome created a ghost room');
  const wrongProof = `${packet.bootstrapSecret[0] === '0' ? '1' : '0'}${packet.bootstrapSecret.slice(1)}`;
  const wrongProofCode = await denied(
    address,
    { ...packet, bootstrapSecret: wrongProof },
    'BOOTSTRAP_DENIED',
  );
  const changedPayloadCode = await denied(
    address,
    { ...packet, name: 'Изменённое имя' },
    'BOOTSTRAP_REUSED',
  );
  const changedRequestIdCode = await denied(
    address,
    { ...packet, requestId: crypto.randomUUID() },
    'BOOTSTRAP_REUSED',
  );
  assert.equal(roomCount(), roomsBefore + 1, 'Denied bootstrap changed the room count');
  assert.equal(
    view(item).room.members.length,
    operation === 'create' ? 1 : 2,
    'Denied bootstrap added a member',
  );
  report.cases.push({
    operation,
    serverRestart,
    welcomeDroppedAndNativeSocketClosed: observed.dropped === 1 && observed.closed >= 1,
    exactOriginalPacketReplayed: observed.bootstraps[1] === original,
    originalIdentityRecovered: true,
    roomCountStable: true,
    memberCount: recovered.room.members.length,
    wrongProofCode,
    changedPayloadCode,
    changedRequestIdCode,
  });
  item.client.dispose();
  host?.client.dispose();
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
async function action(item: Participant, value: RoomAction) {
  const room = view(item).room;
  assert(
    item.client.roomAction(value, { roomId: room.id, revision: room.revision }),
    'Room action refused locally',
  );
  await waitFor(() => !item.client.getState().pendingRequest, 'room acknowledgement');
  assert.equal(item.client.getState().error, null, 'Server rejected required room action');
}
async function command(item: Participant, value: GameCommand) {
  assert(item.client.command(value, expected(view(item))), 'Game command refused locally');
  await waitFor(() => !item.client.getState().pendingCommand, 'game acknowledgement');
  assert.equal(item.client.getState().error, null, 'Server rejected required game command');
}
async function botRejections(address: string) {
  const host = participant(address);
  host.client.create('Проверка таймера', settings);
  await connected(host);
  await action(host, { type: 'bot', seatId: 1, enabled: true });
  await action(host, { type: 'ready', ready: true });
  await action(host, { type: 'start' });
  const initialTickets = getLegalCommands(view(host).observation!).find(
    (value) => value.type === 'chooseTickets' && value.ticketIds.length === 2,
  );
  assert(initialTickets, 'No legal initial ticket selection');
  const began = performance.now();
  await command(host, initialTickets);
  assert.equal(view(host).authority!.activeSeat, 1, 'Expected bot setup authority');
  const rejectsBefore = host.faults.errors.length;
  const spam = setInterval(() => {
    const room = view(host).room;
    if (
      host.client.roomAction(
        { type: 'ready', ready: true },
        { roomId: room.id, revision: room.revision },
      )
    )
      report.bot.invalidReadySent++;
  }, 20);
  try {
    await waitFor(
      () => view(host).authority!.activeSeat === 0 && view(host).observation!.phase === 'action',
      'bot completion during rejected ready spam',
      1000,
    );
    report.bot.observedCompletionMs = Math.round(performance.now() - began);
    assert(report.bot.observedCompletionMs < 1000, 'Rejected ready spam postponed bot turn');
    assert(report.bot.invalidReadySent >= 5, 'Insufficient rejected requests during the bot timer');
    await new Promise((resolve) => setTimeout(resolve, 75));
    report.bot.invalidReadyRejected = host.faults.errors
      .slice(rejectsBefore)
      .filter((code) => code === 'LOBBY_REQUIRED').length;
    assert(report.bot.invalidReadyRejected >= 5, 'Missing native server rejection evidence');
    report.bot.completedWhileRejectionsContinued = true;
  } finally {
    clearInterval(spam);
    host.client.dispose();
  }
}

try {
  server = await createRoomServer({ port: 0, dbPath, botDelayMs: 400 });
  const address = server.url;
  for (const serverRestart of [false, true])
    for (const operation of ['create', 'join'] as const)
      await lostWelcome(operation, serverRestart, address);
  await botRejections(address);
  report.privacyPackets = privacyPackets;
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const client of clients) client.dispose();
  for (const native of sockets) native.close();
  await server?.close();
  rmSync(directory, { recursive: true, force: true });
}
