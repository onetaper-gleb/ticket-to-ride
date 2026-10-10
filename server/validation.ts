import type { ClientPacket, RoomSettings } from '../src/network/protocol';

const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const str = (x: unknown, max = 100): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
const bootstrapProof = (x: unknown): x is string =>
  typeof x === 'string' && /^[0-9a-f]{64}$/.test(x);
const integer = (x: unknown, min: number, max: number) =>
  typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const ids = (x: unknown, max: number) =>
  Array.isArray(x) && x.length <= max && x.every((v) => str(v, 100));
const keys = (x: Record<string, unknown>, allowed: string[]) =>
  Object.keys(x).every((k) => allowed.includes(k));
export const cleanName = (name: string) =>
  name
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .slice(0, 30) || 'Игрок';
export function validSettings(settings: unknown): settings is RoomSettings {
  return (
    record(settings) &&
    integer(settings.seats, 2, 5) &&
    ['easy', 'normal'].includes(settings.difficulty as string) &&
    integer(settings.turnSeconds, 30, 600) &&
    typeof settings.admissionOpen === 'boolean' &&
    Object.keys(settings).every((k) =>
      ['seats', 'difficulty', 'turnSeconds', 'admissionOpen'].includes(k),
    )
  );
}
function validCommand(command: unknown): boolean {
  if (!record(command)) return false;
  switch (command.type) {
    case 'endTurn':
    case 'pass':
    case 'drawTickets':
      return Object.keys(command).length === 1;
    case 'chooseTickets':
      return keys(command, ['type', 'ticketIds']) && ids(command.ticketIds, 4);
    case 'draw':
      return (
        keys(command, ['type', 'source']) &&
        (command.source === 'deck' || integer(command.source, 0, 4))
      );
    case 'claim':
      return (
        keys(command, ['type', 'edgeId', 'cardIds']) &&
        str(command.edgeId) &&
        ids(command.cardIds, 12)
      );
    case 'buildStation':
      return (
        keys(command, ['type', 'cityId', 'cardIds']) &&
        str(command.cityId) &&
        ids(command.cardIds, 3)
      );
    case 'resolveTunnel':
      return (
        keys(command, ['type', 'pay', 'cardIds']) &&
        typeof command.pay === 'boolean' &&
        (command.cardIds === undefined || ids(command.cardIds, 3))
      );
    default:
      return false;
  }
}
export function validPacket(packet: unknown): packet is ClientPacket {
  if (!record(packet)) return false;
  switch (packet.type) {
    case 'create':
      return (
        keys(packet, ['type', 'protocol', 'requestId', 'bootstrapSecret', 'name', 'settings']) &&
        packet.protocol === 1 &&
        str(packet.requestId) &&
        bootstrapProof(packet.bootstrapSecret) &&
        str(packet.name, 100) &&
        validSettings(packet.settings)
      );
    case 'join':
      return (
        keys(packet, ['type', 'protocol', 'requestId', 'bootstrapSecret', 'name', 'code']) &&
        packet.protocol === 1 &&
        str(packet.requestId) &&
        bootstrapProof(packet.bootstrapSecret) &&
        str(packet.name, 100) &&
        str(packet.code, 32)
      );
    case 'resume':
      return (
        keys(packet, ['type', 'protocol', 'requestId', 'credential']) &&
        packet.protocol === 1 &&
        str(packet.requestId) &&
        record(packet.credential) &&
        keys(packet.credential, ['roomId', 'memberId', 'secret']) &&
        str(packet.credential.roomId) &&
        str(packet.credential.memberId) &&
        str(packet.credential.secret, 256)
      );
    case 'sync':
      return keys(packet, ['type']);
    case 'room': {
      if (
        !keys(packet, ['type', 'requestId', 'roomId', 'revision', 'action']) ||
        !str(packet.requestId) ||
        !str(packet.roomId) ||
        !integer(packet.revision, 0, Number.MAX_SAFE_INTEGER) ||
        !record(packet.action)
      )
        return false;
      const a = packet.action;
      switch (a.type) {
        case 'start':
        case 'lobby':
        case 'leave':
          return keys(a, ['type']);
        case 'ready':
          return keys(a, ['type', 'ready']) && typeof a.ready === 'boolean';
        case 'seat':
          return keys(a, ['type', 'seatId']) && integer(a.seatId, 0, 4);
        case 'bot':
          return (
            keys(a, ['type', 'seatId', 'enabled']) &&
            integer(a.seatId, 0, 4) &&
            typeof a.enabled === 'boolean'
          );
        case 'pause':
          return keys(a, ['type', 'paused']) && typeof a.paused === 'boolean';
        case 'endMatch':
          return (
            keys(a, ['type', 'confirmed', 'matchId']) && str(a.matchId) && a.confirmed === true
          );
        case 'kick':
          return keys(a, ['type', 'memberId']) && str(a.memberId);
        case 'settings':
          return (
            keys(a, ['type', 'settings']) &&
            record(a.settings) &&
            Object.keys(a.settings).every((k) =>
              ['seats', 'difficulty', 'turnSeconds', 'admissionOpen'].includes(k),
            )
          );
        default:
          return false;
      }
    }
    case 'command': {
      const e = packet.envelope;
      return (
        keys(packet, ['type', 'envelope']) &&
        record(e) &&
        keys(e, [
          'matchId',
          'commandId',
          'turnId',
          'seatId',
          'revision',
          'controlEpoch',
          'command',
        ]) &&
        str(e.matchId) &&
        str(e.commandId) &&
        str(e.turnId) &&
        integer(e.seatId, 0, 4) &&
        integer(e.revision, 0, Number.MAX_SAFE_INTEGER) &&
        integer(e.controlEpoch, 0, Number.MAX_SAFE_INTEGER) &&
        validCommand(e.command)
      );
    }
    case 'voice': {
      if (
        !keys(packet, ['type', 'targetId', 'signal']) ||
        !str(packet.targetId) ||
        !record(packet.signal) ||
        !str(packet.signal.generation, 256)
      )
        return false;
      const signal = packet.signal;
      if (signal.type === 'leave') return keys(signal, ['type', 'generation']);
      if (signal.type === 'state')
        return (
          keys(signal, ['type', 'generation', 'enabled']) && typeof signal.enabled === 'boolean'
        );
      if (signal.type === 'description')
        return (
          keys(signal, ['type', 'generation', 'description']) &&
          record(signal.description) &&
          keys(signal.description, ['type', 'sdp']) &&
          ['offer', 'answer'].includes(signal.description.type as string) &&
          str(signal.description.sdp, 16000)
        );
      if (signal.type === 'candidate')
        return (
          keys(signal, ['type', 'generation', 'candidate']) &&
          (signal.candidate === null ||
            (record(signal.candidate) &&
              keys(signal.candidate, [
                'candidate',
                'sdpMid',
                'sdpMLineIndex',
                'usernameFragment',
              ]) &&
              typeof signal.candidate.candidate === 'string' &&
              signal.candidate.candidate.length <= 2000 &&
              (signal.candidate.sdpMid == null || str(signal.candidate.sdpMid, 100)) &&
              (signal.candidate.sdpMLineIndex == null ||
                integer(signal.candidate.sdpMLineIndex, 0, 100)) &&
              (signal.candidate.usernameFragment == null ||
                str(signal.candidate.usernameFragment, 256))))
        );
      return false;
    }
    default:
      return false;
  }
}
