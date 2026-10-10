import type {
  BotDifficulty,
  GameCommand,
  GameResult,
  Observation,
  TurnAcknowledgement,
} from '../shared/types';

export const NETWORK_PROTOCOL = 1 as const;
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
  | { type: 'endMatch'; confirmed: true }
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
      name: string;
      settings: RoomSettings;
    }
  | {
      type: 'join';
      requestId: string;
      protocol: typeof NETWORK_PROTOCOL;
      name: string;
      code: string;
    }
  | {
      type: 'resume';
      requestId: string;
      protocol: typeof NETWORK_PROTOCOL;
      credential: ResumeCredential;
    }
  | { type: 'room'; requestId: string; action: RoomAction }
  | { type: 'command'; envelope: CommandEnvelope }
  | { type: 'sync' }
  | { type: 'voice'; targetId: string; signal: VoiceSignal };
export interface CommandAck {
  commandId: string;
  accepted: boolean;
  revision: number;
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
  | { type: 'roomAck'; requestId: string }
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
}
export interface NetworkClientApi {
  getState(): NetworkClientState;
  subscribe(listener: () => void): () => void;
  create(name: string, settings: RoomSettings): void;
  join(name: string, code: string): void;
  reconnect(): void;
  roomAction(action: RoomAction): boolean;
  command(command: GameCommand | { type: 'endTurn' }, expectedRevision: number): boolean;
  clearError(): void;
  leave(): void;
  dispose(): void;
  sendVoice(targetId: string, signal: VoiceSignal): boolean;
  subscribeVoice(listener: (fromId: string, signal: VoiceSignal) => void): () => void;
}
