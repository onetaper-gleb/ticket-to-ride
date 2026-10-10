import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { getGameResult, getObservation } from '../src/core';
import { chooseBotCommand } from '../src/bots';
import type {
  ClientPacket,
  CommandAck,
  CommandEnvelope,
  ResumeCredential,
  RoomMember,
  RoomSnapshot,
  ServerPacket,
} from '../src/network/protocol';
import type { GameCommand } from '../src/shared/types';
import { applyPrivateCommand, createPrivateGame } from './game-random';
import { canonical, copy, gameReplyOwner, type StoredReply, type StoredRoom } from './model';
import { SQLiteRoomStore } from './store';
import { cleanName, validPacket, validSettings } from './validation';

export interface TurnGuard {
  turnId: string;
  controlEpoch: number;
  revision: number;
}
export interface RoomServiceOptions {
  send: (connectionId: string, packet: ServerPacket) => void;
  disconnect?: (connectionId: string) => void;
  now?: () => number;
  onSchedule?: (roomId: string, guard: TurnGuard, delayMs: number) => void;
  turnBudgetMs?: number;
  botDelayMs?: number;
}
interface Binding {
  roomId: string;
  memberId: string;
  lease: number;
}
type BootstrapPacket = Extract<ClientPacket, { type: 'create' | 'join' }>;
class RoomError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function deny(code: string, message: string): never {
  throw new RoomError(code, message);
}
const digest = (secret: string) => createHash('sha256').update(secret).digest('hex');
const memberAt = (room: StoredRoom, seat: number) =>
  room.view.members.find((m) => m.seatId === seat);

export class RoomService {
  private rooms = new Map<string, StoredRoom>();
  private connections = new Map<string, Binding | null>();
  private queues = new Map<string, Promise<unknown>>();
  private now: () => number;
  private closed = false;
  private closing = false;
  constructor(
    private store: SQLiteRoomStore,
    private options: RoomServiceOptions,
  ) {
    this.now = options.now ?? Date.now;
    for (const stored of store.loadRooms()) {
      const room = copy(stored);
      for (const member of room.view.members) member.connected = false;
      if (room.view.status === 'playing') {
        room.view.paused = true;
        if (room.view.pauseReason !== 'host') room.view.pauseReason = 'disconnected';
        room.remainingMs = this.budget(room);
        if (room.authority) {
          room.authority.deadline = null;
          room.authority.revision++;
        }
      }
      room.view.revision++;
      store.commit(room, { type: 'restart' });
      this.rooms.set(room.view.id, room);
    }
  }
  connect(connectionId: string): void {
    if (!this.closed && !this.closing) this.connections.set(connectionId, null);
  }
  private send(connectionId: string, packet: ServerPacket) {
    if (!this.connections.has(connectionId)) return;
    try {
      this.options.send(connectionId, packet);
    } catch {
      /* The committed reply remains available for retry. */
    }
  }
  private error(connectionId: string, error: unknown, requestId?: string) {
    const e =
      error instanceof RoomError
        ? error
        : new RoomError('SERVER_ERROR', 'Сервер не смог сохранить действие. Повторите запрос.');
    this.send(connectionId, {
      type: 'error',
      ...(requestId ? { requestId } : {}),
      code: e.code,
      message: e.message,
    });
  }
  private queue<T>(roomId: string, action: () => T | Promise<T>): Promise<T> {
    const previous = this.queues.get(roomId) ?? Promise.resolve();
    const task = previous.catch(() => {}).then(action);
    this.queues.set(roomId, task);
    void task
      .finally(() => {
        if (this.queues.get(roomId) === task) this.queues.delete(roomId);
      })
      .catch(() => {});
    return task;
  }
  private budget(room: StoredRoom) {
    return this.options.turnBudgetMs ?? room.view.settings.turnSeconds * 1000;
  }
  private authenticated(connectionId: string): {
    room: StoredRoom;
    member: RoomMember;
    binding: Binding;
  } {
    const binding = this.connections.get(connectionId);
    if (!binding) deny('AUTH_REQUIRED', 'Сначала войдите в комнату.');
    const room = this.rooms.get(binding.roomId);
    const member = room?.view.members.find((m) => m.id === binding.memberId);
    if (!room || !member || room.identities[member.id]?.lease !== binding.lease)
      deny('SESSION_REPLACED', 'Подключение больше не управляет этим местом.');
    return { room, member, binding };
  }
  private bump(room: StoredRoom) {
    room.view.revision++;
    if (room.authority) {
      room.authority.revision++;
      room.authority.controlEpoch = room.epochs[room.authority.activeSeat]!;
      if (room.pending) room.pending.revision = room.authority.revision;
    }
  }
  private publish(room: StoredRoom, entry: unknown, reply?: StoredReply) {
    this.store.commit(room, entry, reply);
    this.rooms.set(room.view.id, room);
    this.broadcast(room);
    this.schedule(room);
  }
  snapshot(room: StoredRoom, memberId: string): RoomSnapshot {
    const member = room.view.members.find((m) => m.id === memberId)!;
    const observation = room.game ? getObservation(room.game, member.seatId) : null;
    if (observation && room.authority) observation.revision = room.authority.revision;
    return {
      room: copy(room.view),
      memberId,
      authority: copy(room.authority),
      observation,
      result: room.game?.phase === 'finished' ? getGameResult(room.game) : null,
      pendingTurn:
        room.pending?.seatId === member.seatId
          ? { revision: room.pending.revision, message: room.pending.message }
          : null,
      canAct:
        !!room.authority &&
        room.view.status === 'playing' &&
        !room.view.paused &&
        member.connected &&
        member.control === 'human' &&
        member.seatId === room.authority.activeSeat,
    };
  }
  private broadcast(room: StoredRoom) {
    for (const [id, binding] of this.connections)
      if (
        binding?.roomId === room.view.id &&
        room.identities[binding.memberId]?.lease === binding.lease &&
        room.view.members.some((m) => m.id === binding.memberId)
      )
        this.send(id, { type: 'snapshot', snapshot: this.snapshot(room, binding.memberId) });
  }
  private schedule(room: StoredRoom) {
    if (this.closed || room.view.status !== 'playing' || room.view.paused || !room.authority)
      return;
    const authority = room.authority;
    const member = memberAt(room, authority.activeSeat);
    const bot = !member || member.control === 'bot';
    this.options.onSchedule?.(
      room.view.id,
      {
        turnId: authority.turnId,
        controlEpoch: authority.controlEpoch,
        revision: authority.revision,
      },
      bot
        ? (this.options.botDelayMs ?? 180)
        : Math.max(0, (authority.deadline ?? this.now()) - this.now()),
    );
  }
  private beginTurn(room: StoredRoom) {
    if (!room.game || !room.authority) return;
    const seat = room.game.activePlayer;
    const member = memberAt(room, seat);
    if (member?.control === 'bot' && member.returnPending && member.connected) {
      member.control = 'human';
      member.returnPending = false;
      member.controlEpoch = ++room.epochs[seat]!;
    }
    room.authority.activeSeat = seat;
    room.authority.turnId = `${room.authority.matchId}:${++room.turnSerial}:${seat}`;
    room.authority.controlEpoch = room.epochs[seat]!;
    room.authority.awaitingEnd = false;
    room.authority.deadline = room.view.paused ? null : this.now() + this.budget(room);
    room.remainingMs = this.budget(room);
  }
  private connectivity(room: StoredRoom) {
    const connected = room.view.members
      .filter((m) => m.connected)
      .sort((a, b) => a.seatId - b.seatId);
    if (!connected.some((m) => m.id === room.view.hostId))
      room.view.hostId = (connected[0] ?? room.view.members[0])?.id ?? '';
    if (room.view.status !== 'playing' || !room.authority) return;
    if (!connected.length && room.view.pauseReason !== 'host') {
      if (!room.view.paused)
        room.remainingMs = Math.max(0, (room.authority.deadline ?? this.now()) - this.now());
      room.view.paused = true;
      room.view.pauseReason = 'disconnected';
      room.authority.deadline = null;
    } else if (connected.length && room.view.pauseReason === 'disconnected') {
      room.view.paused = false;
      room.view.pauseReason = null;
      room.authority.deadline = this.now() + (room.remainingMs ?? this.budget(room));
    }
  }
  private addMember(room: StoredRoom, name: string, seatId: number, secret: string) {
    const id = randomUUID();
    const member: RoomMember = {
      id,
      name: cleanName(name),
      seatId,
      connected: true,
      ready: false,
      control: 'human',
      controlEpoch: room.epochs[seatId]!,
      returnPending: false,
    };
    room.view.members.push(member);
    room.view.seats[seatId] = { id: seatId, kind: 'human', memberId: id, name: member.name };
    room.identities[id] = { hash: digest(secret), lease: 1 };
    return {
      member,
      credential: { roomId: room.view.id, memberId: id, secret } satisfies ResumeCredential,
    };
  }
  private bootstrapPayload(packet: BootstrapPacket) {
    const { bootstrapSecret: _secret, ...publicPacket } = packet;
    return publicPacket;
  }
  private bootstrapReceipt(packet: BootstrapPacket, roomId: string, memberId: string): StoredReply {
    return {
      scope: 'bootstrap',
      owner: digest(packet.bootstrapSecret),
      actor: packet.type,
      id: packet.requestId,
      payload: canonical(this.bootstrapPayload(packet)),
      reply: JSON.stringify({ roomId, memberId }),
    };
  }
  private replayBootstrap(connectionId: string, packet: BootstrapPacket): boolean {
    const proof = digest(packet.bootstrapSecret),
      previous = this.store.findBootstrap('id', packet.requestId);
    if (previous) {
      if (!timingSafeEqual(Buffer.from(previous.owner, 'hex'), Buffer.from(proof, 'hex')))
        deny('BOOTSTRAP_DENIED', 'Не удалось подтвердить запрос входа.');
      if (
        previous.actor !== packet.type ||
        previous.payload !== canonical(this.bootstrapPayload(packet))
      )
        deny('BOOTSTRAP_REUSED', 'Этот запрос входа уже использован с другими параметрами.');
      const { roomId, memberId } = JSON.parse(previous.reply) as Pick<
        ResumeCredential,
        'roomId' | 'memberId'
      >;
      this.restoreMember(
        connectionId,
        { roomId, memberId, secret: packet.bootstrapSecret },
        packet.requestId,
      );
      return true;
    }
    if (this.store.findBootstrap('owner', proof))
      deny('BOOTSTRAP_REUSED', 'Этот запрос входа уже использован с другими параметрами.');
    return false;
  }
  private restoreMember(connectionId: string, credential: ResumeCredential, requestId: string) {
    const binding = this.connections.get(connectionId);
    if (
      binding &&
      (binding.roomId !== credential.roomId || binding.memberId !== credential.memberId)
    )
      deny('ALREADY_JOINED', 'Вы уже вошли в комнату.');
    const existing = this.rooms.get(credential.roomId),
      identity = existing?.identities[credential.memberId];
    const supplied = Buffer.from(digest(credential.secret), 'hex');
    if (!existing) deny('ROOM_NOT_FOUND', 'Комната больше не существует.');
    if (!identity) deny('MEMBER_REMOVED', 'Это место больше не принадлежит участнику.');
    if (!timingSafeEqual(Buffer.from(identity.hash, 'hex'), supplied))
      deny('RESUME_INVALID', 'Не удалось подтвердить право на место.');
    let room = existing;
    if (!binding || binding.lease !== identity.lease) {
      room = copy(existing);
      const member = room.view.members.find((m) => m.id === credential.memberId)!;
      member.connected = true;
      member.controlEpoch = ++room.epochs[member.seatId]!;
      if (member.control === 'bot') member.returnPending = true;
      const lease = ++room.identities[member.id]!.lease;
      this.connectivity(room);
      this.bump(room);
      this.publish(room, { type: 'resume', memberId: member.id });
      for (const [old, previous] of this.connections)
        if (
          old !== connectionId &&
          previous?.roomId === room.view.id &&
          previous.memberId === member.id
        ) {
          this.connections.delete(old);
          this.options.disconnect?.(old);
        }
      this.connections.set(connectionId, { roomId: room.view.id, memberId: member.id, lease });
    }
    this.send(connectionId, {
      type: 'welcome',
      requestId,
      protocol: 1,
      credential,
      snapshot: this.snapshot(room, credential.memberId),
    });
  }
  async receive(connectionId: string, raw: unknown): Promise<void> {
    if (this.closed || this.closing || !this.connections.has(connectionId)) return;
    if (!validPacket(raw)) {
      this.error(
        connectionId,
        new RoomError('INVALID_PACKET', 'Запрос не соответствует протоколу.'),
      );
      return;
    }
    const packet = copy(raw);
    const bootstrapRoom =
      packet.type === 'create' || packet.type === 'join'
        ? this.store.findBootstrap('id', packet.requestId)
        : null;
    const restoredRoomId = bootstrapRoom
      ? (JSON.parse(bootstrapRoom.reply) as { roomId: string }).roomId
      : null;
    const key =
      packet.type === 'create'
        ? (restoredRoomId ?? '$create')
        : packet.type === 'join'
          ? (restoredRoomId ?? this.findCode(packet.code)?.view.id ?? '$join')
          : packet.type === 'resume'
            ? packet.credential.roomId
            : (this.connections.get(connectionId)?.roomId ?? '$unauth');
    await this.queue(key, () => {
      if (this.closed || this.closing || !this.connections.has(connectionId)) return;
      try {
        this.handle(connectionId, packet);
      } catch (error) {
        this.error(connectionId, error, 'requestId' in packet ? packet.requestId : undefined);
      }
    });
  }
  private findCode(code: string) {
    return [...this.rooms.values()].find((room) => room.view.code === code.trim().toUpperCase());
  }
  private handle(connectionId: string, packet: ClientPacket) {
    if (packet.type === 'create') {
      if (this.replayBootstrap(connectionId, packet)) return;
      if (this.connections.get(connectionId)) deny('ALREADY_JOINED', 'Вы уже вошли в комнату.');
      const id = randomUUID();
      const room: StoredRoom = {
        view: {
          id,
          code: randomBytes(8).toString('hex').toUpperCase(),
          revision: 0,
          hostId: '',
          status: 'lobby',
          settings: copy(packet.settings),
          members: [],
          seats: Array.from({ length: packet.settings.seats }, (_, i) => ({
            id: i,
            kind: 'open',
            memberId: null,
            name: 'Свободно',
          })),
          paused: false,
          pauseReason: null,
        },
        identities: {},
        epochs: Array(packet.settings.seats).fill(1),
        game: null,
        authority: null,
        pending: null,
        remainingMs: null,
        turnSerial: 0,
      };
      const { member, credential } = this.addMember(room, packet.name, 0, packet.bootstrapSecret);
      room.view.hostId = member.id;
      this.store.commit(
        room,
        {
          type: 'create',
          packet: this.bootstrapPayload(packet),
          proofHash: digest(packet.bootstrapSecret),
        },
        this.bootstrapReceipt(packet, id, member.id),
      );
      this.rooms.set(id, room);
      this.connections.set(connectionId, { roomId: id, memberId: member.id, lease: 1 });
      this.send(connectionId, {
        type: 'welcome',
        requestId: packet.requestId,
        protocol: 1,
        credential,
        snapshot: this.snapshot(room, member.id),
      });
      return;
    }
    if (packet.type === 'join') {
      if (this.replayBootstrap(connectionId, packet)) return;
      if (this.connections.get(connectionId)) deny('ALREADY_JOINED', 'Вы уже вошли в комнату.');
      const existing = this.findCode(packet.code);
      if (!existing || existing.view.status !== 'lobby' || !existing.view.settings.admissionOpen)
        deny('ROOM_UNAVAILABLE', 'Комната недоступна для входа.');
      const seat = existing.view.seats.find((s) => s.kind === 'open');
      if (!seat) deny('ROOM_FULL', 'Все места заняты.');
      const room = copy(existing),
        { member, credential } = this.addMember(room, packet.name, seat.id, packet.bootstrapSecret);
      this.connectivity(room);
      this.bump(room);
      this.publish(
        room,
        {
          type: 'join',
          memberId: member.id,
          packet: this.bootstrapPayload(packet),
          proofHash: digest(packet.bootstrapSecret),
        },
        this.bootstrapReceipt(packet, room.view.id, member.id),
      );
      this.connections.set(connectionId, { roomId: room.view.id, memberId: member.id, lease: 1 });
      this.send(connectionId, {
        type: 'welcome',
        requestId: packet.requestId,
        protocol: 1,
        credential,
        snapshot: this.snapshot(room, member.id),
      });
      return;
    }
    if (packet.type === 'resume') {
      if (this.connections.get(connectionId)) deny('ALREADY_JOINED', 'Вы уже вошли в комнату.');
      this.restoreMember(connectionId, packet.credential, packet.requestId);
      return;
    }
    const { room, member } = this.authenticated(connectionId);
    if (packet.type === 'sync') {
      this.send(connectionId, { type: 'snapshot', snapshot: this.snapshot(room, member.id) });
      return;
    }
    if (packet.type === 'command') {
      this.command(connectionId, room, member, packet.envelope);
      return;
    }
    if (packet.type === 'room') {
      this.roomAction(connectionId, room, member, packet);
      return;
    }
    if (packet.type === 'voice') {
      const target = room.view.members.find((m) => m.id === packet.targetId && m.connected);
      if (!target || target.id === member.id)
        deny('VOICE_TARGET', 'Участник недоступен для голосового соединения.');
      for (const [id, binding] of this.connections)
        if (
          binding?.roomId === room.view.id &&
          binding.memberId === target.id &&
          room.identities[target.id]?.lease === binding.lease
        )
          this.send(id, { type: 'voice', fromId: member.id, signal: packet.signal });
    }
  }
  private command(
    connectionId: string,
    existing: StoredRoom,
    member: RoomMember,
    envelope: CommandEnvelope,
  ) {
    const payload = canonical(envelope);
    if (envelope.seatId !== member.seatId) deny('WRONG_SEAT', 'Нельзя управлять чужим местом.');
    const previous = this.store.findReply(
      'game',
      gameReplyOwner(existing.view.id, envelope.matchId),
      String(member.seatId),
      envelope.commandId,
    );
    if (previous) {
      if (previous.payload !== payload)
        deny('COMMAND_ID_REUSED', 'Этот идентификатор уже использован другим действием.');
      this.send(connectionId, { type: 'ack', ack: JSON.parse(previous.reply) as CommandAck });
      this.send(connectionId, { type: 'snapshot', snapshot: this.snapshot(existing, member.id) });
      return;
    }
    const room = copy(existing),
      a = room.authority;
    let rejection: string | null = null;
    if (!a || room.view.status !== 'playing' || envelope.matchId !== a.matchId)
      rejection = 'MATCH_MISMATCH';
    else if (
      envelope.revision !== a.revision ||
      envelope.turnId !== a.turnId ||
      envelope.controlEpoch !== a.controlEpoch
    )
      rejection = 'STALE_COMMAND';
    else if (room.view.paused) rejection = 'PAUSED';
    else if (member.control !== 'human' || !member.connected || member.seatId !== a.activeSeat)
      rejection = 'NO_CONTROL';
    else if (a.deadline !== null && this.now() >= a.deadline) rejection = 'TURN_EXPIRED';
    else if (room.pending && envelope.command.type !== 'endTurn') rejection = 'END_REQUIRED';
    else if (!room.pending && envelope.command.type === 'endTurn') rejection = 'ACTION_REQUIRED';
    let message = 'Действие отклонено. Получите актуальное состояние комнаты.';
    if (!rejection) {
      if (envelope.command.type === 'endTurn') {
        room.pending = null;
        this.beginTurn(room);
      } else {
        const error = this.applyGame(room, envelope.command, true);
        if (error) {
          rejection = 'CORE_REJECTED';
          message = error;
        }
      }
      if (!rejection) this.bump(room);
    }
    const accepted = !rejection;
    const ack: CommandAck = {
      commandId: envelope.commandId,
      accepted,
      revision: room.authority?.revision ?? existing.authority?.revision ?? 0,
      roomRevision: accepted ? room.view.revision : existing.view.revision,
      ...(rejection ? { code: rejection, message } : {}),
    };
    const saved: StoredReply = {
      scope: 'game',
      owner: gameReplyOwner(existing.view.id, envelope.matchId),
      actor: String(member.seatId),
      id: envelope.commandId,
      payload,
      reply: JSON.stringify(ack),
    };
    this.publish(
      accepted ? room : copy(existing),
      { type: 'command', memberId: member.id, envelope, accepted },
      saved,
    );
    this.send(connectionId, { type: 'ack', ack });
  }
  private applyGame(room: StoredRoom, command: GameCommand, human: boolean): string | null {
    const before = room.game!,
      beforeSeat = before.activePlayer;
    const transition = applyPrivateCommand(before, command);
    if (transition.error) return transition.error;
    room.game = transition.state;
    if (room.game.phase === 'finished') {
      room.view.status = 'finished';
      room.authority!.awaitingEnd = false;
      room.authority!.deadline = null;
      room.pending = null;
    } else if (
      before.phase !== 'setup' &&
      (room.game.turn !== before.turn || room.game.activePlayer !== beforeSeat)
    ) {
      if (human) {
        room.pending = {
          seatId: beforeSeat,
          revision: room.authority!.revision,
          message: 'Действие выполнено. Нажмите «Завершить ход».',
        };
        room.authority!.awaitingEnd = true;
      } else this.beginTurn(room);
    } else if (
      room.game.activePlayer !== beforeSeat ||
      (before.phase === 'setup' && room.game.phase !== 'setup')
    )
      this.beginTurn(room);
    return null;
  }
  private removeMember(room: StoredRoom, memberId: string) {
    const member = room.view.members.find((m) => m.id === memberId)!;
    room.view.members = room.view.members.filter((m) => m.id !== memberId);
    delete room.identities[memberId];
    room.epochs[member.seatId]++;
    room.view.seats[member.seatId] = {
      id: member.seatId,
      kind: room.view.status === 'lobby' ? 'open' : 'bot',
      memberId: null,
      name: room.view.status === 'lobby' ? 'Свободно' : 'Бот',
    };
    if (room.pending?.seatId === member.seatId) {
      room.pending = null;
      this.beginTurn(room);
    }
    this.connectivity(room);
  }
  private roomAction(
    connectionId: string,
    existing: StoredRoom,
    member: RoomMember,
    packet: Extract<ClientPacket, { type: 'room' }>,
  ) {
    const { requestId, action } = packet;
    const payload = canonical(packet),
      previous = this.store.findReply('room', existing.view.id, member.id, requestId);
    if (previous) {
      if (previous.payload !== payload)
        deny('REQUEST_ID_REUSED', 'Этот идентификатор уже использован другим запросом.');
      this.send(connectionId, JSON.parse(previous.reply) as ServerPacket);
      this.send(connectionId, { type: 'snapshot', snapshot: this.snapshot(existing, member.id) });
      return;
    }
    const room = copy(existing),
      current = room.view.members.find((m) => m.id === member.id)!;
    let removed: string | null = null;
    let response: ServerPacket = {
      type: 'roomAck',
      requestId,
      roomRevision: existing.view.revision,
    };
    try {
      if (packet.roomId !== room.view.id)
        deny('ROOM_MISMATCH', 'Запрос относится к другой комнате.');
      if (
        action.type === 'leave'
          ? packet.revision > room.view.revision
          : packet.revision !== room.view.revision
      )
        deny('ROOM_STALE', 'Комната обновилась. Повторите действие.');
      if (!['ready', 'seat', 'leave'].includes(action.type) && room.view.hostId !== member.id)
        deny('HOST_REQUIRED', 'Это действие доступно только хосту.');
      if (action.type === 'ready') {
        if (room.view.status !== 'lobby') deny('LOBBY_REQUIRED', 'Готовность меняется до старта.');
        current.ready = action.ready;
      } else if (action.type === 'seat') {
        if (room.view.status !== 'lobby') deny('LOBBY_REQUIRED', 'Место меняется до старта.');
        const seat = room.view.seats[action.seatId];
        if (!seat || (seat.kind !== 'open' && seat.memberId !== member.id))
          deny('SEAT_OCCUPIED', 'Это место занято.');
        if (action.seatId !== current.seatId) {
          room.view.seats[current.seatId] = {
            id: current.seatId,
            kind: 'open',
            memberId: null,
            name: 'Свободно',
          };
          room.epochs[current.seatId]++;
          current.seatId = action.seatId;
          current.controlEpoch = ++room.epochs[action.seatId]!;
          current.ready = false;
          room.view.seats[action.seatId] = {
            id: action.seatId,
            kind: 'human',
            memberId: current.id,
            name: current.name,
          };
        }
      } else if (action.type === 'settings') {
        if (room.view.status !== 'lobby') deny('LOBBY_REQUIRED', 'Настройки меняются до старта.');
        const settings = { ...room.view.settings, ...action.settings };
        if (!validSettings(settings)) deny('INVALID_SETTINGS', 'Недопустимые настройки комнаты.');
        if (room.view.seats.slice(settings.seats).some((s) => s.kind !== 'open'))
          deny('SEAT_OCCUPIED', 'Нельзя убрать занятое место.');
        room.view.settings = settings;
        room.view.seats = Array.from(
          { length: settings.seats },
          (_, i) => room.view.seats[i] ?? { id: i, kind: 'open', memberId: null, name: 'Свободно' },
        );
        room.epochs = Array.from({ length: settings.seats }, (_, i) => room.epochs[i] ?? 1);
        for (const m of room.view.members) m.ready = false;
      } else if (action.type === 'bot') {
        if (room.view.status !== 'lobby') deny('LOBBY_REQUIRED', 'Бот выбирается до старта.');
        const seat = room.view.seats[action.seatId];
        if (!seat || seat.kind === 'human') deny('SEAT_OCCUPIED', 'На этом месте участник.');
        seat.kind = action.enabled ? 'bot' : 'open';
        seat.name = action.enabled ? `Бот ${seat.id + 1}` : 'Свободно';
        room.epochs[seat.id]++;
      } else if (action.type === 'start') {
        if (room.view.status !== 'lobby') deny('LOBBY_REQUIRED', 'Матч уже запущен.');
        if (
          room.view.seats.some((s) => s.kind === 'open') ||
          room.view.members.some((m) => !m.ready || !m.connected)
        )
          deny('NOT_READY', 'Заполните места и дождитесь готовности участников.');
        room.game = createPrivateGame(
          room.view.settings.seats,
          room.view.seats.map((s) => s.name),
        );
        room.view.status = 'playing';
        room.view.paused = false;
        room.view.pauseReason = null;
        room.authority = {
          matchId: randomUUID(),
          turnId: '',
          revision: 0,
          activeSeat: 0,
          controlEpoch: room.epochs[0]!,
          deadline: null,
          awaitingEnd: false,
        };
        room.pending = null;
        room.turnSerial = 0;
        this.beginTurn(room);
      } else if (action.type === 'pause') {
        if (room.view.status !== 'playing' || !room.authority)
          deny('MATCH_REQUIRED', 'Нет активного матча.');
        if (action.paused) {
          if (!room.view.paused)
            room.remainingMs = Math.max(0, (room.authority.deadline ?? this.now()) - this.now());
          room.view.paused = true;
          room.view.pauseReason = 'host';
          room.authority.deadline = null;
        } else {
          room.view.paused = false;
          room.view.pauseReason = null;
          room.authority.deadline = this.now() + (room.remainingMs ?? this.budget(room));
          this.connectivity(room);
        }
      } else if (action.type === 'kick') {
        if (
          action.memberId === member.id ||
          !room.view.members.some((m) => m.id === action.memberId)
        )
          deny('INVALID_MEMBER', 'Выберите другого участника.');
        removed = action.memberId;
        this.removeMember(room, removed);
      } else if (action.type === 'leave') {
        removed = member.id;
        this.removeMember(room, removed);
      } else if (action.type === 'endMatch') {
        if (room.view.status !== 'playing') deny('MATCH_REQUIRED', 'Нет активного матча.');
        if (action.matchId !== room.authority?.matchId)
          deny('MATCH_MISMATCH', 'Подтверждение относится к другому матчу.');
        room.view.status = 'finished';
        room.game = null;
        room.authority = null;
        room.pending = null;
        room.view.paused = false;
        room.view.pauseReason = null;
      } else if (action.type === 'lobby') {
        if (room.view.status === 'playing')
          deny('CONFIRM_END', 'Сначала подтвердите завершение активного матча.');
        room.view.status = 'lobby';
        room.game = null;
        room.authority = null;
        room.pending = null;
        room.view.paused = false;
        room.view.pauseReason = null;
        for (const m of room.view.members) {
          m.ready = false;
          m.control = 'human';
          m.returnPending = false;
          m.controlEpoch = ++room.epochs[m.seatId]!;
        }
      }
      this.bump(room);
      response = { type: 'roomAck', requestId, roomRevision: room.view.revision };
    } catch (error) {
      if (!(error instanceof RoomError)) throw error;
      response = { type: 'error', requestId, code: error.code, message: error.message };
    }
    const accepted = response.type === 'roomAck',
      next = accepted ? room : copy(existing);
    this.publish(
      next,
      { type: 'room', memberId: member.id, requestId, action, accepted },
      {
        scope: 'room',
        owner: room.view.id,
        actor: member.id,
        id: requestId,
        payload,
        reply: JSON.stringify(response),
      },
    );
    this.send(connectionId, response);
    if (accepted && removed) {
      for (const [id, binding] of this.connections)
        if (binding?.roomId === room.view.id && binding.memberId === removed) {
          if (removed !== member.id)
            this.send(id, { type: 'kicked', message: 'Вы удалены из комнаты.' });
          this.connections.delete(id);
          this.options.disconnect?.(id);
        }
    }
  }
  async disconnected(connectionId: string): Promise<void> {
    const binding = this.connections.get(connectionId);
    this.connections.delete(connectionId);
    if (!binding || this.closed) return;
    try {
      await this.queue(binding.roomId, () => {
        const existing = this.rooms.get(binding.roomId);
        if (!existing || existing.identities[binding.memberId]?.lease !== binding.lease) return;
        const room = copy(existing),
          member = room.view.members.find((m) => m.id === binding.memberId)!;
        member.connected = false;
        this.connectivity(room);
        this.bump(room);
        this.publish(room, { type: 'disconnect', memberId: member.id });
      });
    } catch (error) {
      // Retain the lease for a retry; a newer resume lease makes the retry harmless.
      if (!this.closed && !this.connections.has(connectionId))
        this.connections.set(connectionId, binding);
      throw error;
    }
  }
  async tick(roomId: string, guard: TurnGuard): Promise<void> {
    await this.queue(roomId, () => {
      const existing = this.rooms.get(roomId),
        a = existing?.authority;
      if (
        this.closed ||
        this.closing ||
        !existing ||
        !a ||
        existing.view.status !== 'playing' ||
        existing.view.paused ||
        guard.turnId !== a.turnId ||
        guard.controlEpoch !== a.controlEpoch ||
        guard.revision !== a.revision
      )
        return;
      const room = copy(existing),
        member = memberAt(room, a.activeSeat);
      if (member?.control === 'human') {
        if (a.deadline === null || this.now() < a.deadline) {
          this.schedule(existing);
          return;
        }
        member.control = 'bot';
        member.returnPending = member.connected;
        member.controlEpoch = ++room.epochs[member.seatId]!;
        if (room.pending) {
          room.pending = null;
          this.beginTurn(room);
        }
        this.bump(room);
        this.publish(room, { type: 'timeout', seatId: member.seatId });
        return;
      }
      let command: GameCommand | null = null;
      if (room.pending) {
        room.pending = null;
        this.beginTurn(room);
      } else {
        command = chooseBotCommand(
          getObservation(room.game!, a.activeSeat),
          room.view.settings.difficulty,
        );
        const error = this.applyGame(room, command, false);
        if (error) throw new Error('Bot command rejected');
      }
      this.bump(room);
      this.publish(room, { type: 'bot', seatId: a.activeSeat, command });
    });
  }
  async close(): Promise<void> {
    this.closing = true;
    await Promise.all([...this.connections.keys()].map((id) => this.disconnected(id)));
    this.closed = true;
    await Promise.allSettled([...this.queues.values()]);
    this.connections.clear();
  }
}
