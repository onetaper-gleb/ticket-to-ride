import {
  NETWORK_PROTOCOL,
  TERMINAL_RESUME_ERRORS,
  type ClientPacket,
  type CommandEnvelope,
  type NetworkClientApi,
  type NetworkClientState,
  type ResumeCredential,
  type RoomSnapshot,
  type ServerPacket,
} from './protocol';

export type NetworkSocket = Pick<
  WebSocket,
  'readyState' | 'send' | 'close' | 'onopen' | 'onmessage' | 'onclose' | 'onerror'
>;
export interface NetworkClientOptions {
  url?: string;
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  socketFactory?: (url: string) => NetworkSocket;
  reconnectDelays?: readonly number[];
  requestTimeoutMs?: number;
  makeId?: () => string;
}
type Handshake = Extract<ClientPacket, { type: 'create' | 'join' | 'resume' }>;
type RoomRequest = Extract<ClientPacket, { type: 'room' }>;

function browserStorage() {
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}
function credentialValid(value: unknown): value is ResumeCredential {
  if (!value || typeof value !== 'object') return false;
  const item = value as ResumeCredential;
  return [item.roomId, item.memberId, item.secret].every(
    (entry) => typeof entry === 'string' && entry.length > 0,
  );
}
function journalCommandValid(value: unknown): value is CommandEnvelope {
  if (!value || typeof value !== 'object') return false;
  const envelope = value as CommandEnvelope;
  if (
    ![envelope.matchId, envelope.commandId, envelope.turnId].every(
      (item) => typeof item === 'string' && item.length > 0,
    ) ||
    ![envelope.seatId, envelope.revision, envelope.controlEpoch].every(
      (item) => Number.isSafeInteger(item) && item >= 0,
    ) ||
    envelope.seatId > 4 ||
    !envelope.command ||
    typeof envelope.command !== 'object'
  )
    return false;
  const ids = (items: unknown): items is string[] =>
    Array.isArray(items) && items.every((item) => typeof item === 'string');
  const command = envelope.command;
  switch (command.type) {
    case 'chooseTickets':
      return ids(command.ticketIds);
    case 'draw':
      return (
        command.source === 'deck' ||
        (Number.isInteger(command.source) && command.source >= 0 && command.source <= 4)
      );
    case 'claim':
      return typeof command.edgeId === 'string' && ids(command.cardIds);
    case 'buildStation':
      return typeof command.cityId === 'string' && ids(command.cardIds);
    case 'resolveTunnel':
      return (
        typeof command.pay === 'boolean' && (command.cardIds === undefined || ids(command.cardIds))
      );
    case 'drawTickets':
    case 'pass':
    case 'endTurn':
      return true;
    default:
      return false;
  }
}

export function createNetworkClient(options: NetworkClientOptions = {}): NetworkClientApi {
  const url = options.url ?? 'ws://127.0.0.1:8787';
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const storageKey = `europe-network-v1:${url}`;
  const makeId = options.makeId ?? (() => crypto.randomUUID());
  const factory = options.socketFactory ?? ((address: string) => new WebSocket(address));
  const delays = options.reconnectDelays ?? [250, 500, 1000, 2000, 4000, 8000];
  const timeout = options.requestTimeoutMs ?? 12_000;
  const listeners = new Set<() => void>();
  const voiceListeners = new Set<
    (fromId: string, signal: Extract<ServerPacket, { type: 'voice' }>['signal']) => void
  >();
  let state: NetworkClientState = {
    connection: 'idle',
    snapshot: null,
    pendingCommand: null,
    pendingRequest: null,
    error: null,
  };
  let credential: ResumeCredential | null = null;
  let pendingRoom: RoomRequest | null = null;
  let handshake: Handshake | null = null;
  let socket: NetworkSocket | null = null;
  let generation = 0;
  let attempt = 0;
  let disposed = false;
  let authenticated = false;
  let acknowledgedRevision: number | null = null;
  let acknowledgedRoomRevision: number | null = null;
  let acknowledgedRoomRequestRevision: number | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let responseTimer: ReturnType<typeof setTimeout> | null = null;
  try {
    const saved: unknown = JSON.parse(storage?.getItem(storageKey) ?? 'null');
    if (saved && typeof saved === 'object') {
      const record = saved as {
        credential?: unknown;
        roomId?: string;
        memberId?: string;
        pendingCommand?: unknown;
        pendingRoom?: RoomRequest;
      };
      if (
        credentialValid(record.credential) &&
        record.roomId === record.credential.roomId &&
        record.memberId === record.credential.memberId
      ) {
        credential = record.credential;
        state.pendingCommand = journalCommandValid(record.pendingCommand)
          ? record.pendingCommand
          : null;
        pendingRoom =
          record.pendingRoom?.type === 'room' &&
          record.pendingRoom.roomId === credential.roomId &&
          typeof record.pendingRoom.requestId === 'string' &&
          Number.isSafeInteger(record.pendingRoom.revision)
            ? record.pendingRoom
            : null;
        state.pendingRequest = pendingRoom?.requestId ?? null;
      }
    }
  } catch {
    // An unavailable tab journal does not expose credentials or block a new room.
  }
  function persist(): boolean {
    try {
      if (credential) {
        if (!storage) throw new Error('Storage unavailable');
        storage.setItem(
          storageKey,
          JSON.stringify({
            credential,
            roomId: credential.roomId,
            memberId: credential.memberId,
            pendingCommand: state.pendingCommand,
            pendingRoom,
          }),
        );
      } else storage?.removeItem(storageKey);
      return true;
    } catch {
      publish({
        error:
          'Браузер не разрешает обновить сохранённый вход в комнату. Проверьте доступ к хранилищу.',
      });
      return false;
    }
  }
  function publish(update: Partial<NetworkClientState>) {
    if (disposed) return;
    state = { ...state, ...update };
    for (const listener of listeners) listener();
  }
  function clearTimers() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (responseTimer) clearTimeout(responseTimer);
    reconnectTimer = responseTimer = null;
  }
  function detach() {
    generation++;
    authenticated = false;
    if (!socket) return;
    const previous = socket;
    socket = null;
    previous.onopen = previous.onmessage = previous.onclose = previous.onerror = null;
    previous.close();
  }
  function send(packet: ClientPacket): boolean {
    if (!socket || socket.readyState !== 1) return false;
    try {
      socket.send(JSON.stringify(packet));
      return true;
    } catch {
      return false;
    }
  }
  function armResponseTimer() {
    if (responseTimer) clearTimeout(responseTimer);
    responseTimer = setTimeout(() => {
      responseTimer = null;
      detach();
      recover('Сервер не подтвердил запрос. Восстанавливаем соединение.');
    }, timeout);
  }
  function recover(message: string) {
    if (disposed) return;
    if (responseTimer) clearTimeout(responseTimer);
    responseTimer = null;
    authenticated = false;
    if (!credential || attempt >= delays.length) {
      handshake = null;
      publish({
        connection: 'disconnected',
        pendingRequest: pendingRoom?.requestId ?? null,
        error: message,
      });
      return;
    }
    const delay = delays[attempt++]!;
    publish({ connection: 'reconnecting', error: message });
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect(
        {
          type: 'resume',
          requestId: makeId(),
          protocol: NETWORK_PROTOCOL,
          credential: credential!,
        },
        true,
      );
    }, delay);
  }
  function fresh(snapshot: RoomSnapshot): boolean {
    const previous = state.snapshot;
    if (!previous || snapshot.room.id !== previous.room.id) return true;
    if (snapshot.room.revision < previous.room.revision) return false;
    if (snapshot.authority?.matchId === previous.authority?.matchId) {
      if ((snapshot.observation?.revision ?? -1) < (previous.observation?.revision ?? -1))
        return false;
      if (
        snapshot.authority?.turnId === previous.authority?.turnId &&
        snapshot.authority?.activeSeat === previous.authority?.activeSeat &&
        (snapshot.authority?.controlEpoch ?? -1) < (previous.authority?.controlEpoch ?? -1)
      )
        return false;
    }
    return true;
  }
  function applySnapshot(snapshot: RoomSnapshot) {
    if (
      !credential ||
      snapshot.room.id !== credential.roomId ||
      snapshot.memberId !== credential.memberId ||
      !fresh(snapshot)
    )
      return;
    let pendingCommand = state.pendingCommand;
    if (
      acknowledgedRevision !== null &&
      acknowledgedRoomRevision !== null &&
      snapshot.room.revision >= acknowledgedRoomRevision &&
      (snapshot.observation?.revision ?? -1) >= acknowledgedRevision
    ) {
      pendingCommand = null;
      acknowledgedRevision = null;
      acknowledgedRoomRevision = null;
      if (responseTimer) clearTimeout(responseTimer);
      responseTimer = null;
    }
    if (
      acknowledgedRoomRequestRevision !== null &&
      snapshot.room.revision >= acknowledgedRoomRequestRevision
    ) {
      pendingRoom = null;
      acknowledgedRoomRequestRevision = null;
      if (responseTimer) clearTimeout(responseTimer);
      responseTimer = null;
    }
    publish({ snapshot, pendingCommand, pendingRequest: pendingRoom?.requestId ?? null });
    persist();
  }
  function receive(packet: ServerPacket) {
    if (packet.type === 'welcome') {
      if (
        !handshake ||
        packet.requestId !== handshake.requestId ||
        packet.protocol !== NETWORK_PROTOCOL ||
        !credentialValid(packet.credential)
      )
        return;
      if (
        credential &&
        (credential.roomId !== packet.credential.roomId ||
          credential.memberId !== packet.credential.memberId)
      )
        return;
      credential = packet.credential;
      handshake = null;
      authenticated = true;
      attempt = 0;
      if (responseTimer) clearTimeout(responseTimer);
      responseTimer = null;
      publish({
        connection: 'connected',
        pendingRequest: pendingRoom?.requestId ?? null,
        error: null,
      });
      applySnapshot(packet.snapshot);
      if (!persist()) return;
      const member = packet.snapshot.room.members.find(
        (item) => item.id === packet.snapshot.memberId,
      );
      if (
        state.pendingCommand &&
        (state.pendingCommand.matchId !== packet.snapshot.authority?.matchId ||
          state.pendingCommand.seatId !== member?.seatId)
      ) {
        publish({
          pendingCommand: null,
          error: 'Неподтверждённое действие относится к прежнему матчу или месту и не отправлено.',
        });
        acknowledgedRevision = null;
        acknowledgedRoomRevision = null;
        persist();
      }
      if (state.pendingCommand) {
        send({ type: 'command', envelope: state.pendingCommand });
        armResponseTimer();
      } else if (pendingRoom) {
        send(pendingRoom);
        armResponseTimer();
      }
      return;
    }
    if (!authenticated) return;
    if (packet.type === 'snapshot') applySnapshot(packet.snapshot);
    if (packet.type === 'ack' && packet.ack.commandId === state.pendingCommand?.commandId) {
      if (packet.ack.accepted) {
        acknowledgedRevision = packet.ack.revision;
        acknowledgedRoomRevision = packet.ack.roomRevision;
        if (
          (state.snapshot?.room.revision ?? -1) >= packet.ack.roomRevision &&
          (state.snapshot?.observation?.revision ?? -1) >= packet.ack.revision
        ) {
          acknowledgedRevision = null;
          acknowledgedRoomRevision = null;
          publish({ pendingCommand: null, error: null });
          if (responseTimer) clearTimeout(responseTimer);
          responseTimer = null;
        }
        send({ type: 'sync' });
      } else {
        acknowledgedRevision = null;
        acknowledgedRoomRevision = null;
        publish({ pendingCommand: null, error: packet.ack.message ?? 'Сервер отклонил действие.' });
        if (responseTimer) clearTimeout(responseTimer);
        responseTimer = null;
        send({ type: 'sync' });
      }
      persist();
    }
    if (packet.type === 'roomAck' && packet.requestId === pendingRoom?.requestId) {
      acknowledgedRoomRequestRevision = packet.roomRevision;
      if ((state.snapshot?.room.revision ?? -1) >= packet.roomRevision) {
        pendingRoom = null;
        acknowledgedRoomRequestRevision = null;
        publish({ pendingRequest: null, error: null });
        if (responseTimer) clearTimeout(responseTimer);
        responseTimer = null;
      }
      persist();
      send({ type: 'sync' });
    }
    if (packet.type === 'error') {
      if (packet.requestId && packet.requestId !== pendingRoom?.requestId) return;
      if (packet.requestId) {
        pendingRoom = null;
        acknowledgedRoomRequestRevision = null;
        publish({ pendingRequest: null, error: packet.message });
        if (responseTimer) clearTimeout(responseTimer);
        responseTimer = null;
        persist();
      } else publish({ error: packet.message });
    }
    if (packet.type === 'kicked') {
      credential = null;
      pendingRoom = null;
      acknowledgedRevision = null;
      acknowledgedRoomRevision = null;
      acknowledgedRoomRequestRevision = null;
      clearTimers();
      detach();
      persist();
      publish({
        connection: 'kicked',
        snapshot: null,
        pendingCommand: null,
        pendingRequest: null,
        error: packet.message,
      });
    }
    if (packet.type === 'voice')
      for (const listener of voiceListeners) listener(packet.fromId, packet.signal);
  }
  function connect(next: Handshake, reconnecting = false) {
    if (disposed) return;
    clearTimers();
    detach();
    handshake = next;
    const token = generation;
    publish({
      connection: reconnecting ? 'reconnecting' : 'connecting',
      pendingRequest: pendingRoom?.requestId ?? next.requestId,
      error: null,
    });
    try {
      socket = factory(url);
    } catch {
      recover('Не удалось подключиться к серверу. Проверьте адрес и нажмите «Повторить».');
      return;
    }
    const current = socket;
    current.onopen = () => {
      if (disposed || token !== generation) return;
      if (handshake) send(handshake);
      armResponseTimer();
    };
    current.onmessage = (event) => {
      if (disposed || token !== generation || typeof event.data !== 'string') return;
      try {
        const packet = JSON.parse(event.data) as ServerPacket;
        if (packet?.type === 'error' && handshake && packet.requestId === handshake.requestId) {
          const rejectedResume =
            handshake.type === 'resume' &&
            TERMINAL_RESUME_ERRORS.some((code) => code === packet.code);
          if (rejectedResume) {
            credential = null;
            pendingRoom = null;
            acknowledgedRevision =
              acknowledgedRoomRevision =
              acknowledgedRoomRequestRevision =
                null;
            persist();
          }
          handshake = null;
          clearTimers();
          detach();
          publish({
            connection: 'disconnected',
            pendingRequest: pendingRoom?.requestId ?? null,
            ...(rejectedResume ? { snapshot: null, pendingCommand: null } : {}),
            error: packet.message,
          });
          return;
        }
        receive(packet);
      } catch {
        publish({ error: 'Сервер прислал непонятный ответ.' });
      }
    };
    current.onerror = () => {
      if (disposed || token !== generation) return;
      publish({ error: 'Соединение с сервером прервалось.' });
    };
    current.onclose = () => {
      if (disposed || token !== generation) return;
      detach();
      recover('Связь потеряна. Ваше место сохраняется; ждём восстановления.');
    };
    armResponseTimer();
  }
  const api: NetworkClientApi = {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    subscribeVoice(listener) {
      voiceListeners.add(listener);
      return () => voiceListeners.delete(listener);
    },
    create(name, settings) {
      if (
        disposed ||
        credential ||
        state.connection === 'connecting' ||
        state.connection === 'reconnecting'
      )
        return;
      connect({
        type: 'create',
        requestId: makeId(),
        protocol: NETWORK_PROTOCOL,
        name: name.trim(),
        settings,
      });
    },
    join(name, code) {
      if (
        disposed ||
        credential ||
        state.connection === 'connecting' ||
        state.connection === 'reconnecting'
      )
        return;
      connect({
        type: 'join',
        requestId: makeId(),
        protocol: NETWORK_PROTOCOL,
        name: name.trim(),
        code: code.trim().toUpperCase(),
      });
    },
    reconnect() {
      if (disposed) return;
      attempt = 0;
      if (credential)
        connect(
          { type: 'resume', requestId: makeId(), protocol: NETWORK_PROTOCOL, credential },
          true,
        );
      else publish({ connection: 'idle', error: null, pendingRequest: null });
    },
    roomAction(action, expected) {
      const snapshot = state.snapshot;
      if (
        disposed ||
        !authenticated ||
        state.connection !== 'connected' ||
        state.pendingCommand ||
        state.pendingRequest ||
        !snapshot ||
        snapshot.room.id !== expected.roomId ||
        snapshot.room.revision !== expected.revision ||
        (action.type === 'endMatch' && snapshot.authority?.matchId !== action.matchId)
      )
        return false;
      const packet: RoomRequest = {
        type: 'room',
        requestId: makeId(),
        roomId: expected.roomId,
        revision: expected.revision,
        action: structuredClone(action),
      };
      pendingRoom = packet;
      publish({ pendingRequest: packet.requestId, error: null });
      if (!persist()) {
        pendingRoom = null;
        publish({
          pendingRequest: null,
          error: 'Запрос не отправлен: браузер не разрешает сохранить его для восстановления.',
        });
        return false;
      }
      if (!send(packet)) {
        detach();
        recover('Запрос ещё не подтверждён. Восстанавливаем соединение.');
      } else armResponseTimer();
      return true;
    },
    command(command, expected) {
      const snapshot = state.snapshot;
      const authority = snapshot?.authority;
      const member = snapshot?.room.members.find((item) => item.id === snapshot.memberId);
      if (
        disposed ||
        !authenticated ||
        state.connection !== 'connected' ||
        state.pendingCommand ||
        state.pendingRequest ||
        !snapshot?.canAct ||
        !authority ||
        !member ||
        authority.revision !== expected.revision ||
        authority.matchId !== expected.matchId ||
        member.seatId !== expected.seatId ||
        authority.turnId !== expected.turnId ||
        authority.controlEpoch !== expected.controlEpoch ||
        !!snapshot.pendingTurn !== (command.type === 'endTurn')
      )
        return false;
      const envelope: CommandEnvelope = {
        matchId: expected.matchId,
        seatId: expected.seatId,
        commandId: makeId(),
        revision: expected.revision,
        turnId: expected.turnId,
        controlEpoch: expected.controlEpoch,
        command: structuredClone(command),
      };
      publish({ pendingCommand: envelope, error: null });
      if (!persist()) {
        publish({
          pendingCommand: null,
          error: 'Действие не отправлено: браузер не разрешает сохранить его для восстановления.',
        });
        return false;
      }
      if (!send({ type: 'command', envelope })) {
        detach();
        recover('Действие ещё не подтверждено. Восстанавливаем соединение.');
      } else armResponseTimer();
      return true;
    },
    clearError() {
      publish({ error: null });
    },
    leave(expectedRoomId) {
      if (disposed || (expectedRoomId && credential?.roomId !== expectedRoomId)) return;
      if (authenticated && state.snapshot)
        send({
          type: 'room',
          requestId: makeId(),
          roomId: state.snapshot.room.id,
          revision: state.snapshot.room.revision,
          action: { type: 'leave' },
        });
      credential = null;
      pendingRoom = null;
      handshake = null;
      acknowledgedRevision = null;
      acknowledgedRoomRevision = null;
      acknowledgedRoomRequestRevision = null;
      clearTimers();
      detach();
      const forgotten = persist();
      publish({
        connection: 'idle',
        snapshot: null,
        pendingCommand: null,
        pendingRequest: null,
        error: forgotten ? null : 'Не удалось удалить сохранённый вход из хранилища браузера.',
      });
    },
    sendVoice(targetId, signal) {
      return (
        !disposed &&
        authenticated &&
        state.connection === 'connected' &&
        send({ type: 'voice', targetId, signal })
      );
    },
    dispose() {
      if (disposed) return;
      clearTimers();
      detach();
      disposed = true;
      listeners.clear();
      voiceListeners.clear();
    },
  };
  if (credential) api.reconnect();
  return api;
}
