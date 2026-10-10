export type TableInteraction = {
  kind: 'station' | 'edge' | 'market' | 'deck' | 'card' | 'control' | 'objective';
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
  id: string;
  label: string;
  progress: string;
  selected: boolean;
  enabled: boolean;
  completed?: boolean;
  points: number;
  long?: boolean;
};
export type TableView = {
  rulesOpen?: boolean;
  rulesIllustrations?: Array<{ id: string; caption: string; alt: string }>;
  awaitingHandoff?: boolean;
  headline: string;
  notice: string;
  detailLines: string[];
  controls: TableControl[];
  goals: TableGoal[];
  routeStationIds: string[];
  enabledMarketIndices: number[];
  deckEnabled: boolean;
  enabledEdgeIds: string[];
  selectedCardIds: string[];
  revealedCards?: import('../shared/types').Card[];
};
