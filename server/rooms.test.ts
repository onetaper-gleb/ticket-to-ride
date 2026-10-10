import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getClaimOptions, getObservation } from '../src/core';
import { chooseBotCommand } from '../src/bots';
import type { GameCommand } from '../src/shared/types';
import type {
  ClientPacket,
  CommandEnvelope,
  ResumeCredential,
  RoomAction,
  RoomSnapshot,
  ServerPacket,
  SeatCount,
} from '../src/network/protocol';
import { RoomService, type TurnGuard } from './rooms';
import { SQLiteRoomStore } from './store';
import { canonical, copy, gameReplyOwner } from './model';
import { createTurnTimers } from './timers';

const cleanup: Array<() => void | Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function harness(
  options: {
    path?: string;
    budget?: number;
    onSchedule?: (roomId: string, guard: TurnGuard, delay: number) => void;
  } = {},
) {
  let now = 1_000,
    failCommit = false,
    loseAck = false,
    loseWelcome = false,
    closed = false,
    counter = 0;
  const store = new SQLiteRoomStore(options.path, {
    beforeCommit: () => {
      if (failCommit) throw new Error('private database detail');
    },
  });
  const packets = new Map<string, ServerPacket[]>(),
    snapshots = new Map<string, RoomSnapshot>(),
    credentials = new Map<string, ResumeCredential>(),
    bootstrapPackets = new Map<string, Extract<ClientPacket, { type: 'create' | 'join' }>>();
  const schedules = new Map<string, TurnGuard>();
  const disconnected: string[] = [];
  const serviceOptions = {
    now: () => now,
    turnBudgetMs: options.budget ?? 1000,
    send: (id: string, packet: ServerPacket) => {
      if (packet.type === 'ack' && loseAck) throw new Error('Lost acknowledgement');
      if (packet.type === 'welcome' && loseWelcome) throw new Error('Lost welcome');
      packets.get(id)?.push(copy(packet));
      if (packet.type === 'snapshot' || packet.type === 'welcome')
        snapshots.set(id, copy(packet.snapshot));
      if (packet.type === 'welcome') credentials.set(id, copy(packet.credential));
    },
    disconnect: (id: string) => disconnected.push(id),
    onSchedule: (roomId: string, guard: TurnGuard, delay: number) => {
      schedules.set(roomId, copy(guard));
      options.onSchedule?.(roomId, guard, delay);
    },
  };
  let service = new RoomService(store, serviceOptions);
  const h = {
    store,
    packets,
    snapshots,
    credentials,
    bootstrapPackets,
    schedules,
    disconnected,
    get service() {
      return service;
    },
    get now() {
      return now;
    },
    set now(value: number) {
      now = value;
    },
    set fail(value: boolean) {
      failCommit = value;
    },
    set loseAck(value: boolean) {
      loseAck = value;
    },
    set loseWelcome(value: boolean) {
      loseWelcome = value;
    },
    snapshot: (id: string) => snapshots.get(id)!,
    connect: (id: string) => {
      packets.set(id, []);
      service.connect(id);
    },
    receive: (id: string, packet: ClientPacket) => service.receive(id, packet),
    async create(id = 'a', seats: SeatCount = 2) {
      h.connect(id);
      const packet: Extract<ClientPacket, { type: 'create' }> = {
        type: 'create',
        requestId: `r${++counter}`,
        protocol: 1,
        bootstrapSecret: randomBytes(32).toString('hex'),
        name: id,
        settings: { seats, difficulty: 'normal', turnSeconds: 30, admissionOpen: true },
      };
      bootstrapPackets.set(id, packet);
      await service.receive(id, packet);
    },
    async join(id: string, from = 'a') {
      h.connect(id);
      const packet: Extract<ClientPacket, { type: 'join' }> = {
        type: 'join',
        requestId: `r${++counter}`,
        protocol: 1,
        bootstrapSecret: randomBytes(32).toString('hex'),
        name: id,
        code: h.snapshot(from).room.code,
      };
      bootstrapPackets.set(id, packet);
      await service.receive(id, packet);
    },
    roomPacket(id: string, action: RoomAction): Extract<ClientPacket, { type: 'room' }> {
      const s = h.snapshot(id);
      return {
        type: 'room',
        requestId: `r${++counter}`,
        roomId: s.room.id,
        revision: s.room.revision,
        action,
      };
    },
    room(id: string, action: RoomAction) {
      return service.receive(id, h.roomPacket(id, action));
    },
    envelope(
      id: string,
      command: GameCommand | { type: 'endTurn' },
      commandId = `c${++counter}`,
    ): CommandEnvelope {
      const s = h.snapshot(id),
        a = s.authority!;
      return {
        commandId,
        matchId: a.matchId,
        seatId: s.observation!.self.id,
        revision: a.revision,
        turnId: a.turnId,
        controlEpoch: a.controlEpoch,
        command,
      };
    },
    command(id: string, command: GameCommand | { type: 'endTurn' }) {
      return service.receive(id, { type: 'command', envelope: h.envelope(id, command) });
    },
    async start(seats: SeatCount = 2) {
      await h.create('a', seats);
      await h.join('b');
      for (let i = 2; i < seats; i++) await h.room('a', { type: 'bot', seatId: i, enabled: true });
      await h.room('a', { type: 'ready', ready: true });
      await h.room('b', { type: 'ready', ready: true });
      await h.room('a', { type: 'start' });
    },
    async setup() {
      for (const id of ['a', 'b'])
        await h.command(id, {
          type: 'chooseTickets',
          ticketIds: h
            .snapshot(id)
            .observation!.self.ticketOptions.slice(0, 2)
            .map((t) => t.id),
        });
    },
    async tick() {
      const s = h.snapshot('a');
      await service.tick(s.room.id, schedules.get(s.room.id)!);
    },
    async resume(id: string, credential: ResumeCredential) {
      h.connect(id);
      await service.receive(id, {
        type: 'resume',
        requestId: `r${++counter}`,
        protocol: 1,
        credential,
      });
    },
    async restart(mutate?: (room: ReturnType<SQLiteRoomStore['loadRooms']>[number]) => void) {
      await service.close();
      if (mutate) {
        const r = store.loadRooms()[0]!;
        mutate(r);
        store.commit(r, { type: 'test-fixture' });
      }
      service = new RoomService(store, serviceOptions);
      schedules.clear();
    },
    async close() {
      if (closed) return;
      closed = true;
      failCommit = false;
      await service.close();
      store.close();
    },
  };
  cleanup.push(() => h.close());
  return h;
}
function lastError(h: ReturnType<typeof harness>, id: string) {
  return h.packets
    .get(id)!
    .filter((p) => p.type === 'error')
    .at(-1) as Extract<ServerPacket, { type: 'error' }> | undefined;
}
function lastAck(h: ReturnType<typeof harness>, id: string) {
  return h.packets
    .get(id)!
    .filter((p) => p.type === 'ack')
    .at(-1) as Extract<ServerPacket, { type: 'ack' }> | undefined;
}

describe('authoritative rooms', () => {
  it('does not postpone a bot timer when inactive humans submit rejected room or game requests', async () => {
    let sequence = 0;
    const pending = new Map<number, { callback: () => void; at: number }>();
    const timers = createTurnTimers((roomId, guard) => h.service.tick(roomId, guard), {
      set(callback, delay) {
        const id = ++sequence;
        pending.set(id, { callback, at: h.now + delay });
        return id;
      },
      clear(id) {
        pending.delete(id as number);
      },
    });
    const h = harness({ onSchedule: timers.schedule });
    cleanup.push(() => timers.close());
    await h.start(3);
    await h.setup();
    const s = h.snapshot('a'),
      originalGuard = copy(s.authority),
      scheduled = [...pending.values()][0]!;
    expect(s.authority!.activeSeat).toBe(2);
    expect(scheduled.at).toBe(h.now + 180);
    for (const elapsed of [50, 100, 150]) {
      h.now = 1000 + elapsed;
      await h.room('a', { type: 'ready', ready: true });
      expect(lastError(h, 'a')!.code).toBe('LOBBY_REQUIRED');
      await h.command('b', { type: 'draw', source: 'deck' });
      expect(lastAck(h, 'b')!.ack.code).toBe('NO_CONTROL');
      expect(h.snapshot('a').authority).toEqual(originalGuard);
      expect([...pending.values()]).toEqual([scheduled]);
    }
    h.now = scheduled.at;
    pending.clear();
    scheduled.callback();
    for (let i = 0; i < 12; i++) await Promise.resolve();
    expect(h.snapshot('a').authority!.activeSeat).toBe(0);
    expect(h.snapshot('a').observation!.phase).toBe('action');
    expect(
      h.store.readJournal(s.room.id).some((entry) => (entry as { type: string }).type === 'bot'),
    ).toBe(true);
  });
  it('recovers lost create and join welcomes on the same or a new socket without extra rooms or members', async () => {
    const h = harness();
    h.loseWelcome = true;
    await h.create();
    const created = h.store.loadRooms()[0]!,
      createPacket = h.bootstrapPackets.get('a')!;
    expect(h.credentials.size).toBe(0);
    h.loseWelcome = false;
    await h.receive('a', createPacket);
    expect(h.snapshot('a').room.id).toBe(created.view.id);
    expect(h.snapshot('a').room.revision).toBe(created.view.revision);
    expect(h.credentials.get('a')!.secret).toBe(createPacket.bootstrapSecret);
    h.loseWelcome = true;
    await h.join('b');
    const joinPacket = h.bootstrapPackets.get('b')!,
      joined = h.store.loadRooms()[0]!.view.members.find((m) => m.name === 'b')!;
    expect(h.credentials.has('b')).toBe(false);
    h.loseWelcome = false;
    h.connect('b-new');
    await h.receive('b-new', joinPacket);
    expect(h.snapshot('b-new').memberId).toBe(joined.id);
    expect(h.disconnected).toContain('b');
    expect(h.store.loadRooms()).toHaveLength(1);
    expect(h.snapshot('b-new').room.members).toHaveLength(2);
    const lease = h.store.loadRooms()[0]!.identities[joined.id]!.lease;
    await h.receive('b-new', joinPacket);
    expect(h.store.loadRooms()[0]!.identities[joined.id]!.lease).toBe(lease);
    for (const packet of [createPacket, joinPacket]) {
      const receipt = h.store.findBootstrap('id', packet.requestId)!;
      expect(Object.keys(JSON.parse(receipt.reply)).sort()).toEqual(['memberId', 'roomId']);
      expect(
        JSON.stringify([h.store.loadRooms(), h.store.readJournal(created.view.id), receipt]),
      ).not.toContain(packet.bootstrapSecret);
      expect(
        JSON.stringify([...h.packets.values()].flat().filter((p) => p.type !== 'welcome')),
      ).not.toContain(packet.bootstrapSecret);
    }
  });
  it.each(['create', 'join'] as const)(
    'recovers a lost %s welcome after closing and reopening the actual SQLite database',
    async (kind) => {
      const folder = mkdtempSync(join(tmpdir(), 'europe-bootstrap-'));
      cleanup.push(() => rmSync(folder, { recursive: true, force: true }));
      const path = join(folder, 'room.sqlite'),
        before = harness({ path });
      if (kind === 'join') await before.create();
      before.loseWelcome = true;
      if (kind === 'create') await before.create();
      else await before.join('b');
      const packet = copy(before.bootstrapPackets.get(kind === 'create' ? 'a' : 'b')!),
        room = before.store.loadRooms()[0]!,
        member = room.view.members.find((m) => m.name === packet.name)!;
      await before.close();
      const after = harness({ path });
      after.connect('reloaded');
      await after.receive('reloaded', packet);
      expect(after.credentials.get('reloaded')).toEqual({
        roomId: room.view.id,
        memberId: member.id,
        secret: packet.bootstrapSecret,
      });
      expect(after.store.loadRooms()).toHaveLength(1);
      expect(after.snapshot('reloaded').room.members).toHaveLength(kind === 'create' ? 1 : 2);
      expect(
        after.snapshot('reloaded').room.members.find((m) => m.id === member.id)!.connected,
      ).toBe(true);
    },
  );
  it('rejects foreign bootstrap proofs and changed payloads or IDs without another room or seat', async () => {
    const h = harness();
    await h.create();
    await h.join('b');
    h.connect('intruder');
    for (const packet of h.bootstrapPackets.values()) {
      await h.receive('intruder', { ...packet, bootstrapSecret: randomBytes(32).toString('hex') });
      expect(lastError(h, 'intruder')!.code).toBe('BOOTSTRAP_DENIED');
      await h.receive('intruder', { ...packet, name: 'Changed' });
      expect(lastError(h, 'intruder')!.code).toBe('BOOTSTRAP_REUSED');
      await h.receive('intruder', { ...packet, requestId: `other-${packet.requestId}` });
      expect(lastError(h, 'intruder')!.code).toBe('BOOTSTRAP_REUSED');
    }
    expect(h.packets.get('intruder')!.some((p) => p.type === 'welcome')).toBe(false);
    expect(h.store.loadRooms()).toHaveLength(1);
    expect(h.store.loadRooms()[0]!.view.members).toHaveLength(2);
    const joinPacket = h.bootstrapPackets.get('b')!;
    await h.room('a', { type: 'kick', memberId: h.credentials.get('b')!.memberId });
    await h.receive('intruder', joinPacket);
    expect(lastError(h, 'intruder')!.code).toBe('MEMBER_REMOVED');
    expect(h.store.loadRooms()[0]!.view.members).toHaveLength(1);
  });
  it('atomically commits bootstrap receipts with membership and lets only one concurrent join claim a seat', async () => {
    const h = harness();
    h.fail = true;
    await h.create();
    const packet = h.bootstrapPackets.get('a')!;
    expect(lastError(h, 'a')!.code).toBe('SERVER_ERROR');
    expect(h.store.loadRooms()).toHaveLength(0);
    expect(h.store.findBootstrap('id', packet.requestId)).toBeNull();
    h.fail = false;
    await h.receive('a', packet);
    h.fail = true;
    await h.join('b');
    const joinPacket = h.bootstrapPackets.get('b')!;
    expect(h.store.findBootstrap('id', joinPacket.requestId)).toBeNull();
    expect(h.store.loadRooms()[0]!.view.members).toHaveLength(1);
    h.fail = false;
    h.connect('c');
    await Promise.all([
      h.receive('b', joinPacket),
      h.receive('c', {
        ...joinPacket,
        requestId: 'competing',
        bootstrapSecret: randomBytes(32).toString('hex'),
        name: 'c',
      }),
    ]);
    expect(h.store.loadRooms()[0]!.view.members).toHaveLength(2);
    expect(h.store.findBootstrap('id', joinPacket.requestId)).not.toBeNull();
    expect(h.store.findBootstrap('id', 'competing')).toBeNull();
    expect(lastError(h, 'c')!.code).toBe('ROOM_FULL');
    await h.receive('b', joinPacket);
    expect(h.snapshot('b').room.members).toHaveLength(2);
  });
  it('isolates game idempotency from another room poison or replay and keeps historical own retries', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    await h.create('x');
    await h.join('y', 'x');
    await h.room('x', { type: 'ready', ready: true });
    await h.room('y', { type: 'ready', ready: true });
    await h.room('x', { type: 'start' });
    const envelope = h.envelope('a', { type: 'draw', source: 'deck' });
    await h.receive('x', { type: 'command', envelope });
    expect(lastAck(h, 'x')!.ack.code).toBe('MATCH_MISMATCH');
    await h.receive('a', { type: 'command', envelope });
    const accepted = copy(lastAck(h, 'a')!.ack);
    expect(accepted.accepted).toBe(true);
    expect(h.snapshot('a').observation!.self.hand).toHaveLength(5);
    await h.receive('x', { type: 'command', envelope });
    expect(lastAck(h, 'x')!.ack.accepted).toBe(false);
    expect(h.snapshot('x').observation!.self.hand).toHaveLength(4);
    await h.room('a', { type: 'endMatch', matchId: envelope.matchId, confirmed: true });
    await h.room('a', { type: 'lobby' });
    await h.room('a', { type: 'ready', ready: true });
    await h.room('b', { type: 'ready', ready: true });
    await h.room('a', { type: 'start' });
    const next = copy(h.snapshot('a'));
    await h.receive('a', { type: 'command', envelope });
    expect(lastAck(h, 'a')!.ack).toEqual(accepted);
    expect(h.snapshot('a')).toEqual(next);
  });
  it('migrates a legacy committed game ack into its journal-authenticated room on restart', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'europe-legacy-'));
    cleanup.push(() => rmSync(folder, { recursive: true, force: true }));
    const h = harness();
    await h.start();
    await h.setup();
    const envelope = h.envelope('a', { type: 'draw', source: 'deck' });
    await h.receive('a', { type: 'command', envelope });
    const ack = copy(lastAck(h, 'a')!.ack),
      room = h.store.loadRooms()[0]!;
    const path = join(folder, 'room.sqlite'),
      oldStore = new SQLiteRoomStore(path);
    oldStore.commit(
      room,
      { type: 'command', memberId: h.credentials.get('a')!.memberId, envelope, accepted: true },
      {
        scope: 'game',
        owner: envelope.matchId,
        actor: '0',
        id: envelope.commandId,
        payload: canonical(envelope),
        reply: JSON.stringify(ack),
      },
    );
    oldStore.close();
    const store = new SQLiteRoomStore(path),
      packets: ServerPacket[] = [];
    const service = new RoomService(store, {
      send: (_id, packet) => packets.push(packet),
      now: () => h.now,
    });
    cleanup.push(async () => {
      await service.close();
      store.close();
    });
    expect(store.findReply('game', envelope.matchId, '0', envelope.commandId)).toBeNull();
    expect(
      JSON.parse(
        store.findReply(
          'game',
          gameReplyOwner(room.view.id, envelope.matchId),
          '0',
          envelope.commandId,
        )!.reply,
      ),
    ).toEqual(ack);
    service.connect('restored');
    await service.receive('restored', {
      type: 'resume',
      requestId: 'resume',
      protocol: 1,
      credential: h.credentials.get('a')!,
    });
    await service.receive('restored', { type: 'command', envelope });
    expect(
      (packets.filter((p) => p.type === 'ack').at(-1) as Extract<ServerPacket, { type: 'ack' }>)
        .ack,
    ).toEqual(ack);
  });
  it('times out ticket choice and pending End without granting the old seat another action', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    await h.command('a', { type: 'drawTickets' });
    const options = h.snapshot('a').observation!.self.ticketOptions;
    expect(options).toHaveLength(3);
    h.now += 1000;
    await h.tick();
    await h.tick();
    expect(h.snapshot('a').authority!.activeSeat).toBe(1);
    expect(h.snapshot('a').observation!.self.ticketOptions).toHaveLength(0);
    expect(h.snapshot('a').observation!.self.tickets.length).toBeGreaterThan(2);
    await h.command('b', { type: 'draw', source: 'deck' });
    await h.command('b', { type: 'draw', source: 'deck' });
    const hand = h.snapshot('b').observation!.self.hand;
    h.now += 1000;
    await h.tick();
    expect(h.snapshot('b').pendingTurn).toBeNull();
    expect(h.snapshot('b').observation!.self.hand).toEqual(hand);
    expect(h.snapshot('b').authority!.activeSeat).toBe(0);
    expect(h.snapshot('a').canAct).toBe(true);
    expect(h.snapshot('b').canAct).toBe(false);
  });
  it.each([3, 4, 5] as SeatCount[])(
    'finishes an authoritative %i-seat match with two humans and server bots',
    async (seats) => {
      const h = harness();
      await h.start(seats);
      let steps = 0;
      while (h.snapshot('a').room.status === 'playing' && steps++ < 3000) {
        const s = h.snapshot('a'),
          seat = s.authority!.activeSeat;
        if (seat < 2) {
          const id = seat === 0 ? 'a' : 'b',
            own = h.snapshot(id);
          await h.command(
            id,
            own.pendingTurn ? { type: 'endTurn' } : chooseBotCommand(own.observation!, 'normal'),
          );
        } else await h.tick();
      }
      const end = h.snapshot('a');
      expect(steps).toBeLessThan(3000);
      expect(end.room.status).toBe('finished');
      expect(end.observation!.phase).toBe('finished');
      expect(end.result!.finished).toBe(true);
      expect(end.result!.standings).toHaveLength(seats);
      expect(end.result!.standings.some((s) => s.winner)).toBe(true);
      expect(end.pendingTurn).toBeNull();
      expect(end.canAct).toBe(false);
      const game = h.store.loadRooms()[0]!.game!;
      expect([
        ...game.deck,
        ...game.market,
        ...game.discard,
        ...game.players.flatMap((p) => p.hand),
      ]).toHaveLength(110);
      expect([
        ...game.ticketDeck,
        ...game.unusedTickets,
        ...game.players.flatMap((p) => [...p.tickets, ...p.ticketOptions]),
      ]).toHaveLength(46);
    },
  );
  it('sends only the receiving seat private cards and keeps two rooms isolated', async () => {
    const h = harness();
    await h.start();
    await h.create('other');
    const sa = h.snapshot('a'),
      sb = h.snapshot('b');
    expect(sa.observation!.self.id).toBe(0);
    expect(sb.observation!.self.id).toBe(1);
    expect(sa.observation!.self.hand).not.toEqual(sb.observation!.self.hand);
    for (const s of [sa, sb]) {
      expect(s.room.members.every((m) => !('secret' in m) && !('hash' in m))).toBe(true);
      expect(
        s.observation!.players.every(
          (p) => !('hand' in p) && !('ticketOptions' in p) && !('tickets' in p),
        ),
      ).toBe(true);
      for (const key of ['seed', 'rng', 'deck', 'discard', 'ticketDeck', 'unusedTickets'])
        expect(s.observation).not.toHaveProperty(key);
      expect(s.observation!.self.ticketOptions).toHaveLength(4);
    }
    const otherCount = h.packets.get('other')!.length;
    await h.command('a', {
      type: 'chooseTickets',
      ticketIds: sa.observation!.self.ticketOptions.slice(0, 2).map((t) => t.id),
    });
    expect(h.packets.get('other')).toHaveLength(otherCount);
    const broadcasts = [...h.packets.values()].flat().filter((p) => p.type !== 'welcome');
    const encoded = JSON.stringify(broadcasts);
    for (const credential of h.credentials.values())
      expect(encoded).not.toContain(credential.secret);
    expect(encoded).not.toContain('"hash"');
    expect(encoded).not.toContain('"rng"');
  });

  it('keeps one budget across both draws and requires End from every human seat', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    const deadline = h.snapshot('a').authority!.deadline;
    await h.command('a', { type: 'draw', source: 'deck' });
    h.now += 100;
    expect(h.snapshot('a').observation!.phase).toBe('draw');
    expect(h.snapshot('a').authority!.deadline).toBe(deadline);
    await h.command('a', { type: 'draw', source: 'deck' });
    expect(h.snapshot('a').authority!.activeSeat).toBe(0);
    expect(h.snapshot('a').observation!.activePlayer).toBe(1);
    expect(h.snapshot('a').pendingTurn).not.toBeNull();
    expect(h.snapshot('a').canAct).toBe(true);
    expect(h.snapshot('b').pendingTurn).toBeNull();
    expect(h.snapshot('b').canAct).toBe(false);
    await h.command('a', { type: 'draw', source: 'deck' });
    expect(lastAck(h, 'a')!.ack.code).toBe('END_REQUIRED');
    await h.command('b', { type: 'draw', source: 'deck' });
    expect(lastAck(h, 'b')!.ack.code).toBe('NO_CONTROL');
    const before = h.snapshot('a').room.revision;
    await h.command('a', { type: 'endTurn' });
    expect(lastAck(h, 'a')!.ack.roomRevision).toBeGreaterThan(before);
    expect(h.snapshot('b').canAct).toBe(true);
    await h.command('b', { type: 'draw', source: 'deck' });
    await h.command('b', { type: 'draw', source: 'deck' });
    expect(h.snapshot('b').pendingTurn).not.toBeNull();
    expect(h.snapshot('b').authority!.activeSeat).toBe(1);
    await h.command('b', { type: 'endTurn' });
    expect(h.snapshot('a').canAct).toBe(true);
  });

  it('rejects spoofed seats, admin rights, stale revision, turn and epoch', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    await h.room('b', { type: 'pause', paused: true });
    expect(lastError(h, 'b')!.code).toBe('HOST_REQUIRED');
    expect(h.snapshot('a').room.paused).toBe(false);
    const valid = h.envelope('a', { type: 'draw', source: 'deck' });
    await h.receive('b', { type: 'command', envelope: valid });
    expect(lastError(h, 'b')!.code).toBe('WRONG_SEAT');
    for (const field of ['revision', 'turnId', 'controlEpoch'] as const) {
      const e = copy(valid);
      e.commandId = `stale-${field}`;
      if (field === 'turnId') e.turnId += 'old';
      else e[field]++;
      await h.receive('a', { type: 'command', envelope: e });
      expect(lastAck(h, 'a')!.ack.code).toBe('STALE_COMMAND');
    }
    expect(h.snapshot('a').observation!.self.hand).toHaveLength(4);
  });

  it('replays a durable lost ack once and rejects an ID reused for another payload', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    const envelope = h.envelope('a', { type: 'draw', source: 'deck' });
    h.loseAck = true;
    await h.receive('a', { type: 'command', envelope });
    h.loseAck = false;
    const committed = h.snapshot('a'),
      journal = h.store.readJournal(committed.room.id).length;
    expect(committed.observation!.self.hand).toHaveLength(5);
    await h.receive('a', { type: 'command', envelope });
    expect(lastAck(h, 'a')!.ack.accepted).toBe(true);
    expect(h.snapshot('a').observation!.self.hand).toHaveLength(5);
    expect(h.store.readJournal(committed.room.id)).toHaveLength(journal);
    await h.receive('a', {
      type: 'command',
      envelope: { ...envelope, command: { type: 'drawTickets' } },
    });
    expect(lastError(h, 'a')!.code).toBe('COMMAND_ID_REUSED');
    expect(h.snapshot('a').observation!.phase).toBe('draw');
  });

  it('rolls back state, journal and ack together before publishing memory', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    const before = copy(h.snapshot('a')),
      envelope = h.envelope('a', { type: 'draw', source: 'deck' });
    const journal = h.store.readJournal(before.room.id).length;
    h.fail = true;
    await h.receive('a', { type: 'command', envelope });
    h.fail = false;
    expect(lastError(h, 'a')!.code).toBe('SERVER_ERROR');
    expect(lastError(h, 'a')!.message).not.toContain('private database detail');
    expect(h.store.readJournal(before.room.id)).toHaveLength(journal);
    expect(
      h.store.findReply(
        'game',
        gameReplyOwner(before.room.id, envelope.matchId),
        '0',
        envelope.commandId,
      ),
    ).toBeNull();
    await h.receive('a', { type: 'sync' });
    expect(h.snapshot('a')).toEqual(before);
    await h.receive('a', { type: 'command', envelope });
    expect(lastAck(h, 'a')!.ack.accepted).toBe(true);
    expect(h.snapshot('a').observation!.self.hand).toHaveLength(5);
  });

  it('serializes competing seat requests and deduplicates room requests before stale guards', async () => {
    const h = harness();
    await h.create('a', 3);
    await h.join('b');
    const a = h.roomPacket('a', { type: 'seat', seatId: 2 }),
      b = h.roomPacket('b', { type: 'seat', seatId: 2 });
    await Promise.all([h.receive('a', a), h.receive('b', b)]);
    expect(h.snapshot('a').room.seats[2]!.memberId).toBe(h.credentials.get('a')!.memberId);
    expect(lastError(h, 'b')!.code).toBe('ROOM_STALE');
    const revision = h.snapshot('a').room.revision;
    await h.receive('a', a);
    expect(h.snapshot('a').room.revision).toBe(revision);
    await h.receive('a', { ...a, action: { type: 'seat', seatId: 0 } });
    expect(lastError(h, 'a')!.code).toBe('REQUEST_ID_REUSED');
  });

  it('does not apply stale host settings or a confirmation from a previous match', async () => {
    const h = harness();
    await h.create('a');
    const oldSettings = h.roomPacket('a', { type: 'settings', settings: { difficulty: 'easy' } });
    await h.join('b');
    await h.receive('a', oldSettings);
    expect(lastError(h, 'a')!.code).toBe('ROOM_STALE');
    expect(h.snapshot('a').room.settings.difficulty).toBe('normal');
    await h.room('a', { type: 'ready', ready: true });
    await h.room('b', { type: 'ready', ready: true });
    await h.room('a', { type: 'start' });
    const oldConfirm = h.roomPacket('a', {
      type: 'endMatch',
      matchId: h.snapshot('a').authority!.matchId,
      confirmed: true,
    });
    await h.room('a', {
      type: 'endMatch',
      matchId: h.snapshot('a').authority!.matchId,
      confirmed: true,
    });
    await h.room('a', { type: 'lobby' });
    await h.room('a', { type: 'ready', ready: true });
    await h.room('b', { type: 'ready', ready: true });
    await h.room('a', { type: 'start' });
    const match = h.snapshot('a').authority!.matchId;
    await h.receive('a', oldConfirm);
    expect(lastError(h, 'a')!.code).toBe('ROOM_STALE');
    await h.receive('a', {
      ...oldConfirm,
      requestId: 'current-revision-old-match',
      revision: h.snapshot('a').room.revision,
    });
    expect(lastError(h, 'a')!.code).toBe('MATCH_MISMATCH');
    expect(h.snapshot('a').authority!.matchId).toBe(match);
  });

  it('restores the same partial draw, replaces the old socket lease and rejects old envelopes', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    await h.command('a', { type: 'draw', source: 'deck' });
    const old = h.envelope('a', { type: 'draw', source: 'deck' }),
      credential = h.credentials.get('a')!;
    await h.resume('a2', credential);
    expect(h.disconnected).toContain('a');
    expect(h.snapshot('a2').observation!.phase).toBe('draw');
    expect(h.snapshot('a2').observation!.self.hand).toHaveLength(5);
    await h.receive('a2', { type: 'command', envelope: old });
    expect(lastAck(h, 'a2')!.ack.code).toBe('STALE_COMMAND');
    await h.receive('a', { type: 'command', envelope: old });
    expect(h.snapshot('a2').observation!.self.hand).toHaveLength(5);
    await h.command('a2', { type: 'draw', source: 'deck' });
    expect(h.snapshot('a2').pendingTurn).not.toBeNull();
  });

  it('restores draw and ticket choice after restart with a fresh whole-turn budget', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'europe-server-'));
    cleanup.push(() => rmSync(folder, { recursive: true, force: true }));
    const h = harness({ path: join(folder, 'rooms.sqlite') });
    await h.start();
    await h.setup();
    await h.command('a', { type: 'draw', source: 'deck' });
    const credential = h.credentials.get('a')!,
      old = h.snapshot('a');
    h.now += 900;
    await h.restart();
    h.now += 10_000;
    await h.resume('a2', credential);
    expect(h.snapshot('a2').observation!.phase).toBe('draw');
    expect(h.snapshot('a2').observation!.self.hand).toEqual(old.observation!.self.hand);
    expect(h.snapshot('a2').authority!.deadline).toBe(h.now + 1000);
    await h.command('a2', { type: 'draw', source: 'deck' });
    await h.command('a2', { type: 'endTurn' });
    await h.resume('b2', h.credentials.get('b')!);
    await h.command('b2', { type: 'drawTickets' });
    const options = h.snapshot('b2').observation!.self.ticketOptions;
    await h.restart();
    await h.resume('b3', h.credentials.get('b2')!);
    expect(h.snapshot('b3').observation!.phase).toBe('tickets');
    expect(h.snapshot('b3').observation!.self.ticketOptions).toEqual(options);
    await h.command('b3', { type: 'chooseTickets', ticketIds: [options[0]!.id] });
    expect(h.snapshot('b3').pendingTurn).not.toBeNull();
    for (const path of ['rooms.sqlite', 'rooms.sqlite-wal', 'rooms.sqlite-shm'])
      expect(statSync(join(folder, path)).mode & 0o777).toBe(0o600);
  });

  it('preserves a pending tunnel over restart and lets timeout bot finish the partial phase', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    const credential = h.credentials.get('a')!;
    await h.restart((room) => {
      const game = room.game!,
        edge = game.edges.find((e) => e.tunnel && e.color === 'gray' && e.length === 2)!;
      game.deck.push(...game.players[0]!.hand);
      game.players[0]!.hand = [];
      for (let i = 0; i < 2; i++) {
        const index = game.deck.findIndex((c) => c.color === 'blue');
        game.players[0]!.hand.push(game.deck.splice(index, 1)[0]!);
      }
      const revealed = [];
      for (let i = 0; i < 3; i++) {
        const index = game.deck.findIndex((c) => c.color === 'blue');
        revealed.push(game.deck.splice(index, 1)[0]!);
      }
      game.deck.unshift(...revealed);
      expect(getClaimOptions(getObservation(game, 0), edge.id).length).toBeGreaterThan(0);
    });
    await h.resume('a2', credential);
    await h.resume('b2', h.credentials.get('b')!);
    const observation = h.snapshot('a2').observation!,
      edge = observation.edges.find((e) => e.tunnel && e.color === 'gray' && e.length === 2)!;
    await h.command('a2', {
      type: 'claim',
      edgeId: edge.id,
      cardIds: getClaimOptions(observation, edge.id)[0]!.cardIds,
    });
    expect(h.snapshot('a2').observation!.phase).toBe('tunnel');
    const tunnel = h.snapshot('a2').observation!.pendingTunnel;
    await h.restart();
    await h.resume('a3', credential);
    await h.resume('b3', h.credentials.get('b')!);
    expect(h.snapshot('a3').observation!.pendingTunnel).toEqual(tunnel);
    h.now += 1000;
    await h.tick();
    expect(h.snapshot('a3').room.members.find((m) => m.seatId === 0)!.control).toBe('bot');
    await h.tick();
    expect(h.snapshot('a3').observation!.phase).toBe('action');
    expect(h.snapshot('a3').authority!.activeSeat).toBe(1);
  });

  it('takes over a partial draw once, rejects late timer and returns human only next own turn', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    await h.command('a', { type: 'draw', source: 'deck' });
    const stale = copy(h.schedules.get(h.snapshot('a').room.id)!);
    h.now += 1000;
    await h.tick();
    expect(h.snapshot('a').room.members.find((m) => m.seatId === 0)!.control).toBe('bot');
    const revision = h.snapshot('a').room.revision;
    await h.service.tick(h.snapshot('a').room.id, stale);
    expect(h.snapshot('a').room.revision).toBe(revision);
    await h.tick();
    expect(h.snapshot('a').authority!.activeSeat).toBe(1);
    expect(h.snapshot('a').observation!.self.hand).toHaveLength(6);
    expect(h.snapshot('a').canAct).toBe(false);
    await h.command('b', { type: 'draw', source: 'deck' });
    await h.command('b', { type: 'draw', source: 'deck' });
    await h.command('b', { type: 'endTurn' });
    expect(h.snapshot('a').canAct).toBe(true);
    expect(h.snapshot('a').room.members.find((m) => m.seatId === 0)!.control).toBe('human');
  });

  it('pauses with all humans offline and retries a failed disconnect without corrupting a resumed lease', async () => {
    const h = harness();
    await h.start();
    await h.setup();
    h.now += 200;
    h.fail = true;
    await expect(h.service.disconnected('a')).rejects.toThrow();
    h.fail = false;
    expect(h.store.loadRooms()[0]!.view.members.find((m) => m.seatId === 0)!.connected).toBe(true);
    await h.service.disconnected('a');
    await h.service.disconnected('b');
    expect(h.store.loadRooms()[0]!.view.pauseReason).toBe('disconnected');
    const saved = h.store.loadRooms()[0]!.game;
    h.now += 10_000;
    await h.resume('a2', h.credentials.get('a')!);
    expect(h.snapshot('a2').room.paused).toBe(false);
    expect(h.snapshot('a2').authority!.deadline).toBe(h.now + 800);
    expect(h.store.loadRooms()[0]!.game).toEqual(saved);
    await h.service.disconnected('a');
    expect(h.snapshot('a2').room.members.find((m) => m.seatId === 0)!.connected).toBe(true);
  });

  it('authenticates resume, migrates host and removes only the leaving member despite an older revision', async () => {
    const h = harness();
    await h.create();
    await h.join('b');
    const leave = h.roomPacket('a', { type: 'leave' });
    const credential = h.credentials.get('a')!;
    await h.resume('wrong', { ...credential, secret: 'wrong' });
    expect(lastError(h, 'wrong')!.code).toBe('RESUME_INVALID');
    await h.room('b', { type: 'ready', ready: true });
    await h.receive('a', leave);
    expect(h.snapshot('b').room.members).toHaveLength(1);
    expect(h.snapshot('b').room.hostId).toBe(h.credentials.get('b')!.memberId);
    await h.resume('removed', credential);
    expect(lastError(h, 'removed')!.code).toBe('MEMBER_REMOVED');
  });

  it('relays voice only to the current authorized member in its own room and stops after kick', async () => {
    const h = harness();
    await h.create();
    await h.join('b');
    await h.create('other');
    const signal = { type: 'state', generation: 'generation-1', enabled: true } as const;
    await h.receive('a', { type: 'voice', targetId: h.credentials.get('b')!.memberId, signal });
    expect(h.packets.get('b')!.at(-1)).toEqual({
      type: 'voice',
      fromId: h.credentials.get('a')!.memberId,
      signal,
    });
    const count = h.packets.get('other')!.length;
    await h.receive('a', { type: 'voice', targetId: h.credentials.get('other')!.memberId, signal });
    expect(lastError(h, 'a')!.code).toBe('VOICE_TARGET');
    expect(h.packets.get('other')).toHaveLength(count);
    await h.room('a', { type: 'kick', memberId: h.credentials.get('b')!.memberId });
    const kickedCount = h.packets.get('b')!.length;
    await h.receive('a', { type: 'voice', targetId: h.credentials.get('b')!.memberId, signal });
    expect(h.packets.get('b')).toHaveLength(kickedCount);
    expect(h.disconnected).toContain('b');
  });
});
