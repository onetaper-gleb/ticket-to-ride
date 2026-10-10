import type { GameState, TurnAcknowledgement } from '../src/shared/types';
import type { RoomView, TurnAuthority } from '../src/network/protocol';

export interface PrivateIdentity {
  hash: string;
  lease: number;
}
export interface StoredRoom {
  view: RoomView;
  identities: Record<string, PrivateIdentity>;
  epochs: number[];
  game: GameState | null;
  authority: TurnAuthority | null;
  turnSerial: number;
  pending: (TurnAcknowledgement & { seatId: number }) | null;
  remainingMs: number | null;
}
export interface StoredReply {
  scope: 'game' | 'room' | 'bootstrap';
  owner: string;
  actor: string;
  id: string;
  payload: string;
  reply: string;
}
export const copy = <T>(value: T): T => structuredClone(value);
export const gameReplyOwner = (roomId: string, matchId: string) =>
  JSON.stringify([roomId, matchId]);
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
