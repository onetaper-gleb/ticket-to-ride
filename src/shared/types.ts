export type TrainColor =
  'red' | 'blue' | 'yellow' | 'green' | 'orange' | 'purple' | 'black' | 'white';
export type CardColor = TrainColor | 'wild';
export type Phase = 'setup' | 'action' | 'draw' | 'tickets' | 'tunnel' | 'finished';
export interface Card {
  id: string;
  color: CardColor;
}
export interface City {
  id: string;
  name: string;
  x: number;
  z: number;
}
export interface Edge {
  id: string;
  a: string;
  b: string;
  color: TrainColor | 'gray';
  length: number;
  tunnel: boolean;
  ferries: number;
  parallel: string | null;
  owner: number | null;
}
export interface Ticket {
  id: string;
  a: string;
  b: string;
  points: number;
  long: boolean;
}
export interface Player {
  id: number;
  name: string;
  color: string;
  hand: Card[];
  tickets: Ticket[];
  ticketOptions: Ticket[];
  trainsRemaining: number;
  stationsRemaining: number;
  stations: string[];
  score: number;
}
export interface PublicPlayer {
  id: number;
  name: string;
  color: string;
  handCount: number;
  ticketCount: number;
  trainsRemaining: number;
  stationsRemaining: number;
  stations: string[];
  score: number;
  tickets?: Ticket[];
}
export interface GameEvent {
  id: number;
  turn: number;
  kind: 'draw' | 'claim' | 'station' | 'tickets' | 'tunnel' | 'turn' | 'finish' | 'setup' | 'pass';
  message: string;
  playerId?: number;
  edgeId?: string;
  cityId?: string;
}
export interface PendingTunnel {
  edgeId: string;
  color: CardColor;
  baseCards: Card[];
  revealed: Card[];
  extraCost: number;
}
export interface GameState {
  schemaVersion: 2;
  rulesVersion: string;
  seed: string;
  rng: number;
  revision: number;
  turn: number;
  round: number;
  playerCount: number;
  activePlayer: number;
  phase: Phase;
  drawsRemaining: number;
  players: Player[];
  cities: City[];
  edges: Edge[];
  deck: Card[];
  discard: Card[];
  market: Card[];
  ticketDeck: Ticket[];
  unusedTickets: Ticket[];
  pendingTunnel: PendingTunnel | null;
  finalTurnsRemaining: number | null;
  finalRoundTrigger: number | null;
  consecutivePasses: number;
  events: GameEvent[];
}
export interface PublicBoard {
  cities: City[];
  edges: Edge[];
  players: PublicPlayer[];
}
export interface Observation extends PublicBoard {
  schemaVersion: 2;
  rulesVersion: string;
  revision: number;
  turn: number;
  round: number;
  playerCount: number;
  activePlayer: number;
  phase: Phase;
  drawsRemaining: number;
  self: Player;
  market: Card[];
  deckCount: number;
  discardCount: number;
  ticketDeckCount: number;
  pendingTunnel: PendingTunnel | null;
  finalTurnsRemaining: number | null;
  finalRoundTrigger: number | null;
  events: GameEvent[];
}
export type GameCommand =
  | { type: 'chooseTickets'; ticketIds: string[] }
  | { type: 'draw'; source: 'deck' | number }
  | { type: 'drawTickets' }
  | { type: 'claim'; edgeId: string; cardIds: string[] }
  | { type: 'buildStation'; cityId: string; cardIds: string[] }
  | { type: 'resolveTunnel'; pay: boolean; cardIds?: string[] }
  | { type: 'pass' };
export interface Transition {
  state: GameState;
  events: GameEvent[];
  error?: string;
}
export interface ClaimOption {
  color: CardColor;
  cardIds: string[];
  wildCount: number;
}
export interface TicketProgress {
  ticket: Ticket;
  complete: boolean;
  stationRoutes: string[];
}
export interface Standing {
  playerId: number;
  name: string;
  color: string;
  score: number;
  routeScore: number;
  ticketScore: number;
  stationScore: number;
  expressScore: number;
  completedTickets: number;
  totalTickets: number;
  longestPath: number;
  stationRoutes: string[];
  winner: boolean;
  tickets: TicketProgress[];
}
export interface GameResult {
  standings: Standing[];
  finished: boolean;
}
export interface GameOptions {
  seed?: string;
  playerCount?: 2 | 3 | 4 | 5;
  playerName?: string;
}
export type BotDifficulty = 'easy' | 'normal';
export interface AppProps {
  sessionId: number;
  observation: Observation | null;
  result: GameResult | null;
  busy: boolean;
  error: string | null;
  canContinue: boolean;
  difficulty: BotDifficulty;
  tutorial: boolean;
  canContinueTutorial: boolean;
  onStartTutorial: () => void;
  onContinueTutorial: () => void;
  onStart: (options: GameOptions, difficulty: BotDifficulty) => void;
  onContinue: () => void;
  onCommand: (command: GameCommand) => void;
  onMenu: () => void;
  onClearError: () => void;
}
