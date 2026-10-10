import type {
  BotDifficulty,
  GameCommand,
  GameResult,
  Observation,
  TurnAcknowledgement,
} from '../shared/types';

export const NETWORK_PROTOCOL = 1 as const;
export const TERMINAL_RESUME_ERRORS = [
  'ROOM_NOT_FOUND',
  'MEMBER_REMOVED',
  'RESUME_INVALID',
] as const;
export type SeatCount = 2 | 3 | 4 | 5;
export interface RoomSettings {
  seats: SeatCount;
  difficulty: BotDifficulty;
  turnSeconds: number;
  admissionOpen: boolean;
}
export interface RoomMember {
  id: string;
  name: string;
  seatId: number;
  connected: boolean;
  ready: boolean;
  control: 'human' | 'bot';
  controlEpoch: number;
  returnPending: boolean;
}
export interface RoomSeat {
  id: number;
  kind: 'open' | 'human' | 'bot';
  memberId: string | null;
  name: string;
}
export interface RoomView {
  id: string;
  code: string;
  revision: number;
  hostId: string;
  status: 'lobby' | 'playing' | 'finished';
  settings: RoomSettings;
  members: RoomMember[];
  seats: RoomSeat[];
  paused: boolean;
  pauseReason: 'host' | 'disconnected' | null;
}
export interface TurnAuthority {
  matchId: string;
  turnId: string;
  revision: number;
  activeSeat: number;
  controlEpoch: number;
  deadline: number | null;
  awaitingEnd: boolean;
}
export interface RoomSnapshot {
  room: RoomView;
  memberId: string;
  authority: TurnAuthority | null;
  observation: Observation | null;
  result: GameResult | null;
  pendingTurn: TurnAcknowledgement | null;
  canAct: boolean;
}
/** Private to this member. Never include this object in RoomView or broadcasts. */
export interface ResumeCredential {
  roomId: string;
  memberId: string;
  secret: string;
}
export type RoomAction =
  | { type: 'ready'; ready: boolean }
  | { type: 'seat'; seatId: number }
  | { type: 'settings'; settings: Partial<RoomSettings> }
  | { type: 'bot'; seatId: number; enabled: boolean }
  | { type: 'start' }
  | { type: 'pause'; paused: boolean }
  | { type: 'kick'; memberId: string }
  | { type: 'endMatch'; matchId: string; confirmed: true }
  | { type: 'lobby' }
  | { type: 'leave' };
export interface CommandEnvelope {
  matchId: string;
  seatId: number;
  commandId: string;
  revision: number;
  turnId: string;
  controlEpoch: number;
  command: GameCommand | { type: 'endTurn' };
}
export type ExpectedCommand = Pick<
  CommandEnvelope,
  'matchId' | 'seatId' | 'revision' | 'turnId' | 'controlEpoch'
>;
export interface ExpectedRoom {
  roomId: string;
  revision: number;
}
export type VoiceSignal =
  | { type: 'description'; generation: string; description: RTCSessionDescriptionInit }
  | { type: 'candidate'; generation: string; candidate: RTCIceCandidateInit | null }
  | { type: 'state'; generation: string; enabled: boolean }
  | { type: 'leave'; generation: string };
export type ClientPacket =
  | {
      type: 'create';
      requestId: string;
      protocol: typeof NETWORK_PROTOCOL;
      /** Private 256-bit per-attempt proof. Persist before sending; never publish in RoomView. */
      bootstrapSecret: string;
      name: string;
      settings: RoomSettings;
    }
  | {
      type: 'join';
      requestId: string;
      protocol: typeof NETWORK_PROTOCOL;
      bootstrapSecret: string;
      name: string;
      code: string;
    }
  | {
      type: 'resume';
      requestId: string;
      protocol: typeof NETWORK_PROTOCOL;
      credential: ResumeCredential;
    }
  | { type: 'room'; requestId: string; roomId: string; revision: number; action: RoomAction }
  | { type: 'command'; envelope: CommandEnvelope }
  | { type: 'sync' }
  | { type: 'voice'; targetId: string; signal: VoiceSignal };
export interface CommandAck {
  commandId: string;
  accepted: boolean;
  revision: number;
  roomRevision: number;
  code?: string;
  message?: string;
}
export type ServerPacket =
  | {
      type: 'welcome';
      requestId: string;
      protocol: typeof NETWORK_PROTOCOL;
      credential: ResumeCredential;
      snapshot: RoomSnapshot;
    }
  | { type: 'snapshot'; snapshot: RoomSnapshot }
  | { type: 'ack'; ack: CommandAck }
  | { type: 'roomAck'; requestId: string; roomRevision: number }
  | { type: 'error'; requestId?: string; code: string; message: string }
  | { type: 'kicked'; message: string }
  | { type: 'voice'; fromId: string; signal: VoiceSignal };
export type ConnectionStatus =
  'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected' | 'kicked';
export interface NetworkClientState {
  connection: ConnectionStatus;
  snapshot: RoomSnapshot | null;
  pendingCommand: CommandEnvelope | null;
  pendingRequest: string | null;
  error: string | null;
  /** Accepted ack plus its authoritative snapshot have both arrived. UI may clear its draft. */
  confirmedCommandId?: string | null;
}
export interface NetworkClientApi {
  getState(): NetworkClientState;
  subscribe(listener: () => void): () => void;
  create(name: string, settings: RoomSettings): void;
  join(name: string, code: string): void;
  reconnect(): void;
  roomAction(action: RoomAction, expected: ExpectedRoom): boolean;
  command(command: GameCommand | { type: 'endTurn' }, expected: ExpectedCommand): boolean;
  clearError(): void;
  leave(expectedRoomId?: string): void;
  dispose(): void;
  sendVoice(targetId: string, signal: VoiceSignal): boolean;
  subscribeVoice(listener: (fromId: string, signal: VoiceSignal) => void): () => void;
}
