export type CardColor = 'red' | 'blue' | 'yellow' | 'green' | 'wild';
export type District = 'harbor' | 'old-town' | 'industrial' | 'garden';
export type Phase = 'setup' | 'action' | 'draw' | 'discard' | 'orders' | 'finished';
export interface Card {
  id: string;
  color: CardColor;
}
export interface Group {
  id: string;
  district: District;
  priority: boolean;
}
export interface Station {
  id: string;
  name: string;
  x: number;
  z: number;
  height: number;
  floodRound: number | null;
  district: District | null;
  safe: boolean;
  flooded: boolean;
  groups: Group[];
}
export interface Edge {
  id: string;
  a: string;
  b: string;
  color: Exclude<CardColor, 'wild'> | 'gray';
  cost: number;
  open: boolean;
  initialOpen: boolean;
  builder: number | null;
  credited: boolean;
}
export interface TrainOrder {
  mode: 'idle' | 'evacuate' | 'position' | 'return';
  destination: string | null;
  returnTo: string | null;
  repeat: boolean;
  confirmRisk?: boolean;
}
export interface Train {
  id: string;
  playerId: number;
  stationId: string;
  cargo: Group[];
  cargoEdges: string[];
  order: TrainOrder;
  disabled: boolean;
  expressRound: number | null;
}
export interface Player {
  id: number;
  name: string;
  color: string;
  hand: Card[];
  objectiveOptions: District[];
  objectives: District[];
  delivered: Group[];
  repairScore: number;
  score: number;
}
export interface PublicPlayer {
  id: number;
  name: string;
  color: string;
  handCount: number;
  delivered: Group[];
  repairScore: number;
  score: number;
}
export interface GameEvent {
  id: number;
  round: number;
  kind:
    | 'draw'
    | 'repair'
    | 'move'
    | 'load'
    | 'deliver'
    | 'flood'
    | 'loss'
    | 'round'
    | 'finish'
    | 'order'
    | 'express'
    | 'setup'
    | 'pass';
  message: string;
  playerId?: number;
  trainId?: string;
  stationId?: string;
  from?: string;
  to?: string;
}
export interface GameState {
  schemaVersion: 1;
  rulesVersion: string;
  seed: string;
  rng: number;
  revision: number;
  round: number;
  playerCount: number;
  activePlayer: number;
  phase: Phase;
  drawsRemaining: number;
  players: Player[];
  trains: Train[];
  stations: Station[];
  edges: Edge[];
  deck: Card[];
  discard: Card[];
  market: Card[];
  lostGroups: Group[];
  events: GameEvent[];
  initiative: number[];
  turnOrder: number[];
  turnIndex: number;
  setupIndex: number;
  totalGroups: number;
}
export interface PublicBoard {
  round: number;
  stations: Station[];
  edges: Edge[];
  trains: Train[];
}
export interface Observation extends PublicBoard {
  schemaVersion: 1;
  rulesVersion: string;
  revision: number;
  playerCount: number;
  activePlayer: number;
  phase: Phase;
  drawsRemaining: number;
  players: PublicPlayer[];
  self: Player;
  market: Card[];
  deckCount: number;
  discardCount: number;
  lostGroups: Group[];
  events: GameEvent[];
  initiative: number[];
  turnOrder: number[];
  totalGroups: number;
}
export type GameCommand =
  | { type: 'chooseObjectives'; districts: District[] }
  | { type: 'draw'; source: 'deck' | number }
  | { type: 'repair'; edgeId: string }
  | { type: 'express'; trainId: string }
  | { type: 'pass' }
  | { type: 'discard'; cardId: string }
  | { type: 'order'; trainId: string; order: TrainOrder }
  | { type: 'endTurn' };
export interface Transition {
  state: GameState;
  events: GameEvent[];
  error?: string;
}
export interface RoutePreview {
  path: string[];
  arrivalRound: number | null;
  pickupRound: number | null;
  deliveryRound: number | null;
  safe: boolean;
  reason: string | null;
}
export interface GameOptions {
  seed?: string;
  playerCount?: 2 | 3 | 4;
  playerName?: string;
}
export interface Standing {
  playerId: number;
  name: string;
  color: string;
  score: number;
  delivered: number;
  priority: number;
  objectivesCompleted: number;
  repairScore: number;
  winner: boolean;
}
export interface GameResult {
  standings: Standing[];
  saved: number;
  lost: number;
  stranded: number;
  total: number;
  cityOutcome: 'excellent' | 'partial' | 'failure';
  finished: boolean;
}
export type BotDifficulty = 'easy' | 'normal';

// Fixed public API: src/core/index.ts exports createGame(options), applyCommand(state,command),
// getObservation(state,playerId), getLegalCommands(observation), previewOrder(board,train,order),
// getGameResult(stateOrObservation). No caller duplicates legality or routing.
// src/bots/index.ts exports chooseBotCommand(observation,difficulty='normal'):GameCommand.
// src/ui/App.tsx default export consumes AppProps below; session integration stays with root.
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
