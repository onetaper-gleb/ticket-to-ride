import type { District } from '../shared/types';

// Presentation intents only. App translates these into core-validated commands.
export type TableInteraction = {
  kind: 'station' | 'edge' | 'train' | 'market' | 'deck' | 'card' | 'control' | 'objective';
  id: string;
};
export type TableControl = {
  id: string;
  label: string;
  enabled: boolean;
  danger?: boolean;
  placement?: 'paper' | 'dock' | 'bell';
};
export type TableGoal = {
  id: District;
  label: string;
  progress: string;
  selected: boolean;
  enabled: boolean;
  completed?: boolean;
};
export type TableView = {
  headline: string;
  notice: string;
  detailLines: string[];
  controls: TableControl[];
  goals: TableGoal[];
  selectedTrainId: string | null;
  routeStationIds: string[];
  enabledMarketIndices: number[];
  deckEnabled: boolean;
  discardEnabled: boolean;
  enabledEdgeIds: string[];
  enabledTrainIds: string[];
  highlightedDistrict?: District | null;
};
