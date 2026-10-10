import assert from 'node:assert/strict';
import { createNetworkClient } from '../src/network/client';
import type {
  NetworkClientApi,
  NetworkClientState,
  RoomAction,
  SeatCount,
  ServerPacket,
} from '../src/network/protocol';
import { chooseBotCommand } from '../src/bots';
import type { GameCommand } from '../src/shared/types';

const url = process.env.EUROPE_WS_URL ?? 'ws://127.0.0.1:8787';
const clients: NetworkClientApi[] = [];
const report = {
  transport: 'native WebSocket / browser client',
  rooms: [] as { seats: number; commands: number; endButtons: number; finished: boolean }[],
  isolated: false,
  seatRace: false,
  deniedAdmin: false,
  privatePackets: 0,
};

function memoryJournal() {
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
  assert(!('credential' in snapshot.room));
  assert(
    snapshot.room.members.every((member) => !('secret' in member) && !('credential' in member)),
  );
  const observation = snapshot.observation;
  if (observation) {
    for (const forbidden of ['seed', 'rng', 'deck', 'discard', 'ticketDeck', 'unusedTickets'])
      assert(!(forbidden in observation), `Private state field: ${forbidden}`);
    for (const player of observation.players) {
      assert(!('hand' in player) && !('ticketOptions' in player));
      if (observation.phase !== 'finished') assert(!('tickets' in player));
    }
    assert.equal(
      observation.self.id,
      snapshot.room.members.find((member) => member.id === snapshot.memberId)?.seatId,
    );
  }
  report.privatePackets++;
}
function client() {
  const item = createNetworkClient({
    url,
    storage: memoryJournal(),
    socketFactory: (address) => {
      const socket = new WebSocket(address);
      socket.addEventListener('message', (event) => {
        if (typeof event.data === 'string') privacy(JSON.parse(event.data));
      });
      return socket;
    },
  });
  clients.push(item);
  return item;
}
function waitFor(
  item: NetworkClientApi,
  condition: (state: NetworkClientState) => boolean,
  timeout = 15_000,
): Promise<NetworkClientState> {
  if (condition(item.getState())) return Promise.resolve(item.getState());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error('Timed out waiting for network state'));
    }, timeout);
    const unsubscribe = item.subscribe(() => {
      const state = item.getState();
      if (condition(state)) {
        clearTimeout(timer);
        unsubscribe();
        resolve(state);
      }
    });
  });
}
async function action(item: NetworkClientApi, command: RoomAction, accepted = true) {
  const room = item.getState().snapshot!.room;
  assert(
    item.roomAction(command, { roomId: room.id, revision: room.revision }),
    'Client refused room action',
  );
  const state = await waitFor(item, (current) => !current.pendingRequest);
  if (accepted) assert.equal(state.error, null);
  return state;
}
async function command(item: NetworkClientApi, value: GameCommand | { type: 'endTurn' }) {
  const snapshot = item.getState().snapshot!;
  const authority = snapshot.authority!;
  const expected = {
    matchId: authority.matchId,
    revision: authority.revision,
    turnId: authority.turnId,
    controlEpoch: authority.controlEpoch,
    seatId: snapshot.room.members.find((member) => member.id === snapshot.memberId)!.seatId,
  };
  assert(item.command(value, expected), 'Client refused game command');
  const state = await waitFor(item, (current) => !current.pendingCommand);
  assert.equal(state.error, null);
  return state;
}
async function start(seats: SeatCount, race: boolean) {
  const host = client(),
    guest = client();
  host.create('Ведущий проверки', {
    seats,
    difficulty: 'normal',
    turnSeconds: 600,
    admissionOpen: true,
  });
  await waitFor(host, (state) => state.connection === 'connected' && !!state.snapshot);
  guest.join('Второй игрок', host.getState().snapshot!.room.code);
  await waitFor(guest, (state) => state.connection === 'connected' && !!state.snapshot);
  if (race) {
    await action(guest, { type: 'start' }, false);
    assert.equal(guest.getState().snapshot!.room.status, 'lobby');
    assert(guest.getState().error);
    guest.clearError();
    report.deniedAdmin = true;
    await Promise.all([
      action(host, { type: 'seat', seatId: 2 }, false),
      action(guest, { type: 'seat', seatId: 2 }, false),
    ]);
    await waitFor(host, (state) => state.snapshot!.room.seats[2]!.kind === 'human');
    assert.equal(
      host.getState().snapshot!.room.members.filter((member) => member.seatId === 2).length,
      1,
    );
    assert.equal([host, guest].filter((item) => !!item.getState().error).length, 1);
    host.clearError();
    guest.clearError();
    report.seatRace = true;
  }
  for (const seat of host.getState().snapshot!.room.seats)
    if (seat.kind === 'open') await action(host, { type: 'bot', seatId: seat.id, enabled: true });
  await action(host, { type: 'ready', ready: true });
  await waitFor(
    guest,
    (state) => state.snapshot!.room.revision >= host.getState().snapshot!.room.revision,
  );
  await action(guest, { type: 'ready', ready: true });
  await waitFor(
    host,
    (state) => state.snapshot!.room.revision >= guest.getState().snapshot!.room.revision,
  );
  await action(host, { type: 'start' });
  await waitFor(guest, (state) => !!state.snapshot?.observation);
  return [host, guest];
}
async function finish(players: NetworkClientApi[], seats: number) {
  let commands = 0,
    endButtons = 0;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline && commands < 4000) {
    if (players[0]!.getState().snapshot?.observation?.phase === 'finished') {
      assert(players[0]!.getState().snapshot?.result?.finished);
      report.rooms.push({ seats, commands, endButtons, finished: true });
      return;
    }
    let acted = false;
    for (const item of players) {
      const state = item.getState(),
        snapshot = state.snapshot;
      if (
        state.connection !== 'connected' ||
        state.pendingCommand ||
        state.pendingRequest ||
        !snapshot?.canAct ||
        !snapshot.observation
      )
        continue;
      if (snapshot.pendingTurn) {
        const authority = snapshot.authority!;
        const expected = {
          matchId: authority.matchId,
          revision: authority.revision,
          turnId: authority.turnId,
          controlEpoch: authority.controlEpoch,
          seatId: snapshot.room.members.find((member) => member.id === snapshot.memberId)!.seatId,
        };
        assert.equal(
          item.command({ type: 'draw', source: 'deck' }, expected),
          false,
          'An extra draw bypassed End',
        );
        await command(item, { type: 'endTurn' });
        endButtons++;
      } else await command(item, chooseBotCommand(snapshot.observation, 'normal'));
      commands++;
      acted = true;
    }
    if (!acted) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Network match did not finish');
}
try {
  const three = await start(3, true);
  const isolated = client();
  isolated.create('Отдельная комната', {
    seats: 2,
    difficulty: 'normal',
    turnSeconds: 600,
    admissionOpen: true,
  });
  await waitFor(isolated, (state) => state.connection === 'connected' && !!state.snapshot);
  const isolatedRevision = isolated.getState().snapshot!.room.revision;
  await action(three[0]!, { type: 'pause', paused: true });
  assert.equal(isolated.getState().snapshot!.room.revision, isolatedRevision);
  assert(!isolated.getState().snapshot!.room.paused);
  assert.notEqual(isolated.getState().snapshot!.room.id, three[0]!.getState().snapshot!.room.id);
  await action(three[0]!, { type: 'pause', paused: false });
  report.isolated = true;
  await action(isolated, { type: 'bot', seatId: 1, enabled: true });
  await action(isolated, { type: 'ready', ready: true });
  await action(isolated, { type: 'start' });
  await Promise.all([finish(three, 3), finish([isolated], 2)]);
  for (const count of [4, 5] as const) {
    const participants = await start(count, false);
    await finish(participants, count);
  }
  console.log(JSON.stringify(report, null, 2));
} finally {
  for (const item of clients) {
    item.leave();
    item.dispose();
  }
}
